"""
LearningCapture — extracts structured knowledge from completed debate sessions.

Runs at session end (after the last round) and does three things:

1. COUNCIL SUMMARY — compresses the full debate into a structured record:
   {topic, consensus, key_insights, dissenting_views, open_questions}
   Stored in council.knowledge_base.

2. AGENT SELF-MODEL UPDATE — for each agent that participated, generates a
   one-sentence update to their self-model based on this session's performance.
   Stored in council.agent_memory (type='self_model').

3. TRAINING EXPORT — appends a JSONL record to the export file so the full
   dataset grows over time and can be used for fine-tuning.

All LLM calls use the cheapest available model (Ollama default — free).
This entire module costs $0 per session when using local models.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.router import model_router
from app.models.agent import Agent
from app.models.council import AgentMemory, Council, Message, Participant
from app.config import settings

logger = logging.getLogger(__name__)

# Where training export files land
_EXPORT_DIR = Path(os.environ.get("COUNCIL_EXPORT_DIR", "exports"))


class LearningCapture:
    """
    Invoked once per session after the debate concludes.
    All methods are fire-and-forget — they must not block the session loop.
    """

    async def capture_session(
        self,
        council_id: UUID,
        db: AsyncSession,
    ) -> None:
        """
        Entry point. Call after run_session() completes.
        Runs all capture steps concurrently.
        """
        try:
            # Load council + messages
            result = await db.execute(
                select(Council)
                .options(selectinload(Council.participants).selectinload(Participant.agent))
                .where(Council.id == council_id)
            )
            council = result.scalar_one_or_none()
            if council is None:
                return

            msg_result = await db.execute(
                select(Message)
                .options(selectinload(Message.agent))
                .where(Message.council_id == council_id)
                .order_by(Message.created_at.asc())
            )
            messages = list(msg_result.scalars().all())

            if len(messages) < 2:
                return  # Nothing worth capturing

            agents = [p.agent for p in council.participants]

            # Run capture steps concurrently
            await asyncio.gather(
                self._capture_council_summary(council, messages, db),
                self._update_agent_self_models(council, agents, messages, db),
                self._export_training_record(council, messages),
                return_exceptions=True,
            )

            logger.info("LearningCapture complete for council %s (%d messages)", council_id, len(messages))

        except Exception as exc:
            logger.warning("LearningCapture failed for council %s: %s", council_id, exc)

    # ------------------------------------------------------------------
    # Step 1: Council knowledge summary
    # ------------------------------------------------------------------

    async def _capture_council_summary(
        self,
        council: Council,
        messages: list[Message],
        db: AsyncSession,
    ) -> None:
        """
        Extract a structured summary of the debate and store in knowledge_base.
        """
        transcript = self._format_transcript(messages, max_chars=6000)

        prompt = [
            {
                "role": "system",
                "content": (
                    "You are a debate analyst. Extract key knowledge from this council debate. "
                    "Return ONLY valid JSON with these exact keys: "
                    "consensus (string), key_insights (list of strings, max 5), "
                    "dissenting_views (list of strings, max 3), "
                    "open_questions (list of strings, max 3), "
                    "recommendation (string). "
                    "Be specific and actionable. No markdown, just JSON."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Council: {council.title}\n"
                    f"Topic: {council.topic}\n\n"
                    f"Transcript:\n{transcript}"
                ),
            },
        ]

        try:
            raw = await model_router.generate_full_text(
                messages=prompt,
                model=settings.default_model,
                config={"temperature": 0.3, "max_tokens": 600},
            )

            # Extract JSON from response
            summary = self._extract_json(raw)
            if not summary:
                summary = {"consensus": raw[:300], "key_insights": [], "dissenting_views": [],
                           "open_questions": [], "recommendation": ""}

            # Store in knowledge_base table
            await db.execute(
                text("""
                    INSERT INTO council.knowledge_base
                        (id, council_id, topic, summary, created_at)
                    VALUES
                        (:id, :council_id, :topic, cast(:summary as jsonb), NOW())
                    ON CONFLICT (council_id) DO UPDATE
                        SET summary = EXCLUDED.summary,
                            topic   = EXCLUDED.topic,
                            created_at = NOW()
                """),
                {
                    "id": str(uuid4()),
                    "council_id": str(council.id),
                    "topic": council.topic,
                    "summary": json.dumps(summary),
                },
            )
            await db.commit()
            logger.info("Council %s summary saved to knowledge_base", council.id)

        except Exception as exc:
            logger.warning("Council summary capture failed: %s", exc)

    # ------------------------------------------------------------------
    # Step 2: Agent self-model updates
    # ------------------------------------------------------------------

    async def _update_agent_self_models(
        self,
        council: Council,
        agents: list[Agent],
        messages: list[Message],
        db: AsyncSession,
    ) -> None:
        """
        For each agent, generate a one-sentence self-model update based on
        how they performed in this debate. Appended to agent_memory.
        """
        agent_messages = {}
        for msg in messages:
            if msg.role == "agent" and msg.agent_id:
                agent_messages.setdefault(str(msg.agent_id), []).append(msg.content)

        for agent in agents:
            own_msgs = agent_messages.get(str(agent.id), [])
            if not own_msgs:
                continue

            combined = "\n---\n".join(own_msgs[:5])  # Max 5 of their messages
            prompt = [
                {
                    "role": "system",
                    "content": (
                        "In one sentence, identify a specific pattern in how this agent reasoned "
                        "in this debate — a strength, blind spot, or tendency. "
                        "Format: '[Agent name] tends to [pattern].' Be specific."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Agent: {agent.name} ({agent.role})\n"
                        f"Topic: {council.topic}\n\n"
                        f"Their contributions:\n{combined[:2000]}"
                    ),
                },
            ]

            try:
                insight = await model_router.generate_full_text(
                    messages=prompt,
                    model=settings.default_model,
                    config={"temperature": 0.3, "max_tokens": 80},
                )

                if insight and insight.strip():
                    memory = AgentMemory(
                        agent_id=agent.id,
                        council_id=council.id,
                        memory_type="self_model",
                        content=f"[{council.title}] {insight.strip()}",
                    )
                    db.add(memory)

            except Exception as exc:
                logger.debug("Self-model update failed for %s: %s", agent.name, exc)

        try:
            await db.commit()
        except Exception as exc:
            logger.warning("Self-model commit failed: %s", exc)

    # ------------------------------------------------------------------
    # Step 3: Training data export
    # ------------------------------------------------------------------

    async def _export_training_record(
        self,
        council: Council,
        messages: list[Message],
    ) -> None:
        """
        Append a structured record to a JSONL export file.
        Format is compatible with OpenAI / Anthropic fine-tuning pipelines.

        Each record = one training example:
          {messages: [{role, content}, ...], metadata: {council_id, topic, ...}}
        """
        try:
            _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
            export_file = _EXPORT_DIR / "council_training_data.jsonl"

            # Build conversation in standard format
            conversation = []
            for msg in messages:
                if msg.role == "agent" and msg.agent:
                    name = msg.agent.name
                    conversation.append({
                        "role": "assistant",
                        "name": name,
                        "content": msg.content,
                    })
                elif msg.role == "human":
                    conversation.append({
                        "role": "user",
                        "content": msg.content,
                    })
                elif msg.role == "system":
                    conversation.append({
                        "role": "system",
                        "content": msg.content,
                    })

            record = {
                "messages": conversation,
                "metadata": {
                    "council_id": str(council.id),
                    "title": council.title,
                    "topic": council.topic,
                    "mode": council.mode,
                    "message_count": len(messages),
                    "exported_at": datetime.now(timezone.utc).isoformat(),
                },
            }

            with open(export_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

            logger.info("Training record exported for council %s (%d turns)", council.id, len(conversation))

        except Exception as exc:
            logger.warning("Training export failed: %s", exc)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _format_transcript(self, messages: list[Message], max_chars: int = 8000) -> str:
        lines = []
        for msg in messages:
            if msg.role == "agent" and msg.agent:
                speaker = msg.agent.name
            elif msg.role == "human":
                speaker = "Human"
            else:
                speaker = "System"
            lines.append(f"[{speaker}]: {msg.content[:400]}")

        transcript = "\n\n".join(lines)
        return transcript[:max_chars]

    def _extract_json(self, text: str) -> dict | None:
        """Extract first JSON object from an LLM response."""
        try:
            # Try direct parse first
            return json.loads(text.strip())
        except Exception:
            pass

        # Find JSON block
        import re  # noqa: PLC0415
        m = re.search(r"\{[\s\S]+\}", text)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass

        return None


# Module-level singleton
learning_capture = LearningCapture()
