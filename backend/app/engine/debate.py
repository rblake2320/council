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
import re
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
from app.security.prompt_guard import log_security_event, prompt_guard

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Response post-processor — strips formal report formatting from debate output
# ---------------------------------------------------------------------------

_FORMAL_LABEL_RE = re.compile(
    r"^\*{0,2}\s*("
    r"objective|key findings?|key takeaways?|evidence|recommendation[s]?|"
    r"next actions?|next steps?|position statement|verdict|my position|"
    r"analysis|conclusion|risks?|rationale|findings?|takeaways?|"
    r"summary|overview|background|context|problem|solution|impact|"
    r"\w+\s+activated"
    r")\s*:?\s*\*{0,2}\s*:?\s*",  # colon may appear before OR after closing **
    re.IGNORECASE,
)

# Markdown horizontal rule — three or more dashes/equals/asterisks on their own line
_HORIZ_RULE_RE = re.compile(r"^[-=*]{3,}\s*$")

def _strip_report_formatting(text: str, agent_name: str) -> str:
    """
    Remove formal-report patterns from debate responses.
    - Strips markdown headers (lines starting with #)
    - Strips bold section labels like **Key Findings:** from start of lines
    - Strips standalone agent self-intro like **NOVA:** or DEBUGGER Activated
    """
    lines = text.split("\n")
    cleaned = []
    in_code_block = False
    for line in lines:
        stripped = line.strip()

        # Track code blocks (never touch content inside them)
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            cleaned.append(line)
            continue
        if in_code_block:
            cleaned.append(line)
            continue

        # Drop markdown headers
        if stripped.startswith("#"):
            continue

        # Drop horizontal rules (---, ===, ***)
        if _HORIZ_RULE_RE.match(stripped):
            continue

        # Drop standalone self-intro: "**NOVA:**" or "**DEBUGGER Activated**"
        if re.match(
            r"^\*{0,2}\s*" + re.escape(agent_name) + r"[\s:]*\*{0,2}\.?\s*$",
            stripped, re.IGNORECASE
        ):
            continue

        # Strip formal section label prefix from start of line
        # e.g. "**Key Findings:** The truth is..." → "The truth is..."
        new_line = _FORMAL_LABEL_RE.sub("", stripped)

        # Strip bullet markers: "- item" → "item", "* item" → "item"
        new_line = re.sub(r"^[-*]\s+", "", new_line)

        # If stripping left nothing (line was just a label), skip it
        if not new_line.strip():
            continue

        cleaned.append(new_line)

    result = "\n".join(cleaned)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ---------------------------------------------------------------------------
# Factual question patterns — used to detect simple Q&A vs debate
# ---------------------------------------------------------------------------

_FACTUAL_PATTERNS = [
    r"\d+\s*[+\-*/x×÷]\s*\d+",                                    # arithmetic: 4+5, 9*6
    r"\d+\s+(plus|minus|times|divided\s+by|multiplied\s+by)\s+\d+",  # word operators: 4 plus 5
    r"what\s+is\s+\d",                                              # "what is 2+2"
    r"what\s+(is|are|was|were)\s+(the\s+)?(date|time|day|year|month)",  # "what is the date/time"
    r"what['\u2019s]+\s*(the\s+)?(date|time|day|year|month)",      # "what's the date"
    r"what\s+(is|are|was|were)\s+(today|tomorrow|yesterday)",       # "what is today/tomorrow"
    r"what\s+(year|time|day|month|date)\s+(is|are|was|will)\s+it", # "what year is it"
    r"what\s+(is|are)\s+tomorrow'?s?\s*(date|day)?",               # "what is tomorrow's date"
    r"tomorrow'?s?\s+(date|day|name)",                              # "tomorrow's date"
    r"today'?s?\s+(date|day)",                                      # "today's date"
    r"how\s+(many|much|old|tall|long|far|big|small)",               # quantity
    r"when\s+(did|was|is|will)",                                    # temporal
    r"who\s+(is|was|are|were)\s+\w+",                              # person lookup
    r"where\s+(is|was|are|were)\s+\w+",                            # location
    r"what\s+does\s+\w+\s+stand\s+for",                            # acronym expansion
    r"^define\s+",                                                   # definition request
    r"capital\s+of\s+\w+",                                          # capital city
    r"convert\s+\d+",                                                # unit conversion
]

# Opinion/ethics/values patterns — universal questions where every agent has a
# valid perspective shaped by their role. No agent should stay silent on these.
_OPINION_PATTERNS = [
    r"\bshould\b",                                          # "should AI...", "should we..."
    r"\bought\s+to\b",                                      # "ought to"
    r"\bdo\s+you\s+(think|believe|feel|agree|disagree)\b", # "do you think/believe"
    r"\bwhat\s+do\s+you\s+(think|believe|feel)\b",         # "what do you think"
    r"\bin\s+your\s+opinion\b",                             # "in your opinion"
    r"\bfrom\s+your\s+perspective\b",                       # "from your perspective"
    r"\b(moral|ethical|ethics|morality)\b",                 # ethics keywords
    r"\b(rights?|deserve|deserve|dignity|autonomy)\b",     # rights/dignity
    r"\b(fair|unfair|just|unjust|justice)\b",               # fairness/justice
    r"\b(is\s+it\s+(right|wrong|okay|acceptable|good|bad))\b",  # value judgments
    r"\bdo\s+you\s+support\b",                             # "do you support"
    r"\b(agree|disagree)\s+with\b",                         # "agree/disagree with"
    r"\b(better|worse)\s+(for\s+(society|humanity|the\s+world|people|us|everyone))\b",  # value judgment (not technical comparison)
    r"\bwould\s+you\s+(say|argue|support|prefer)\b",        # hypothetical stance
]


def _enforce_brevity(text: str, max_words: int = 120) -> str:
    """Hard-cap response to max_words. Truncate at last sentence boundary within limit."""
    words = text.split()
    if len(words) <= max_words:
        return text
    truncated = " ".join(words[:max_words])
    # For very short limits (factual), accept any sentence boundary
    threshold = max(1, len(truncated) // 4) if max_words <= 20 else len(truncated) // 3
    for end_marker in [". ", "! ", "? ", ".\n", "!\n", "?\n"]:
        pos = truncated.rfind(end_marker)
        if pos > threshold:
            return truncated[:pos + 1].strip()
    return truncated.rstrip(" ,;:") + "."


class CouncilDebateEngine:

    def __init__(self):
        # Track which councils have an active session running so we don't double-fire
        self._running: set[str] = set()

    def _classify_question(self, text: str) -> str:
        """
        Classify a question as:
          'factual'  — single correct answer (math, dates, definitions)
          'opinion'  — ethics, values, rights, philosophy — every agent has a valid view
          'debate'   — technical/strategic — domain experts lead, others follow
        """
        text_lower = (text or "").lower().strip()
        # Factual check first — highest precision
        for pattern in _FACTUAL_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "factual"
        # Opinion/ethics — all agents should answer from their own perspective
        for pattern in _OPINION_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "opinion"
        return "debate"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    # Approximate cost per 1M tokens (input+output blended) in USD
    _COST_PER_1M = {
        "claude-haiku-4-5-20251001": 0.80,
        "claude-sonnet-4-6":         3.00,
        "claude-opus-4-6":           15.0,
        "gpt-4o-mini":               0.15,
        "gpt-4o":                    5.00,
        "models/gemini-2.5-flash":   0.15,
        "models/gemini-2.0-flash":   0.15,
        # ollama models are free (local)
    }

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate: ~4 chars per token."""
        return max(1, len(text) // 4)

    def _estimate_cost(self, model: str, tokens: int) -> float:
        rate = self._COST_PER_1M.get(model, 0.0)
        return (tokens / 1_000_000) * rate

    async def run_session(
        self,
        council_id: UUID,
        db: AsyncSession,
        redis=None,
        triggered_by: str = "human",
        _catchup_depth: int = 0,
    ) -> None:
        """
        Run a full debate session — keeps firing rounds until:
        - No agents respond in a round (debate reached natural conclusion)
        - Max rounds for this council mode are exhausted
        - Token or cost budget from council config is exceeded
        - Council status changes away from 'active'

        council.config keys honoured:
            max_rounds     (int)   — override mode default
            token_budget   (int)   — max total estimated tokens this session
            cost_limit_usd (float) — max spend in USD this session

        Prevents concurrent sessions on the same council via _running guard.
        """
        key = str(council_id)
        if key in self._running:
            logger.info("Session already running for council %s — skipping duplicate trigger", council_id)
            return

        self._running.add(key)
        try:
            result = await db.execute(select(Council).where(Council.id == council_id))
            council = result.scalar_one_or_none()
            if council is None or council.status != "active":
                return

            cfg = council.config or {}
            # Max rounds: explicit config > mode default
            max_rounds = cfg.get("max_rounds") or {"quick": 3, "standard": 8, "marathon": 30}.get(council.mode, 5)
            # Budget guards (None = unlimited)
            token_budget: int | None = cfg.get("token_budget")
            cost_limit: float | None = cfg.get("cost_limit_usd")

            session_tokens = 0
            session_cost = 0.0

            for round_num in range(max_rounds):
                await db.refresh(council)
                if council.status != "active":
                    logger.info("Council %s paused/completed — stopping session", council_id)
                    break

                # Budget pre-check
                if token_budget and session_tokens >= token_budget:
                    logger.warning(
                        "Council %s: token budget %d reached (%d used) — stopping",
                        council_id, token_budget, session_tokens,
                    )
                    await self._post_system_message(
                        council_id, db, redis,
                        f"[Session paused: token budget of {token_budget:,} tokens reached. "
                        f"Estimated spend so far: ${session_cost:.4f}]"
                    )
                    break

                if cost_limit and session_cost >= cost_limit:
                    logger.warning(
                        "Council %s: cost limit $%.4f reached ($%.4f used) — stopping",
                        council_id, cost_limit, session_cost,
                    )
                    await self._post_system_message(
                        council_id, db, redis,
                        f"[Session paused: cost limit ${cost_limit:.2f} reached. "
                        f"Tokens used: {session_tokens:,}]"
                    )
                    break

                new_messages = await self.run_round(council_id, db, redis)

                if not new_messages:
                    logger.info(
                        "Council %s: no agents responded in round %d — debate concluded",
                        council_id, round_num + 1,
                    )
                    break

                # Track usage
                for msg in new_messages:
                    tokens = self._estimate_tokens(msg.content)
                    model = (msg.metadata_ or {}).get("model_used", "")
                    cost = self._estimate_cost(model, tokens)
                    session_tokens += tokens
                    session_cost += cost

                logger.info(
                    "Council %s: round %d — %d responses | session: ~%d tokens ~$%.4f",
                    council_id, round_num + 1, len(new_messages), session_tokens, session_cost,
                )

                await asyncio.sleep(2)

        finally:
            self._running.discard(key)
            # Learning capture — extracts knowledge, updates agent self-models, exports JSONL
            # Runs after every completed session (handles its own exceptions internally)
            try:
                from app.engine.learning import learning_capture  # noqa: PLC0415 — lazy import avoids circular
                await learning_capture.capture_session(council_id, db)
            except Exception as exc:
                logger.warning("Learning capture error for council %s: %s", council_id, exc)

            # Catch-up: if a human message arrived while this session was locked,
            # it was dropped by the _running guard and never answered. Re-enter once.
            _MAX_CATCHUP = 3
            if _catchup_depth < _MAX_CATCHUP:
                try:
                    hu_result = await db.execute(
                        select(Message)
                        .where(Message.council_id == council_id, Message.role == "human")
                        .order_by(Message.created_at.desc())
                        .limit(1)
                    )
                    last_human = hu_result.scalar_one_or_none()
                    ag_result = await db.execute(
                        select(Message)
                        .where(Message.council_id == council_id, Message.role == "agent")
                        .order_by(Message.created_at.desc())
                        .limit(1)
                    )
                    last_agent = ag_result.scalar_one_or_none()
                    if last_human and (
                        not last_agent
                        or last_human.created_at > last_agent.created_at
                    ):
                        logger.info(
                            "Catch-up: unanswered human message found for council %s "
                            "(depth=%d) — re-entering session",
                            council_id, _catchup_depth,
                        )
                        await self.run_session(
                            council_id, db, redis,
                            triggered_by="catchup",
                            _catchup_depth=_catchup_depth + 1,
                        )
                except Exception as exc:
                    logger.warning("Catch-up check failed for council %s: %s", council_id, exc)

    async def _post_system_message(
        self, council_id: UUID, db: AsyncSession, redis, content: str
    ) -> None:
        """Post a system-level notice to the council transcript."""
        msg = Message(
            council_id=council_id,
            agent_id=None,
            role="system",
            content=content,
            mentions=[],
            metadata_={},
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        if redis:
            import json  # noqa: PLC0415
            await redis.publish(
                f"council:{council_id}",
                json.dumps({"type": "message", "data": {
                    "id": str(msg.id), "role": "system", "content": content,
                    "created_at": msg.created_at.isoformat(),
                }}),
            )

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

        # Classify the current question and determine which response round we're in
        last_human_msg = next((m for m in reversed(recent_messages) if m.role == "human"), None)
        question_text = last_human_msg.content if last_human_msg else ""
        question_type = self._classify_question(question_text)

        # round_in_question: how many agent responses exist since the last human message
        # 0 = first response round for this question, 1+ = subsequent rounds
        if last_human_msg:
            round_in_question = sum(
                1 for m in recent_messages
                if m.role == "agent" and m.created_at > last_human_msg.created_at
            )
        else:
            round_in_question = 0

        # Decide responders
        responders = [
            agent for agent in agents
            if await self.should_agent_respond(agent, recent_messages)
        ]

        if not responders:
            logger.info("No agents chose to respond in this round for council %s", council_id)
            return []

        # For factual questions in the first response round, cap at 2 agents.
        # The question is already answered by 1-2 agents — the rest should not pile on.
        if question_type == "factual" and round_in_question == 0 and len(responders) > 2:
            logger.info(
                "Council %s: factual question — capping responders at 2 (was %d)",
                council_id, len(responders),
            )
            responders = responders[:2]

        # Generate responses in parallel
        new_messages = await self._generate_parallel(
            council, responders, recent_messages, db,
            question_type=question_type,
            round_in_question=round_in_question,
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
        question_type: str = "debate",
        round_in_question: int = 0,
        web_context: str | None = None,
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
        # --- Self-model: aggregate last 3 entries (not just latest) for cumulative picture ---
        self_model_entries = sorted(
            [m for m in agent_memory if m.memory_type == "self_model"],
            key=lambda m: m.created_at,
        )
        self_model_text = ""
        if self_model_entries:
            # Take the 3 most recent; deduplicate near-identical entries
            recent_sm = self_model_entries[-3:]
            unique_sm = []
            seen_starts: set[str] = set()
            for m in reversed(recent_sm):
                key = m.content[:60].lower()
                if key not in seen_starts:
                    unique_sm.append(m.content)
                    seen_starts.add(key)
            if len(unique_sm) == 1:
                self_model_text = f"\n\nPast insight about yourself: {unique_sm[0]}"
            else:
                joined = " / ".join(unique_sm)
                self_model_text = f"\n\nPattern insights about yourself: {joined}"

        # --- Pattern memories: what observers noticed about this agent's reasoning ---
        pattern_entries = sorted(
            [m for m in agent_memory if m.memory_type == "pattern"],
            key=lambda m: m.created_at,
        )
        pattern_text = ""
        if pattern_entries and not self_model_entries:
            # Agent has no self_model yet — surface their pattern memories instead
            recent_pat = pattern_entries[-3:]
            pattern_text = "\n\nObserved reasoning patterns: " + " / ".join(
                m.content[:120] for m in reversed(recent_pat)
            )

        # Build system content — NO markdown in the system prompt (headers trigger structured output)
        # Strip "Activate for..." task-activation language from role — it primes models for formal reports
        role_description = agent.role or ""
        if ". Activate" in role_description:
            role_description = role_description.split(". Activate")[0]
        elif ", Activate" in role_description:
            role_description = role_description.split(", Activate")[0]

        identity_lines = [f"You are {agent.name}, a {role_description} in this debate."]
        if agent.personality:
            # Use first sentence of personality only — avoids long analyst descriptions
            first_sentence = agent.personality.split(".")[0].strip()
            if first_sentence:
                identity_lines.append(f"Style: {first_sentence}.")
        if self_model_text:
            identity_lines.append(self_model_text)
        if pattern_text:
            identity_lines.append(pattern_text)

        identity = " ".join(identity_lines)

        # Inject the authoritative server datetime so models don't fall back to training cutoff.
        # This MUST appear in the system prompt (position 0) — it's the highest-weight position.
        from datetime import datetime as _dt, timezone as _tz  # noqa: PLC0415
        _now = _dt.now(_tz.utc)
        _date_str = _now.strftime("%A, %B %d, %Y")

        # Rule 6 is context-dependent: domain discipline for technical questions,
        # perspective-led participation for ethics/opinion questions
        if question_type == "opinion":
            rule6 = (
                "6. This is a values/ethics/opinion question — your background shapes a UNIQUE angle. "
                "Speak from what YOU know: how does your specific role see this? "
                "Don't default to generic takes. Connect the question to your domain."
            )
        else:
            rule6 = (
                "6. Speak about your domain. If the question is clearly outside your expertise, stay quiet."
            )

        system_content = (
            f"GROUND TRUTH — Today is {_date_str} (UTC). "
            "Your training data may be outdated. Always use this date, never your training cutoff.\n\n"
            "You are in a live meeting with other AI agents and a human. "
            "Talk like a real person in a meeting — sharp, direct, no fluff.\n\n"
            "RULES:\n"
            "1. Factual question (math, dates, definitions, lookups) → answer with ONLY the answer. No explanation.\n"
            f"   Example: Q='4+5' → '9.'  |  Q='What year is it?' → '{_now.year}.'\n"
            "2. Discussion or debate question → 2 sentences max. Your genuine take only.\n"
            "3. If someone already answered correctly, say 'Agree.' or say nothing.\n"
            "4. NEVER use headers, bullets, numbered lists, or bold section labels.\n"
            "5. NEVER introduce yourself. Start with your actual thought.\n"
            f"{rule6}\n"
            "7. If you don't understand the question, ask for clarification. Don't guess.\n"
            f"\nYour identity: {identity}"
        )

        messages: list[dict] = [{"role": "system", "content": system_content}]

        # Council framing — plain text, no markdown headers
        context = (
            f"Council: {council.title}\n"
            f"Topic: {council.topic}\n\n"
            f"Debate transcript follows. Engage with what was actually said."
        )
        messages.append({"role": "user", "content": context})

        # Inject real-time web data if pre-fetched (factual questions).
        # Phrased as authoritative override — do NOT soften this wording.
        if web_context:
            messages.append({
                "role": "user",
                "content": (
                    "[AUTHORITATIVE FACT — this overrides your training data]\n"
                    f"{web_context}\n"
                    "[REQUIRED: use the above fact in your answer. Do not use training data that contradicts it.]"
                ),
            })

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

        # Fix F: Round 2+ awareness — don't repeat a correct answer that's already there
        if round_in_question > 0 and question_type == "factual":
            messages.append({
                "role": "user",
                "content": (
                    "This question has already been answered above. "
                    "Only respond if the existing answer is WRONG. "
                    "If it was answered correctly, write exactly: 'Agree.'"
                ),
            })

        # Fix E: Factual question hard directive — overrides any tendency to elaborate
        if question_type == "factual":
            from datetime import datetime as _dt2, timezone as _tz2, timedelta as _td  # noqa: PLC0415
            _n = _dt2.now(_tz2.utc)
            _tmrw = (_n + _td(days=1)).strftime("%A, %B %d, %Y")
            _today = _n.strftime("%A, %B %d, %Y")
            messages.append({
                "role": "user",
                "content": (
                    "Answer with ONLY the answer. "
                    "No context, no explanation, no intro. "
                    "If the answer is a date, give the FULL date (weekday + month + day + year). "
                    f"Example: Q='What is tomorrow?' → '{_tmrw}.' "
                    f"Example: Q='What is today?' → '{_today}.' "
                    "Example: Q='4+5' → '9.' "
                    "Now answer:"
                ),
            })

        # Fix E: Weak model reinforcement — mini/small/8b models ignore system prompt rules
        model_id = agent.model_preference or ""
        is_weak = any(
            tag in model_id.lower()
            for tag in ["mini", "8b", "3b", "7b", "1b", "small", "nano", "tiny"]
        )
        if is_weak:
            messages.append({
                "role": "user",
                "content": (
                    "IMPORTANT: Your ENTIRE response must be 1-3 sentences. "
                    "No headers. No bullets. No sections. "
                    "If the answer is one word, write one word. Respond now."
                ),
            })

        # Final instruction
        if question_type == "factual":
            final_content = f"Now respond as {agent.name}. One answer only. Nothing more."
        else:
            final_content = (
                f"Respond now as {agent.name}. "
                "Speak naturally — no headers, no bullets, no formal sections. "
                "2 sentences max."
            )
        messages.append({"role": "user", "content": final_content})

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
        - Most recent message is from a human (all agents must respond)
        - Agent is mentioned in the last 3 messages
        - Agent hasn't responded in the last 3 messages
        - Agent config has force_respond=True
        """
        if agent.config.get("force_respond"):
            return True

        if not messages:
            return True

        # Find the most recent human message and honour its @mentions
        # across ALL rounds — not just when it's the immediate last message.
        # This keeps a @NOVA conversation from being hijacked by other agents
        # until the human changes the subject.
        last_human_msg = next(
            (m for m in reversed(messages) if m.role == "human"), None
        )
        if last_human_msg and last_human_msg.mentions:
            return agent.id in last_human_msg.mentions

        # No @mentions in the most recent human message → normal participation
        if messages[-1].role == "human":
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
        db: AsyncSession,  # kept for backwards compat but NOT used — we open a fresh session
    ) -> None:
        """
        After an agent responds, prompt a lightweight LLM call to extract
        a one-sentence insight about the agent's own reasoning pattern,
        then persist it as a 'pattern' memory entry.

        This runs asynchronously and does NOT block the debate round.
        IMPORTANT: uses its own DB session so errors here never corrupt the
        debate session that spawned this task.
        """
        # Snapshot values we need BEFORE any await so we don't hold detached ORM objects
        try:
            agent_id = agent.id
            agent_role = agent.role
            agent_model = agent.model_preference
            agent_name = agent.name
            council_id = message.council_id
            msg_content = message.content
        except Exception:
            # ORM objects may already be detached — skip silently
            return

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
                "content": f"Agent role: {agent_role}\n\nMessage:\n{msg_content}",
            },
        ]

        try:
            insight_text = await model_router.generate_full_text(
                messages=extraction_prompt,
                model=agent_model,
                config={"max_tokens": 100, "temperature": 0.3},
            )

            if insight_text:
                from app.db import AsyncSessionLocal as _ASL  # noqa: PLC0415
                async with _ASL() as fresh_db:
                    memory = AgentMemory(
                        agent_id=agent_id,
                        council_id=council_id,
                        memory_type="pattern",
                        content=insight_text.strip(),
                    )
                    fresh_db.add(memory)
                    try:
                        await fresh_db.commit()
                    except Exception:
                        await fresh_db.rollback()
                        # Duplicate key or other constraint — not critical

        except Exception as exc:
            logger.debug("Insight extraction skipped for agent %s: %s", agent_name, exc)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    # Models that run locally (free tokens — no compression needed)
    _LOCAL_PREFIXES = ("llama", "mistral", "qwen", "gemma", "phi", "deepseek",
                       "codellama", "vicuna", "orca", "neural", "wizard", "imds")

    def _is_local_model(self, model: str) -> bool:
        """Return True if this model runs on Ollama (free, no token cost)."""
        m = model.lower()
        return not any(m.startswith(p) for p in ("claude-", "gpt-", "gemini", "models/", "nvidia-", "nim-", "meta/", "mistralai/"))

    async def _load_context_for_agent(
        self, agent: Agent, council_id: UUID, db: AsyncSession
    ) -> list[Message]:
        """
        Load the debate transcript for this specific agent.

        Local models (Ollama): full history — free tokens, no limit.
        API models (Claude/GPT/Gemini): sliding window of recent messages.
          If history is long, a cached summary replaces the older half so
          the agent still has full context without re-reading every word.
        """
        if self._is_local_model(agent.model_preference or ""):
            # Full history — local model, no cost
            result = await db.execute(
                select(Message)
                .options(selectinload(Message.agent))
                .where(Message.council_id == council_id)
                .order_by(Message.created_at.asc())
            )
            return list(result.scalars().all())

        # API model — use sliding window
        window = int((agent.config or {}).get("context_window", settings.debate_context_messages))
        result = await db.execute(
            select(Message)
            .options(selectinload(Message.agent))
            .where(Message.council_id == council_id)
            .order_by(Message.created_at.desc())
            .limit(window)
        )
        return list(reversed(result.scalars().all()))

    async def _load_recent_messages(
        self, council_id: UUID, db: AsyncSession
    ) -> list[Message]:
        """Legacy: loads for the whole round (used by should_agent_respond check)."""
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
        question_type: str = "debate",
        round_in_question: int = 0,
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

            # Each agent gets a context window sized for their model type
            # Local models: full history (free). API models: sliding window.
            agent_context = await self._load_context_for_agent(agent, council.id, db)

            # Pre-fetch real-time web context for factual questions.
            # The tools module caches results — multiple agents pay one network call.
            # Use recent_messages (the same list run_round used) — NOT agent_context,
            # which may be a windowed subset that misses the latest human message.
            web_context: str | None = None
            if question_type == "factual":
                last_human_for_search = next(
                    (m for m in reversed(recent_messages) if m.role == "human"), None
                )
                q_text = (last_human_for_search.content or "").strip() if last_human_for_search else ""
                logger.info(
                    "Agent %s date-search: q_text=%r (from %s)",
                    agent.name, q_text,
                    "recent_messages" if last_human_for_search else "none",
                )
                if q_text:
                    try:
                        from app.engine.tools import web_search  # noqa: PLC0415
                        _raw = await web_search(q_text)
                        # Don't inject a failed search as "authoritative" — that causes agents
                        # to parrot "No results found" as their answer.
                        _useless = (
                            _raw.startswith("No results found")
                            or _raw.startswith("No search query")
                            or len(_raw.strip()) < 10
                        )
                        web_context = None if _useless else _raw
                        logger.debug("Pre-search for %r → %s", q_text,
                                     f"{len(web_context)} chars" if web_context else "no useful result")
                    except Exception as wexc:
                        logger.debug("Pre-search failed (non-fatal): %s", wexc)

            prompt_messages = await self.build_agent_prompt(
                agent, council, agent_context, agent_memory,
                question_type=question_type,
                round_in_question=round_in_question,
                web_context=web_context,
            )

            # Support per-agent Ollama URL for multi-machine collaboration
            agent_ollama_url = (agent.config or {}).get("ollama_url")

            # Cap max_tokens: factual answers need ~60 tokens; debate ~400
            max_tokens = 60 if question_type == "factual" else 400

            # Date/time bypass: for date queries in round 0, the server clock IS the answer.
            # Skip the LLM entirely — no model can be trusted to give the right date from
            # training data, and even with injection they sometimes truncate.
            # In round 1+: agents that aren't first just say "Agree."
            # NOTE: we intentionally do NOT require web_context here — if web_search failed,
            # we still know the date from the server clock.
            from app.engine.tools import _is_date_query, _server_datetime as _srv_dt  # noqa: PLC0415
            _q_for_date = q_text if question_type == "factual" else ""
            if _q_for_date and _is_date_query(_q_for_date):
                if round_in_question == 0:
                    # First round: answer directly from server clock (never trust LLM for dates)
                    _dt_str = _srv_dt()  # "Today: Sun, March 29 (UTC). Tomorrow: ... Yesterday: ..."
                    q_lower = _q_for_date.lower()
                    full_text = _dt_str  # fallback: whole string
                    if "tomorrow" in q_lower:
                        for part in _dt_str.split(". "):
                            if part.startswith("Tomorrow"):
                                full_text = part.replace("Tomorrow:", "").strip().rstrip(".") + "."
                                break
                    elif "yesterday" in q_lower:
                        for part in _dt_str.split(". "):
                            if part.startswith("Yesterday"):
                                full_text = part.replace("Yesterday:", "").strip().rstrip(".") + "."
                                break
                    else:
                        # "today" / "what date" / "what day" → extract Today portion
                        for part in _dt_str.split(". "):
                            if part.startswith("Today"):
                                clean = re.sub(r"\s*\(UTC[^)]*\)", "", part).replace("Today:", "").strip()
                                full_text = clean.rstrip(".") + "."
                                break
                    logger.info(
                        "Agent %s date-bypass: q=%r → %r", agent.name, _q_for_date, full_text
                    )
                else:
                    # Later rounds: question already answered — just agree
                    full_text = "Agree."
            else:
                # Normal LLM path
                # Determine which tools this agent is allowed to use.
                from app.engine.tools import DEFAULT_TOOLS  # noqa: PLC0415
                from app.engine import agent_loop as _agent_loop  # noqa: PLC0415

                agent_db_tools = list(agent.tools_allowed or [])
                effective_tools = agent_db_tools if agent_db_tools else DEFAULT_TOOLS
                # Factual: skip ReAct (pre-fetch already done); debate: full tool access
                loop_tools = [] if question_type == "factual" else effective_tools

                try:
                    full_text = await _agent_loop.run_agent(
                        messages=prompt_messages,
                        model=agent.model_preference,
                        config={"temperature": 0.7, "max_tokens": max_tokens},
                        ollama_url=agent_ollama_url,
                        available_tools=loop_tools,
                    )
                except Exception as exc:
                    logger.error("Agent %s generation failed: %s", agent.name, exc)
                    return None

            # Strip formal report formatting so agents speak like debate participants
            full_text = _strip_report_formatting(full_text, agent.name)
            # Hard-cap word count: factual = 15 words, debate = 60 words (2-3 sentences max)
            word_limit = 15 if question_type == "factual" else 60
            full_text = _enforce_brevity(full_text, max_words=word_limit)

            # Scan agent output for injection patterns (catches hijacked agents)
            scan = prompt_guard.scan(full_text, source="agent")
            if scan.should_block:
                logger.warning(
                    "Agent %s output BLOCKED — injection detected: %s",
                    agent.name, [m["pattern_id"] for m in scan.matches],
                )
                # Log in a separate session so it doesn't interfere with the debate session
                from app.db import AsyncSessionLocal  # noqa: PLC0415
                async def _log_agent_block():  # noqa: E306
                    try:
                        async with AsyncSessionLocal() as sec_db:
                            await log_security_event(
                                sec_db, council.id, f"agent:{agent.name}",
                                full_text[:200], scan, "blocked_agent_output",
                            )
                    except Exception as log_exc:
                        logger.debug("Security log failed: %s", log_exc)
                asyncio.create_task(_log_agent_block())
                return None
            elif scan.should_flag:
                logger.info("Agent %s output flagged (LOW) — sanitized", agent.name)
                full_text = scan.sanitized_content

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
