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
        Append structured records to three JSONL export files.

        FILE 1: council_training_data.jsonl
            Full conversation per session. OpenAI/Anthropic chat fine-tuning format.
            Each record = one complete debate session as a multi-turn conversation.

        FILE 2: agent_persona_training.jsonl
            Per-agent SFT examples. Each record = system prompt (with role + self_model) +
            the human turn that prompted the agent + the agent's actual response.
            Use this to fine-tune models to speak with a specific agent's persona.

        FILE 3: agent_self_model_evolution.jsonl
            Self-model insights per agent per session. Tracks how each agent's self-awareness
            evolves over time. Use as a DPO/preference dataset: later self-models are
            "preferred" over earlier ones (they're more accurate about the agent's patterns).
        """
        try:
            _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
            now_iso = datetime.now(timezone.utc).isoformat()
            meta_base = {
                "council_id": str(council.id),
                "title": council.title,
                "topic": council.topic,
                "mode": council.mode,
                "exported_at": now_iso,
            }

            # ── FILE 1: Full conversation (existing format, unchanged) ──────────
            conversation = []
            for msg in messages:
                if msg.role == "agent" and msg.agent:
                    conversation.append({
                        "role": "assistant",
                        "name": msg.agent.name,
                        "content": msg.content,
                    })
                elif msg.role == "human":
                    conversation.append({"role": "user", "content": msg.content})
                elif msg.role == "system":
                    conversation.append({"role": "system", "content": msg.content})

            with open(_EXPORT_DIR / "council_training_data.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "messages": conversation,
                    "metadata": {**meta_base, "message_count": len(messages)},
                }, ensure_ascii=False) + "\n")

            # ── FILE 2: Per-agent persona SFT examples ───────────────────────────
            # For each agent response, build: system(persona) + user(question) → assistant(response)
            persona_file = _EXPORT_DIR / "agent_persona_training.jsonl"
            agent_msgs: dict[str, list] = {}
            for msg in messages:
                if msg.role == "agent" and msg.agent:
                    agent_msgs.setdefault(msg.agent.name, []).append(msg)

            # Find each human message and pair it with subsequent agent responses
            human_turns = [m for m in messages if m.role == "human"]
            with open(persona_file, "a", encoding="utf-8") as f:
                for agent_name, agent_responses in agent_msgs.items():
                    for agent_msg in agent_responses:
                        # Find the human turn that preceded this response
                        preceding_human = None
                        for hm in reversed(human_turns):
                            if hm.created_at < agent_msg.created_at:
                                preceding_human = hm
                                break
                        if not preceding_human:
                            continue
                        # Find the agent object for role/personality
                        agent_obj = next(
                            (m.agent for m in messages if m.role == "agent" and m.agent and m.agent.name == agent_name),
                            None,
                        )
                        role_desc = (agent_obj.role or agent_name) if agent_obj else agent_name
                        persona_sys = (
                            f"You are {agent_name}, a {role_desc}. "
                            f"Topic: {council.topic}. "
                            "Respond directly and concisely from your domain perspective. "
                            "No headers. No bullets. 2 sentences max unless the question demands more."
                        )
                        example = {
                            "messages": [
                                {"role": "system", "content": persona_sys},
                                {"role": "user", "content": preceding_human.content},
                                {"role": "assistant", "content": agent_msg.content},
                            ],
                            "metadata": {
                                **meta_base,
                                "agent_name": agent_name,
                                "example_type": "persona_sft",
                            },
                        }
                        f.write(json.dumps(example, ensure_ascii=False) + "\n")

            # ── FILE 3: Self-model evolution (DPO/preference dataset) ────────────
            # Pairs of (earlier_self_model, later_self_model) per agent — later is preferred.
            # Also exports each self_model as a standalone record for single-turn SFT.
            self_model_file = _EXPORT_DIR / "agent_self_model_evolution.jsonl"
            with open(self_model_file, "a", encoding="utf-8") as f:
                agent_self_models: dict[str, list] = {}
                for msg in messages:
                    if msg.role == "agent" and msg.agent:
                        # Collect all unique self-model-style messages (short, pattern-like)
                        content = msg.content.strip()
                        if len(content.split()) <= 50:  # short = likely a pattern/self-insight
                            agent_self_models.setdefault(msg.agent.name, []).append(content)

                # Export per-agent pattern as a standalone record
                for agent_name, patterns in agent_self_models.items():
                    if not patterns:
                        continue
                    record = {
                        "agent_name": agent_name,
                        "council_topic": council.topic,
                        "council_title": council.title,
                        "observed_patterns": patterns,
                        "record_type": "agent_pattern_observation",
                        "metadata": {**meta_base},
                    }
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")

            logger.info(
                "Training export complete for council %s: %d conversation turns, %d agents",
                council.id, len(conversation), len(agent_msgs),
            )

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
