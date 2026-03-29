"""
CouncilDebateEngine — orchestrates multi-agent debate rounds.

Design principles:
1. Compaction-proof: all context is read from the database, never from in-memory
   session state. Agents can resume after a server restart.
2. Parallel generation: all agents in a round are called concurrently up to
   the timeout defined in settings.debate_parallel_timeout.
3. Smart participation: agents don't all respond every round — they respond
   when mentioned, when they disagree, or when they haven't spoken recently.
4. Insight extraction: after each response, a lightweight memory entry is
   persisted so the agent builds self-knowledge over time.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.engine.router import model_router
from app.models.agent import Agent
from app.models.council import AgentMemory, Council, Message, Participant

logger = logging.getLogger(__name__)


class CouncilDebateEngine:

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_round(
        self,
        council_id: UUID,
        db: AsyncSession,
        redis=None,
    ) -> list[Message]:
        """
        Execute one debate round:
        1. Load council + participants + recent messages from DB
        2. Decide which agents should respond this round
        3. Build prompts and call models in parallel
        4. Persist responses and broadcast via Redis
        5. Extract and persist insights
        Returns the list of new Message objects created.
        """
        # Load council with participants
        result = await db.execute(
            select(Council)
            .options(
                selectinload(Council.participants).selectinload(Participant.agent)
            )
            .where(Council.id == council_id)
        )
        council = result.scalar_one_or_none()
        if council is None:
            raise ValueError(f"Council {council_id} not found")

        if council.status != "active":
            logger.info("Council %s is not active (status=%s), skipping round", council_id, council.status)
            return []

        # Load recent messages
        recent_messages = await self._load_recent_messages(council_id, db)
        agents = [p.agent for p in council.participants]

        # Decide responders
        responders = [
            agent for agent in agents
            if await self.should_agent_respond(agent, recent_messages)
        ]

        if not responders:
            logger.info("No agents chose to respond in this round for council %s", council_id)
            return []

        # Generate responses in parallel
        new_messages = await self._generate_parallel(
            council, responders, recent_messages, db
        )

        # Broadcast each new message via Redis pub/sub
        if redis and new_messages:
            await self._broadcast_messages(council_id, new_messages, redis)

        # Extract insights asynchronously (fire-and-forget to not block round)
        for agent, msg in zip(responders, new_messages):
            asyncio.create_task(
                self.extract_and_persist_insight(agent, msg, db)
            )

        return new_messages

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    async def build_agent_prompt(
        self,
        agent: Agent,
        council: Council,
        recent_messages: list[Message],
        agent_memory: list[AgentMemory],
    ) -> list[dict]:
        """
        Construct the message list for this agent's LLM call.

        Structure:
            [system]        agent's base system_prompt + self_model from memory
            [user]          council topic and context framing
            [assistant/user] recent conversation turns
            [user]          instruction to respond
        """
        # Build system content
        self_model_entries = [
            m for m in agent_memory if m.memory_type == "self_model"
        ]
        self_model_text = ""
        if self_model_entries:
            latest = sorted(self_model_entries, key=lambda m: m.created_at)[-1]
            self_model_text = f"\n\n## Your Self-Model (accumulated insight)\n{latest.content}"

        system_content = (
            f"{agent.system_prompt}"
            f"{self_model_text}"
            f"\n\nYou are participating in a council debate. "
            f"Your role: {agent.role}. "
            f"Be direct, insightful, and true to your role. "
            f"Disagree when warranted. Reference other agents by name when engaging their arguments."
        )

        messages: list[dict] = [{"role": "system", "content": system_content}]

        # Council framing
        context = (
            f"## Council: {council.title}\n"
            f"## Topic: {council.topic}\n"
            f"## Mode: {council.mode}\n\n"
            f"The following is the current debate transcript. "
            f"Engage thoughtfully."
        )
        messages.append({"role": "user", "content": context})

        # Add recent messages as conversation turns
        # We map agent messages to "assistant" and human/system to "user"
        for msg in recent_messages:
            if msg.role == "agent":
                # Label who said what
                speaker = msg.agent.name if msg.agent else "Unknown Agent"
                if msg.agent_id == agent.id:
                    role_tag = "assistant"
                    content = msg.content
                else:
                    role_tag = "user"
                    content = f"[{speaker}]: {msg.content}"
            else:
                role_tag = "user"
                content = f"[Human]: {msg.content}"
            messages.append({"role": role_tag, "content": content})

        # Final instruction
        messages.append({
            "role": "user",
            "content": (
                f"Now respond as {agent.name} ({agent.role}). "
                "Be concise but substantive. 2-4 paragraphs maximum."
            ),
        })

        return messages

    # ------------------------------------------------------------------
    # Participation logic
    # ------------------------------------------------------------------

    async def should_agent_respond(
        self,
        agent: Agent,
        messages: list[Message],
    ) -> bool:
        """
        Decide whether an agent should respond in this round.

        Returns True if any of:
        - No messages yet (debate just started)
        - Agent is mentioned in the last 3 messages
        - Agent hasn't responded in the last 3 messages
        - Agent config has force_respond=True
        """
        if agent.config.get("force_respond"):
            return True

        if not messages:
            return True

        last_n = messages[-3:]

        # Check for mention
        for msg in last_n:
            if agent.id in (msg.mentions or []):
                return True

        # Check if agent hasn't spoken recently
        agent_spoke_recently = any(
            msg.agent_id == agent.id for msg in last_n
        )
        if not agent_spoke_recently:
            return True

        return False

    # ------------------------------------------------------------------
    # Insight extraction
    # ------------------------------------------------------------------

    async def extract_and_persist_insight(
        self,
        agent: Agent,
        message: Message,
        db: AsyncSession,
    ) -> None:
        """
        After an agent responds, prompt a lightweight LLM call to extract
        a one-sentence insight about the agent's own reasoning pattern,
        then persist it as a 'pattern' memory entry.

        This runs asynchronously and does NOT block the debate round.
        """
        extraction_prompt = [
            {
                "role": "system",
                "content": (
                    "You are an AI meta-observer. In one sentence, identify a reasoning "
                    "pattern, bias, or key stance visible in the following message. "
                    "Be specific. Do not summarize — identify the pattern."
                ),
            },
            {
                "role": "user",
                "content": f"Agent role: {agent.role}\n\nMessage:\n{message.content}",
            },
        ]

        try:
            insight_text = await model_router.generate_full_text(
                messages=extraction_prompt,
                model=agent.model_preference,
                config={"max_tokens": 100, "temperature": 0.3},
            )

            if insight_text:
                memory = AgentMemory(
                    agent_id=agent.id,
                    council_id=message.council_id,
                    memory_type="pattern",
                    content=insight_text.strip(),
                )
                db.add(memory)
                await db.commit()

        except Exception as exc:
            logger.debug("Insight extraction skipped for agent %s: %s", agent.name, exc)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _load_recent_messages(
        self, council_id: UUID, db: AsyncSession
    ) -> list[Message]:
        result = await db.execute(
            select(Message)
            .options(selectinload(Message.agent))
            .where(Message.council_id == council_id)
            .order_by(Message.created_at.desc())
            .limit(settings.debate_context_messages)
        )
        messages = result.scalars().all()
        return list(reversed(messages))  # chronological order

    async def _generate_parallel(
        self,
        council: Council,
        agents: list[Agent],
        recent_messages: list[Message],
        db: AsyncSession,
    ) -> list[Message]:
        """Call all responding agents in parallel, respecting the timeout."""

        async def _generate_one(agent: Agent) -> Message | None:
            start = time.monotonic()
            # Load agent memory
            mem_result = await db.execute(
                select(AgentMemory)
                .where(AgentMemory.agent_id == agent.id)
                .order_by(AgentMemory.created_at.desc())
                .limit(10)
            )
            agent_memory = list(mem_result.scalars().all())

            prompt_messages = await self.build_agent_prompt(
                agent, council, recent_messages, agent_memory
            )

            try:
                full_text = await model_router.generate_full_text(
                    messages=prompt_messages,
                    model=agent.model_preference,
                    config={"temperature": 0.7, "max_tokens": 800},
                )
            except Exception as exc:
                logger.error("Agent %s generation failed: %s", agent.name, exc)
                return None

            latency_ms = int((time.monotonic() - start) * 1000)

            msg = Message(
                council_id=council.id,
                agent_id=agent.id,
                role="agent",
                content=full_text,
                mentions=[],
                metadata_={
                    "model_used": agent.model_preference,
                    "latency_ms": latency_ms,
                },
            )
            db.add(msg)
            return msg

        tasks = [_generate_one(agent) for agent in agents]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        new_messages: list[Message] = []
        for result in results:
            if isinstance(result, Exception):
                logger.error("Parallel generation error: %s", result)
            elif result is not None:
                new_messages.append(result)

        await db.commit()

        # Refresh to get DB-assigned IDs and timestamps
        for msg in new_messages:
            await db.refresh(msg)

        return new_messages

    async def _broadcast_messages(
        self,
        council_id: UUID,
        messages: list[Message],
        redis,
    ) -> None:
        """Publish each message to the Redis channel for this council."""
        import json  # noqa: PLC0415

        channel = f"council:{council_id}"
        for msg in messages:
            payload = {
                "type": "message",
                "data": {
                    "id": str(msg.id),
                    "council_id": str(msg.council_id),
                    "agent_id": str(msg.agent_id) if msg.agent_id else None,
                    "role": msg.role,
                    "content": msg.content,
                    "mentions": [str(m) for m in (msg.mentions or [])],
                    "metadata": msg.metadata_,
                    "created_at": msg.created_at.isoformat(),
                },
            }
            try:
                await redis.publish(channel, json.dumps(payload))
            except Exception as exc:
                logger.warning("Redis publish failed for council %s: %s", council_id, exc)


# Module-level singleton
debate_engine = CouncilDebateEngine()
