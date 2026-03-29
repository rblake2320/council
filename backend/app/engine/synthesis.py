"""
SynthesisEngine — generates structured summaries of completed debates.

Uses the strongest available model (synthesis_model from settings).
Reads the full message history from DB (compaction-proof).
Produces: consensus, dissent, insights, recommendations, per-agent votes.
"""
import json
import logging
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.engine.router import model_router
from app.models.agent import Agent
from app.models.council import Council, Message, Participant, Synthesis

logger = logging.getLogger(__name__)

# Structured output prompt — the synthesis model must return valid JSON
_SYNTHESIS_SYSTEM = """You are a synthesis engine for a multi-agent AI council debate.
You will receive a full transcript and a list of participating agents.
You MUST respond with a single valid JSON object — no markdown, no code fences, no extra text.

Schema:
{
  "consensus": "Points all or most agents agreed on",
  "dissent": "Points where agents disagreed and why",
  "insights": "Novel ideas or connections that emerged from the interaction",
  "recommendations": "Specific actionable recommendations from the council",
  "votes": {
    "<agent_name>": {
      "position": "YES | NO | CONDITIONAL",
      "rationale": "brief rationale"
    }
  }
}

Be specific. Reference agent names. Do not hallucinate positions not supported by the transcript."""


class SynthesisEngine:

    async def synthesize(
        self,
        council_id: UUID,
        db: AsyncSession,
        model: str | None = None,
    ) -> Synthesis:
        """
        Read the full message history and generate a structured synthesis.
        Persists the result to DB and updates council.synthesis_id.
        """
        synthesis_model = model or settings.synthesis_model

        # Load council
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

        # Load all messages
        msg_result = await db.execute(
            select(Message)
            .options(selectinload(Message.agent))
            .where(Message.council_id == council_id)
            .order_by(Message.created_at.asc())
        )
        messages = list(msg_result.scalars().all())

        agents = [p.agent for p in council.participants]

        # Build transcript
        transcript = self._build_transcript(messages)
        agent_list = ", ".join(f"{a.name} ({a.role})" for a in agents)

        # Build prompt
        prompt_messages = [
            {"role": "system", "content": _SYNTHESIS_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Council Title: {council.title}\n"
                    f"Topic: {council.topic}\n"
                    f"Participating Agents: {agent_list}\n\n"
                    f"Full Transcript:\n{transcript}\n\n"
                    "Generate the synthesis JSON now."
                ),
            },
        ]

        # Generate
        raw_text = await model_router.generate_full_text(
            messages=prompt_messages,
            model=synthesis_model,
            config={"max_tokens": 2048, "temperature": 0.3},
        )

        # Parse JSON
        synthesis_data = self._parse_synthesis_json(raw_text)

        # Persist
        synthesis = Synthesis(
            council_id=council_id,
            consensus=synthesis_data.get("consensus"),
            dissent=synthesis_data.get("dissent"),
            insights=synthesis_data.get("insights"),
            recommendations=synthesis_data.get("recommendations"),
            votes=synthesis_data.get("votes", {}),
            model_used=synthesis_model,
            message_count=len(messages),
        )
        db.add(synthesis)
        await db.flush()  # get synthesis.id

        # Update council.synthesis_id
        await db.execute(
            update(Council)
            .where(Council.id == council_id)
            .values(synthesis_id=synthesis.id)
        )
        await db.commit()
        await db.refresh(synthesis)

        return synthesis

    async def extract_votes(
        self,
        messages: list[Message],
        agents: list[Agent],
    ) -> dict:
        """
        Parse messages to infer each agent's position (YES/NO/CONDITIONAL).
        Lightweight heuristic — does not call an LLM.
        Used as a fallback when full synthesis is not available.
        """
        votes = {}
        for agent in agents:
            agent_msgs = [m for m in messages if m.agent_id == agent.id]
            if not agent_msgs:
                continue
            # Simple heuristic: look at last message for stance words
            last_content = agent_msgs[-1].content.lower()
            if any(w in last_content for w in ["agree", "support", "yes", "correct", "right"]):
                position = "YES"
            elif any(w in last_content for w in ["disagree", "oppose", "no", "wrong", "incorrect", "however"]):
                position = "NO"
            else:
                position = "CONDITIONAL"
            votes[agent.name] = {
                "position": position,
                "rationale": f"Inferred from final message (heuristic)",
            }
        return votes

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_transcript(self, messages: list[Message]) -> str:
        lines = []
        for msg in messages:
            if msg.role == "agent":
                speaker = msg.agent.name if msg.agent else "Unknown"
                role_label = f" ({msg.agent.role})" if msg.agent else ""
            elif msg.role == "human":
                speaker = "Human"
                role_label = ""
            else:
                speaker = "System"
                role_label = ""
            ts = msg.created_at.strftime("%H:%M:%S")
            lines.append(f"[{ts}] {speaker}{role_label}: {msg.content}")
        return "\n\n".join(lines)

    def _parse_synthesis_json(self, raw: str) -> dict:
        """
        Attempt to parse the LLM output as JSON.
        If parsing fails, return a structured error dict so the synthesis
        record is always created (never raises on bad LLM output).
        """
        if not raw:
            return self._error_synthesis("Empty response from synthesis model")

        # Strip any accidental markdown code fences
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Drop first and last lines if they are ``` delimiters
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines)

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("Synthesis JSON parse failed: %s — raw output: %.200s", exc, raw)
            # Return partial data — store raw text in consensus so it's not lost
            return {
                "consensus": raw[:2000],
                "dissent": None,
                "insights": None,
                "recommendations": None,
                "votes": {},
            }

    @staticmethod
    def _error_synthesis(reason: str) -> dict:
        return {
            "consensus": f"Synthesis error: {reason}",
            "dissent": None,
            "insights": None,
            "recommendations": None,
            "votes": {},
        }


# Module-level singleton
synthesis_engine = SynthesisEngine()
