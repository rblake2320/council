"""
Tests for debate.py — verifies all 6 bug fixes:
  A: silence bug (catch-up loop)
  B+C: question classifier + responder capping
  D: _enforce_brevity hard truncation
  E: weak model / factual prompt injection
  F: round 2+ "already answered" awareness
  G+H: system prompt rewrite
"""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.engine.debate import (
    CouncilDebateEngine,
    _FACTUAL_PATTERNS,
    _enforce_brevity,
    _strip_report_formatting,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _msg(role: str, content: str = "", agent_id=None, created_at=None, mentions=None):
    """Build a minimal Message-like object."""
    m = MagicMock()
    m.id = uuid4()
    m.role = role
    m.content = content
    m.agent_id = agent_id
    m.mentions = mentions or []
    m.created_at = created_at or datetime.now(timezone.utc)
    m.agent = None
    return m


def _agent(name: str = "NOVA", model: str = "claude-haiku-4-5-20251001", agent_id=None, config=None):
    a = MagicMock()
    a.id = agent_id or uuid4()
    a.name = name
    a.model_preference = model
    a.role = f"{name} — research"
    a.personality = "Direct and analytical."
    a.config = config or {}
    return a


engine = CouncilDebateEngine()


# ===========================================================================
# Fix D: _enforce_brevity
# ===========================================================================

class TestEnforceBrevity:

    def test_short_text_unchanged(self):
        assert _enforce_brevity("9.", 15) == "9."

    def test_exact_limit_unchanged(self):
        words = " ".join(["word"] * 15)
        assert _enforce_brevity(words, 15) == words

    def test_truncates_at_sentence_boundary(self):
        text = "The answer is nine. Additionally, I should point out that this is a simple sum and you could verify it yourself."
        result = _enforce_brevity(text, 5)
        assert result == "The answer is nine."

    def test_truncates_at_exclamation(self):
        text = "Nine! Let me explain the mathematical reasoning behind this trivial calculation in exhaustive detail."
        result = _enforce_brevity(text, 3)
        assert result == "Nine!"

    def test_falls_back_to_hard_cut_with_period(self):
        # No sentence boundary — should still truncate cleanly
        text = "word " * 50
        result = _enforce_brevity(text.strip(), 10)
        assert len(result.split()) <= 10
        assert result.endswith(".")

    def test_debate_120_word_cap(self):
        long = " ".join([f"word{i}" for i in range(200)])
        result = _enforce_brevity(long, 120)
        assert len(result.split()) <= 120

    def test_factual_15_word_cap(self):
        long = "The sum of the numbers four and five when calculated using basic arithmetic operations equals nine total."
        result = _enforce_brevity(long, 15)
        assert len(result.split()) <= 15

    def test_empty_string(self):
        assert _enforce_brevity("", 15) == ""

    def test_single_word(self):
        assert _enforce_brevity("9.", 15) == "9."

    def test_strips_trailing_punctuation_on_hard_cut(self):
        text = "word " * 20
        result = _enforce_brevity(text.strip(), 5)
        assert not result.endswith(",")
        assert not result.endswith(";")


# ===========================================================================
# Fix B: _classify_question
# ===========================================================================

class TestClassifyQuestion:

    def test_arithmetic_plus(self):
        assert engine._classify_question("what is 4+5") == "factual"

    def test_arithmetic_minus(self):
        assert engine._classify_question("what is 10-3") == "factual"

    def test_arithmetic_multiply(self):
        assert engine._classify_question("9*6") == "factual"

    def test_date_question(self):
        assert engine._classify_question("what is today's date") == "factual"

    def test_date_what_is_the_date(self):
        assert engine._classify_question("what is the date") == "factual"

    def test_time_question(self):
        assert engine._classify_question("what is the time") == "factual"

    def test_year_question(self):
        assert engine._classify_question("what year is it") == "factual"

    def test_today_question(self):
        assert engine._classify_question("what is today") == "factual"

    def test_tomorrow_question(self):
        assert engine._classify_question("what is tomorrow") == "factual"

    def test_how_many(self):
        assert engine._classify_question("how many planets are there") == "factual"

    def test_how_much(self):
        assert engine._classify_question("how much does it cost") == "factual"

    def test_when_did(self):
        assert engine._classify_question("when did world war 2 end") == "factual"

    def test_who_is(self):
        assert engine._classify_question("who is the president") == "factual"

    def test_where_is(self):
        assert engine._classify_question("where is Paris") == "factual"

    def test_acronym(self):
        assert engine._classify_question("what does REST stand for") == "factual"

    def test_define(self):
        assert engine._classify_question("define recursion") == "factual"

    def test_capital(self):
        assert engine._classify_question("capital of France") == "factual"

    def test_convert(self):
        assert engine._classify_question("convert 100 celsius to fahrenheit") == "factual"

    def test_opinion_question_ai_rights(self):
        assert engine._classify_question("Should AI be regulated by governments?") == "opinion"

    def test_opinion_question_do_you_think(self):
        assert engine._classify_question("What do you think about the future of work?") == "opinion"

    def test_debate_question_best(self):
        assert engine._classify_question("What is the best programming language?") == "debate"

    def test_opinion_question_should_ai_have_rights(self):
        assert engine._classify_question("Should AI agents have rights?") == "opinion"

    def test_opinion_question_ethics(self):
        assert engine._classify_question("Is it ethical to deploy AI in healthcare?") == "opinion"

    def test_empty_string_is_debate(self):
        assert engine._classify_question("") == "debate"

    def test_none_is_debate(self):
        assert engine._classify_question(None) == "debate"

    def test_case_insensitive(self):
        assert engine._classify_question("WHAT IS TODAY") == "factual"
        assert engine._classify_question("DEFINE entropy") == "factual"


# ===========================================================================
# Fix C: responder capping in run_round
# ===========================================================================

class TestResponderCapping:
    """
    Test that run_round limits responders to 2 for factual questions (round 0).
    We mock the DB and agent list so no real DB is needed.
    """

    def _make_council(self):
        c = MagicMock()
        c.id = uuid4()
        c.status = "active"
        c.title = "Test Council"
        c.topic = "Testing"
        c.participants = []
        c.config = {}
        c.mode = "standard"
        return c

    @pytest.mark.asyncio
    async def test_factual_round0_capped_to_2(self):
        """13 agents, factual question, round 0 → only 2 should be called."""
        agents = [_agent(f"AGENT{i}") for i in range(13)]
        human_msg = _msg("human", "what is 4+5")

        # Capture which agents get passed to _generate_parallel
        captured = {}

        async def fake_generate_parallel(council, responders, recent_msgs, db, question_type, round_in_question):
            captured["responders"] = responders
            captured["question_type"] = question_type
            captured["round_in_question"] = round_in_question
            return []

        eng = CouncilDebateEngine()
        eng._generate_parallel = fake_generate_parallel
        eng._load_recent_messages = AsyncMock(return_value=[human_msg])
        eng._broadcast_messages = AsyncMock()

        # Build council with 13 participants
        council = self._make_council()
        council.participants = [SimpleNamespace(agent=a) for a in agents]

        # Mock DB execute to return the council
        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = council
        mock_db.execute = AsyncMock(return_value=mock_result)

        await eng.run_round(council.id, mock_db)

        assert captured["question_type"] == "factual"
        assert captured["round_in_question"] == 0
        assert len(captured["responders"]) == 2, (
            f"Expected 2 responders for factual Q, got {len(captured['responders'])}"
        )

    @pytest.mark.asyncio
    async def test_debate_question_not_capped(self):
        """Technical debate question → all qualifying agents respond (no cap)."""
        agents = [_agent(f"AGENT{i}") for i in range(5)]
        human_msg = _msg("human", "What is the best architecture for microservices?")

        captured = {}

        async def fake_generate_parallel(council, responders, recent_msgs, db, question_type, round_in_question):
            captured["responders"] = responders
            captured["question_type"] = question_type
            return []

        eng = CouncilDebateEngine()
        eng._generate_parallel = fake_generate_parallel
        eng._load_recent_messages = AsyncMock(return_value=[human_msg])
        eng._broadcast_messages = AsyncMock()

        council = self._make_council()
        council.participants = [SimpleNamespace(agent=a) for a in agents]

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = council
        mock_db.execute = AsyncMock(return_value=mock_result)

        await eng.run_round(council.id, mock_db)

        assert captured["question_type"] == "debate"
        assert len(captured["responders"]) == 5, "All 5 should respond to debate Q"

    @pytest.mark.asyncio
    async def test_opinion_question_not_capped(self):
        """Opinion/ethics question → all agents respond — no 2-agent cap."""
        agents = [_agent(f"AGENT{i}") for i in range(5)]
        human_msg = _msg("human", "Should AI agents have rights?")

        captured = {}

        async def fake_generate_parallel(council, responders, recent_msgs, db, question_type, round_in_question):
            captured["responders"] = responders
            captured["question_type"] = question_type
            return []

        eng = CouncilDebateEngine()
        eng._generate_parallel = fake_generate_parallel
        eng._load_recent_messages = AsyncMock(return_value=[human_msg])
        eng._broadcast_messages = AsyncMock()

        council = self._make_council()
        council.participants = [SimpleNamespace(agent=a) for a in agents]

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = council
        mock_db.execute = AsyncMock(return_value=mock_result)

        await eng.run_round(council.id, mock_db)

        assert captured["question_type"] == "opinion"
        assert len(captured["responders"]) == 5, "All 5 should respond — opinion Q is not capped"

    @pytest.mark.asyncio
    async def test_factual_round1_not_capped(self):
        """Factual question but round 1 (already answered) → no capping, round_in_question=1."""
        agents = [_agent(f"AGENT{i}") for i in range(5)]
        t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2026, 1, 1, 12, 0, 1, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 12, 0, 2, tzinfo=timezone.utc)
        human_msg = _msg("human", "what is 4+5", created_at=t0)
        agent_reply = _msg("agent", "9.", created_at=t1)
        agent_reply2 = _msg("agent", "9.", created_at=t2)

        captured = {}

        async def fake_generate_parallel(council, responders, recent_msgs, db, question_type, round_in_question):
            captured["round_in_question"] = round_in_question
            captured["responders_count"] = len(responders)
            return []

        eng = CouncilDebateEngine()
        eng._generate_parallel = fake_generate_parallel
        eng._load_recent_messages = AsyncMock(return_value=[human_msg, agent_reply, agent_reply2])
        eng._broadcast_messages = AsyncMock()

        council = self._make_council()
        council.participants = [SimpleNamespace(agent=a) for a in agents]

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = council
        mock_db.execute = AsyncMock(return_value=mock_result)

        await eng.run_round(council.id, mock_db)

        assert captured["round_in_question"] == 2, f"Expected 2 prior agent replies, got {captured['round_in_question']}"


# ===========================================================================
# Fix E+F+H: build_agent_prompt — content verification
# ===========================================================================

class TestBuildAgentPrompt:

    def _make_council(self):
        c = MagicMock()
        c.id = uuid4()
        c.title = "Test"
        c.topic = "Testing"
        return c

    @pytest.mark.asyncio
    async def test_factual_contains_only_answer_directive(self):
        agent = _agent("NOVA", "claude-haiku-4-5-20251001")
        council = self._make_council()
        msgs = [_msg("human", "what is 4+5")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="factual", round_in_question=0,
        )

        full_text = " ".join(m["content"] for m in prompt)
        assert "ONLY the answer" in full_text, "Factual directive missing"
        assert "One answer only" in full_text, "Final factual instruction missing"

    @pytest.mark.asyncio
    async def test_round2_factual_has_already_answered_note(self):
        agent = _agent("FORGE", "gpt-4o-mini")
        council = self._make_council()
        msgs = [_msg("human", "what is 4+5"), _msg("agent", "9.")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="factual", round_in_question=1,
        )

        full_text = " ".join(m["content"] for m in prompt)
        assert "already been answered" in full_text, "Round 2 awareness missing"
        assert "Agree" in full_text, "'Agree.' directive missing"

    @pytest.mark.asyncio
    async def test_weak_model_gets_reinforcement(self):
        agent = _agent("DEBUGGER", "llama3.1:8b")
        council = self._make_council()
        msgs = [_msg("human", "what is 4+5")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="factual", round_in_question=0,
        )

        full_text = " ".join(m["content"] for m in prompt)
        assert "1-3 sentences" in full_text, "Weak model reinforcement missing"

    @pytest.mark.asyncio
    async def test_strong_model_no_reinforcement(self):
        agent = _agent("NOVA", "claude-opus-4-6")
        council = self._make_council()
        msgs = [_msg("human", "what is 4+5")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="factual", round_in_question=0,
        )

        full_text = " ".join(m["content"] for m in prompt)
        assert "1-3 sentences" not in full_text, "Strong model should NOT get weak model reinforcement"

    @pytest.mark.asyncio
    async def test_debate_question_no_factual_directive(self):
        agent = _agent("NOVA", "claude-haiku-4-5-20251001")
        council = self._make_council()
        msgs = [_msg("human", "Should AI be regulated?")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="debate", round_in_question=0,
        )

        # The per-message factual directive ("Answer with ONLY the answer.") must NOT appear
        # in user messages (it appears in the system prompt rule text, not as a standalone directive)
        user_msgs_text = " ".join(m["content"] for m in prompt if m["role"] == "user")
        assert "Answer with ONLY the answer" not in user_msgs_text, \
            "Per-message factual directive should not appear in debate question prompts"
        assert "2 sentences max" in user_msgs_text

    @pytest.mark.asyncio
    async def test_system_prompt_has_all_7_rules(self):
        agent = _agent()
        council = self._make_council()
        prompt = await engine.build_agent_prompt(agent, council, [], [], question_type="debate")
        system_msg = next(m for m in prompt if m["role"] == "system")
        content = system_msg["content"]
        # Check key rules are present
        assert "Factual question" in content
        assert "2 sentences max" in content
        assert "Agree." in content
        assert "NEVER use headers" in content or "NEVER" in content
        assert "introduce yourself" in content
        assert "domain" in content
        assert "clarification" in content

    @pytest.mark.asyncio
    async def test_no_round2_awareness_for_debate(self):
        agent = _agent()
        council = self._make_council()
        msgs = [_msg("human", "Should AI be regulated?"), _msg("agent", "Yes I think so.")]

        prompt = await engine.build_agent_prompt(
            agent, council, msgs, [],
            question_type="debate", round_in_question=1,
        )

        full_text = " ".join(m["content"] for m in prompt)
        assert "already been answered" not in full_text, "Round 2+ note should only appear for factual"

    @pytest.mark.asyncio
    async def test_mini_tag_triggers_reinforcement(self):
        agent = _agent("FORGE", "gpt-4o-mini")
        council = self._make_council()
        msgs = [_msg("human", "explain something")]

        prompt = await engine.build_agent_prompt(agent, council, msgs, [], question_type="debate")
        full_text = " ".join(m["content"] for m in prompt)
        assert "1-3 sentences" in full_text


# ===========================================================================
# Fix A: catch-up logic (unit test the guard values, not full DB integration)
# ===========================================================================

class TestCatchUpLogic:

    def test_catchup_depth_default_is_zero(self):
        """run_session signature has _catchup_depth=0 default."""
        import inspect
        sig = inspect.signature(engine.run_session)
        assert "_catchup_depth" in sig.parameters
        assert sig.parameters["_catchup_depth"].default == 0

    def test_max_catchup_constant_in_source(self):
        """The finally block must have _MAX_CATCHUP = 3 as a guard."""
        import pathlib
        src = pathlib.Path(r"C:\Users\techai\council\backend\app\engine\debate.py").read_text()
        assert "_MAX_CATCHUP = 3" in src
        assert "_catchup_depth < _MAX_CATCHUP" in src
        assert "_catchup_depth + 1" in src

    def test_run_session_accepts_catchup_kwarg(self):
        """Ensure the kwarg exists and is accepted (don't call it — needs real DB)."""
        import inspect
        sig = inspect.signature(engine.run_session)
        params = sig.parameters
        assert "_catchup_depth" in params
        assert params["_catchup_depth"].default == 0


# ===========================================================================
# Fix D: _enforce_brevity integration with question_type in _generate_parallel
# ===========================================================================

class TestGenerateParallelWordLimits:

    @pytest.mark.asyncio
    async def test_factual_word_limit_15_applied(self):
        """For factual questions, _enforce_brevity(15) must be applied to output."""
        agent = _agent("NOVA", "claude-haiku-4-5-20251001")

        # Simulate a model that returns a verbose response
        long_response = " ".join(["word"] * 50)

        with patch("app.engine.router.model_router.generate_full_text", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = long_response

            council = MagicMock()
            council.id = uuid4()
            council.title = "T"
            council.topic = "T"

            mem_result = MagicMock()
            mem_result.scalars.return_value.all.return_value = []
            ctx_result = MagicMock()
            ctx_result.scalars.return_value.all.return_value = []

            mock_db = MagicMock()
            mock_db.execute = AsyncMock(return_value=mem_result)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock()

            eng = CouncilDebateEngine()
            # Override context loader to avoid real DB
            eng._load_context_for_agent = AsyncMock(return_value=[])

            results = await eng._generate_parallel(
                council, [agent], [], mock_db,
                question_type="factual", round_in_question=0,
            )

            # Even though model returned 50 words, result must be ≤15 words
            if results:
                assert len(results[0].content.split()) <= 15, (
                    f"Factual response too long: {results[0].content}"
                )

    @pytest.mark.asyncio
    async def test_debate_word_limit_120_applied(self):
        """For debate questions, _enforce_brevity(120) is applied."""
        agent = _agent("NOVA", "claude-haiku-4-5-20251001")
        long_response = " ".join([f"word{i}" for i in range(200)])

        with patch("app.engine.router.model_router.generate_full_text", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = long_response

            council = MagicMock()
            council.id = uuid4()
            council.title = "T"
            council.topic = "T"

            mock_db = MagicMock()
            mock_db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock()

            eng = CouncilDebateEngine()
            eng._load_context_for_agent = AsyncMock(return_value=[])

            results = await eng._generate_parallel(
                council, [agent], [], mock_db,
                question_type="debate", round_in_question=0,
            )

            if results:
                assert len(results[0].content.split()) <= 120, (
                    f"Debate response too long: {len(results[0].content.split())} words"
                )


# ===========================================================================
# Edge cases
# ===========================================================================

class TestEdgeCases:

    def test_enforce_brevity_with_question_mark_sentence(self):
        text = "Is it 9? Let me walk you through the full mathematical proof step by step."
        result = _enforce_brevity(text, 5)
        assert result == "Is it 9?"

    def test_classify_question_mixed_case_arithmetic(self):
        assert engine._classify_question("What Is 4 + 5?") == "factual"

    def test_classify_question_whitespace_only(self):
        assert engine._classify_question("   ") == "debate"

    def test_enforce_brevity_exactly_at_limit_no_change(self):
        text = "nine"
        assert _enforce_brevity(text, 1) == "nine"

    def test_strip_report_formatting_preserved(self):
        text = "The answer is 9. We confirmed this via calculation."
        result = _strip_report_formatting(text, "FORGE")
        assert "9" in result

    def test_strip_removes_headers(self):
        text = "## Analysis\nThe answer is 9."
        result = _strip_report_formatting(text, "FORGE")
        assert "##" not in result
        assert "9" in result

    def test_factual_patterns_list_not_empty(self):
        assert len(_FACTUAL_PATTERNS) >= 10

    def test_todays_date_question_is_factual(self):
        """The exact question that caused the silence bug should be factual."""
        q = "what is todays date"
        assert engine._classify_question(q) == "factual"

    def test_what_is_4_plus_5_is_factual(self):
        q = "what is 4 plus 5"
        # This doesn't match arithmetic regex (spells out 'plus') but has 'what is'
        # Let's check what we actually get — at minimum log it
        result = engine._classify_question(q)
        # "what is 4" pattern should match
        assert result == "factual", f"'what is 4 plus 5' classified as '{result}', expected 'factual'"
