"""
Tests for tools.py and agent_loop.py — internet access and tool use layer.
"""
import asyncio
import re
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.engine.tools import (
    DEFAULT_TOOLS,
    TOOL_FUNCTIONS,
    _CACHE,
    _cache_set,
    _cached,
    _ddg_instant,
    _is_date_query,
    _server_datetime,
    run_cli,
    web_fetch,
    web_search,
)
from app.engine.agent_loop import (
    _ACTION_RE,
    _strip_action_lines,
    run_agent,
)


# ===========================================================================
# tools.py — cache helpers
# ===========================================================================

class TestCache:

    def test_cache_miss(self):
        # Fresh key should miss
        assert _cached("nonexistent_key_xyz_123") is None

    def test_cache_set_and_hit(self):
        _cache_set("test_key_abc", "test_value")
        assert _cached("test_key_abc") == "test_value"

    def test_cache_expiry(self):
        # Inject an expired entry
        _CACHE["expired_key"] = ("old_value", time.monotonic() - 400)  # 400s ago > 300s TTL
        assert _cached("expired_key") is None

    def test_cache_fresh(self):
        _cache_set("fresh_key", "fresh_value")
        assert _cached("fresh_key") == "fresh_value"


# ===========================================================================
# tools.py — date query detection
# ===========================================================================

class TestDateQuery:

    def test_today_is_date_query(self):
        assert _is_date_query("what is today") is True

    def test_todays_date_is_date_query(self):
        assert _is_date_query("what is todays date") is True

    def test_current_date_is_date_query(self):
        assert _is_date_query("what is the current date") is True

    def test_what_time_is_date_query(self):
        assert _is_date_query("what time is it") is True

    def test_what_year_is_date_query(self):
        assert _is_date_query("what year is it") is True

    def test_random_question_not_date_query(self):
        assert _is_date_query("should AI be regulated") is False

    def test_arithmetic_not_date_query(self):
        assert _is_date_query("what is 4+5") is False


# ===========================================================================
# tools.py — server_datetime
# ===========================================================================

class TestServerDatetime:

    def test_contains_year_2026(self):
        result = _server_datetime()
        assert "2026" in result

    def test_contains_utc(self):
        result = _server_datetime()
        assert "UTC" in result

    def test_contains_date_format(self):
        result = _server_datetime()
        # Should contain a full month name
        months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"]
        assert any(m in result for m in months)


# ===========================================================================
# tools.py — web_search
# ===========================================================================

class TestWebSearch:

    @pytest.mark.asyncio
    async def test_empty_query_returns_message(self):
        result = await web_search("")
        assert "No search query" in result

    @pytest.mark.asyncio
    async def test_date_query_returns_server_datetime_no_network(self):
        """Date queries must NOT hit the network — answered from server clock."""
        with patch("app.engine.tools._get_http") as mock_http:
            result = await web_search("what is todays date")
        mock_http.assert_not_called()
        assert "2026" in result

    @pytest.mark.asyncio
    async def test_todays_date_is_cached_after_first_call(self):
        # Clear any existing cache for this query
        _CACHE.pop("s:what is todays date", None)
        result1 = await web_search("what is todays date")
        result2 = await web_search("what is todays date")
        assert result1 == result2

    @pytest.mark.asyncio
    async def test_returns_cached_result(self):
        _cache_set("s:test cached query xyz", "cached result xyz")
        result = await web_search("test cached query xyz")
        assert result == "cached result xyz"

    @pytest.mark.asyncio
    async def test_ddg_instant_answer_used_when_api_keys_absent(self):
        """With no Tavily/Brave keys, should fall through to DDG."""
        with patch("app.engine.tools._tavily_search", new_callable=AsyncMock) as mock_t, \
             patch("app.engine.tools._brave_search", new_callable=AsyncMock) as mock_b, \
             patch("app.engine.tools._ddg_instant", new_callable=AsyncMock) as mock_d:
            mock_d.return_value = "DDG result for python asyncio"
            _CACHE.pop("s:python asyncio", None)

            from app.config import settings
            orig_tavily = settings.tavily_api_key
            orig_brave = settings.brave_search_api_key
            settings.tavily_api_key = ""
            settings.brave_search_api_key = ""

            try:
                result = await web_search("python asyncio")
                mock_d.assert_called_once_with("python asyncio")
                assert result == "DDG result for python asyncio"
            finally:
                settings.tavily_api_key = orig_tavily
                settings.brave_search_api_key = orig_brave

    @pytest.mark.asyncio
    async def test_tavily_used_when_key_present(self):
        """When TAVILY_API_KEY is set, Tavily should be tried first."""
        with patch("app.engine.tools._tavily_search", new_callable=AsyncMock) as mock_t, \
             patch("app.engine.tools._ddg_instant", new_callable=AsyncMock) as mock_d:
            mock_t.return_value = "Tavily result"
            _CACHE.pop("s:test tavily query", None)

            from app.config import settings
            orig = settings.tavily_api_key
            settings.tavily_api_key = "fake-key-123"

            try:
                result = await web_search("test tavily query")
                mock_t.assert_called_once()
                mock_d.assert_not_called()
                assert result == "Tavily result"
            finally:
                settings.tavily_api_key = orig

    @pytest.mark.asyncio
    async def test_falls_back_to_ddg_when_tavily_returns_none(self):
        with patch("app.engine.tools._tavily_search", new_callable=AsyncMock) as mock_t, \
             patch("app.engine.tools._ddg_instant", new_callable=AsyncMock) as mock_d:
            mock_t.return_value = None
            mock_d.return_value = "DDG fallback"
            _CACHE.pop("s:fallback test query", None)

            from app.config import settings
            orig = settings.tavily_api_key
            settings.tavily_api_key = "fake-key"

            try:
                result = await web_search("fallback test query")
                assert result == "DDG fallback"
            finally:
                settings.tavily_api_key = orig

    @pytest.mark.asyncio
    async def test_no_results_message_when_all_fail(self):
        with patch("app.engine.tools._tavily_search", new_callable=AsyncMock) as mock_t, \
             patch("app.engine.tools._brave_search", new_callable=AsyncMock) as mock_b, \
             patch("app.engine.tools._ddg_instant", new_callable=AsyncMock) as mock_d:
            mock_t.return_value = None
            mock_b.return_value = None
            mock_d.return_value = None
            _CACHE.pop("s:impossible query zzz", None)

            from app.config import settings
            settings.tavily_api_key = ""
            settings.brave_search_api_key = ""

            result = await web_search("impossible query zzz")
            assert "No results" in result


# ===========================================================================
# tools.py — web_fetch
# ===========================================================================

class TestWebFetch:

    @pytest.mark.asyncio
    async def test_invalid_url_rejected(self):
        result = await web_fetch("not-a-url")
        assert "Invalid URL" in result

    @pytest.mark.asyncio
    async def test_html_stripped_from_response(self):
        fake_html = "<html><body><h1>Hello</h1><p>World</p></body></html>"
        mock_resp = MagicMock()
        mock_resp.text = fake_html
        mock_resp.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.engine.tools._get_http", return_value=mock_client):
            _CACHE.pop("f:https://example.com/test", None)
            result = await web_fetch("https://example.com/test")

        assert "<html>" not in result
        assert "<h1>" not in result
        assert "Hello" in result
        assert "World" in result

    @pytest.mark.asyncio
    async def test_truncates_to_max_chars(self):
        fake_html = "A" * 5000
        mock_resp = MagicMock()
        mock_resp.text = fake_html
        mock_resp.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.engine.tools._get_http", return_value=mock_client):
            _CACHE.pop("f:https://example.com/long", None)
            result = await web_fetch("https://example.com/long", max_chars=100)

        assert len(result) <= 200  # 100 + "[truncated]" suffix
        assert "truncated" in result

    @pytest.mark.asyncio
    async def test_cached_after_first_fetch(self):
        _cache_set("f:https://cached.example.com", "cached page content")
        mock_client = MagicMock()
        mock_client.get = AsyncMock()

        with patch("app.engine.tools._get_http", return_value=mock_client):
            result = await web_fetch("https://cached.example.com")

        mock_client.get.assert_not_called()
        assert result == "cached page content"

    @pytest.mark.asyncio
    async def test_strips_script_and_style_blocks(self):
        fake_html = (
            "<html><head><style>body{color:red}</style></head>"
            "<body><script>alert('xss')</script><p>Clean content</p></body></html>"
        )
        mock_resp = MagicMock()
        mock_resp.text = fake_html
        mock_resp.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.engine.tools._get_http", return_value=mock_client):
            _CACHE.pop("f:https://example.com/scripts", None)
            result = await web_fetch("https://example.com/scripts")

        assert "alert" not in result
        assert "color:red" not in result
        assert "Clean content" in result


# ===========================================================================
# tools.py — run_cli
# ===========================================================================

class TestRunCli:

    @pytest.mark.asyncio
    async def test_echo_is_allowed(self):
        result = await run_cli('echo hello')
        assert "hello" in result

    @pytest.mark.asyncio
    async def test_rm_is_blocked(self):
        result = await run_cli("rm -rf /")
        assert "not permitted" in result.lower() or "blocked" in result.lower()

    @pytest.mark.asyncio
    async def test_pipe_is_blocked(self):
        # "echo foo | cat" — " | " is in _CLI_DANGEROUS, should be blocked even though echo is allowed
        result = await run_cli("echo foo | cat")
        assert "blocked" in result.lower() or "not permitted" in result.lower()

    @pytest.mark.asyncio
    async def test_unknown_command_is_blocked(self):
        # nmap is NOT in the allowlist — should be rejected
        result = await run_cli("nmap -sS 192.168.1.1")
        assert "not permitted" in result.lower() or "blocked" in result.lower()

    @pytest.mark.asyncio
    async def test_redirect_is_blocked(self):
        result = await run_cli("echo foo > /tmp/evil")
        assert "blocked" in result.lower() or "not permitted" in result.lower()


# ===========================================================================
# tools.py — registry
# ===========================================================================

class TestToolRegistry:

    def test_tool_functions_has_expected_keys(self):
        assert "web_search" in TOOL_FUNCTIONS
        assert "web_fetch" in TOOL_FUNCTIONS
        assert "calculate" in TOOL_FUNCTIONS
        assert "http_call" in TOOL_FUNCTIONS
        assert "run_cli" in TOOL_FUNCTIONS

    def test_default_tools_excludes_run_cli(self):
        assert "run_cli" not in DEFAULT_TOOLS

    def test_default_tools_includes_core_tools(self):
        assert "web_search" in DEFAULT_TOOLS
        assert "web_fetch" in DEFAULT_TOOLS
        assert "calculate" in DEFAULT_TOOLS
        assert "http_call" in DEFAULT_TOOLS

    def test_all_tool_functions_are_callable(self):
        for name, fn in TOOL_FUNCTIONS.items():
            assert callable(fn), f"{name} is not callable"


# ===========================================================================
# tools.py — calculate
# ===========================================================================

class TestCalculate:

    @pytest.mark.asyncio
    async def test_basic_addition(self):
        from app.engine.tools import calculate
        assert await calculate("4 + 5") == "9"

    @pytest.mark.asyncio
    async def test_multiplication(self):
        from app.engine.tools import calculate
        assert await calculate("6 * 7") == "42"

    @pytest.mark.asyncio
    async def test_power(self):
        from app.engine.tools import calculate
        assert await calculate("2 ** 10") == "1024"

    @pytest.mark.asyncio
    async def test_division_float(self):
        from app.engine.tools import calculate
        result = await calculate("10 / 4")
        assert result == "2.5"

    @pytest.mark.asyncio
    async def test_integer_division_strips_dot_zero(self):
        from app.engine.tools import calculate
        result = await calculate("10 / 2")
        assert result == "5"  # not "5.0"

    @pytest.mark.asyncio
    async def test_modulo(self):
        from app.engine.tools import calculate
        assert await calculate("17 % 5") == "2"

    @pytest.mark.asyncio
    async def test_division_by_zero(self):
        from app.engine.tools import calculate
        result = await calculate("1 / 0")
        assert "zero" in result.lower()

    @pytest.mark.asyncio
    async def test_unsafe_expression_blocked(self):
        from app.engine.tools import calculate
        result = await calculate("__import__('os').system('ls')")
        assert "blocked" in result.lower() or "unsupported" in result.lower() or "error" in result.lower()

    @pytest.mark.asyncio
    async def test_empty_expression(self):
        from app.engine.tools import calculate
        result = await calculate("")
        assert "no expression" in result.lower()


# ===========================================================================
# tools.py — http_call
# ===========================================================================

class TestHttpCall:

    @pytest.mark.asyncio
    async def test_invalid_format_rejected(self):
        from app.engine.tools import http_call
        result = await http_call("not a valid spec")
        assert "invalid format" in result.lower()

    @pytest.mark.asyncio
    async def test_invalid_json_body_rejected(self):
        from app.engine.tools import http_call
        result = await http_call("POST http://localhost:9999/test not-json")
        assert "invalid json" in result.lower()

    @pytest.mark.asyncio
    async def test_get_request_parses_correctly(self):
        from app.engine.tools import http_call, _HTTP_METHOD_RE
        spec = "GET http://localhost:11434/api/tags"
        m = _HTTP_METHOD_RE.match(spec)
        assert m is not None
        assert m.group(1).upper() == "GET"
        assert m.group(2) == "http://localhost:11434/api/tags"

    @pytest.mark.asyncio
    async def test_post_with_json_body_parses_correctly(self):
        from app.engine.tools import _HTTP_METHOD_RE
        spec = 'POST http://localhost:8100/api/search {"query": "AI"}'
        m = _HTTP_METHOD_RE.match(spec)
        assert m is not None
        assert m.group(1).upper() == "POST"
        body = m.group(4) or ""
        import json
        data = json.loads(body)
        assert data["query"] == "AI"


# ===========================================================================
# agent_loop.py — action parsing
# ===========================================================================

class TestActionParsing:

    def test_parses_web_search(self):
        text = 'Let me look this up.\nACTION: web_search("python asyncio")\nMore text.'
        m = _ACTION_RE.search(text)
        assert m is not None
        assert m.group(1) == "web_search"
        assert m.group(2) == "python asyncio"

    def test_parses_web_fetch(self):
        text = 'ACTION: web_fetch("https://example.com/page")'
        m = _ACTION_RE.search(text)
        assert m is not None
        assert m.group(1) == "web_fetch"
        assert m.group(2) == "https://example.com/page"

    def test_parses_run_cli(self):
        text = 'ACTION: run_cli("echo hello world")'
        m = _ACTION_RE.search(text)
        assert m is not None
        assert m.group(1) == "run_cli"

    def test_parses_calculate(self):
        text = 'ACTION: calculate("4 + 5 * 2")'
        m = _ACTION_RE.search(text)
        assert m is not None
        assert m.group(1) == "calculate"
        assert m.group(2) == "4 + 5 * 2"

    def test_parses_http_call(self):
        text = 'ACTION: http_call("GET http://localhost:11434/api/tags")'
        m = _ACTION_RE.search(text)
        assert m is not None
        assert m.group(1) == "http_call"

    def test_no_match_for_normal_text(self):
        assert _ACTION_RE.search("This is a normal response with no tool calls.") is None

    def test_strip_action_lines_removes_action(self):
        text = "I'll look this up.\nACTION: web_search(\"test\")\nHere is the answer."
        result = _strip_action_lines(text)
        assert "ACTION:" not in result
        assert "I'll look this up." in result
        assert "Here is the answer." in result

    def test_strip_action_lines_preserves_non_action_content(self):
        text = "The answer is 9.\nSome more context."
        assert _strip_action_lines(text) == text


# ===========================================================================
# agent_loop.py — run_agent
# ===========================================================================

class TestRunAgent:

    @pytest.mark.asyncio
    async def test_no_tools_is_direct_passthrough(self):
        """With no tools, run_agent must call model_router directly (no overhead)."""
        with patch("app.engine.agent_loop.model_router.generate_full_text",
                   new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = "The answer is 9."

            result = await run_agent(
                messages=[{"role": "user", "content": "what is 4+5"}],
                model="claude-haiku-4-5-20251001",
                available_tools=[],
            )

        mock_gen.assert_called_once()
        assert result == "The answer is 9."

    @pytest.mark.asyncio
    async def test_tool_hint_injected_when_tools_available(self):
        """Tool hint must appear in the messages sent to the model."""
        captured_messages = []

        async def fake_gen(messages, model, config, ollama_url):
            captured_messages.extend(messages)
            return "No tools needed, just answering directly."

        with patch("app.engine.agent_loop.model_router.generate_full_text", new=fake_gen):
            await run_agent(
                messages=[{"role": "user", "content": "what is REST?"}],
                model="claude-haiku-4-5-20251001",
                available_tools=["web_search"],
            )

        full_content = " ".join(m["content"] for m in captured_messages)
        assert "ACTION:" in full_content
        assert "web_search" in full_content

    @pytest.mark.asyncio
    async def test_tool_call_executed_and_result_injected(self):
        """When the model emits ACTION: web_search, the tool is called and result injected."""
        call_count = 0

        async def fake_gen(messages, model, config, ollama_url):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return 'I need to check this.\nACTION: web_search("current date")'
            return "Today is March 29, 2026."

        with patch("app.engine.agent_loop.model_router.generate_full_text", new=fake_gen), \
             patch("app.engine.agent_loop.TOOL_FUNCTIONS", {
                 "web_search": AsyncMock(return_value="March 29, 2026"),
             }):
            result = await run_agent(
                messages=[{"role": "user", "content": "what is the date"}],
                model="claude-haiku-4-5-20251001",
                available_tools=["web_search"],
            )

        assert call_count == 2, "Model should be called twice (once for tool call, once for final answer)"
        assert "ACTION:" not in result

    @pytest.mark.asyncio
    async def test_unknown_tool_stops_loop(self):
        """If model calls a tool not in available_tools, loop stops cleanly."""
        async def fake_gen(messages, model, config, ollama_url):
            return 'ACTION: run_cli("rm -rf /")'

        with patch("app.engine.agent_loop.model_router.generate_full_text", new=fake_gen):
            result = await run_agent(
                messages=[{"role": "user", "content": "test"}],
                model="claude-haiku-4-5-20251001",
                available_tools=["web_search"],  # run_cli NOT allowed
            )

        # Loop should stop — run_cli was not in available_tools
        assert "ACTION:" not in result

    @pytest.mark.asyncio
    async def test_max_iterations_respected(self):
        """Loop must not exceed max_iterations tool calls."""
        call_count = 0

        async def fake_gen(messages, model, config, ollama_url):
            nonlocal call_count
            call_count += 1
            return f'Still searching.\nACTION: web_search("query {call_count}")'

        with patch("app.engine.agent_loop.model_router.generate_full_text", new=fake_gen), \
             patch("app.engine.agent_loop.TOOL_FUNCTIONS", {
                 "web_search": AsyncMock(return_value="some result"),
             }):
            await run_agent(
                messages=[{"role": "user", "content": "test"}],
                model="claude-haiku-4-5-20251001",
                available_tools=["web_search"],
                max_iterations=2,
            )

        # max_iterations=2 → 2 tool calls + 1 final call = 3 total model calls
        assert call_count == 3, f"Expected 3 model calls (2 iterations + final), got {call_count}"

    @pytest.mark.asyncio
    async def test_tool_result_truncated_at_1500_chars(self):
        """Large tool results must be truncated to prevent token explosion."""
        injected_content = []

        async def fake_gen(messages, model, config, ollama_url):
            if len(messages) > 2:  # second call — has tool result
                injected_content.append(messages[-1]["content"])
                return "Final answer."
            return 'ACTION: web_search("big result query")'

        big_result = "x" * 3000  # 3000 chars — should be truncated to 1500

        with patch("app.engine.agent_loop.model_router.generate_full_text", new=fake_gen), \
             patch("app.engine.agent_loop.TOOL_FUNCTIONS", {
                 "web_search": AsyncMock(return_value=big_result),
             }):
            await run_agent(
                messages=[{"role": "user", "content": "test big result"}],
                model="claude-haiku-4-5-20251001",
                available_tools=["web_search"],
            )

        assert injected_content, "Tool result should have been injected"
        injected = injected_content[0]
        assert "truncated" in injected, "Long tool results must be marked as truncated"
        # The 'x' * 3000 run should be cut off
        x_count = injected.count("x")
        assert x_count <= 1500, f"Too many chars injected: {x_count}"

    @pytest.mark.asyncio
    async def test_no_tools_config_none(self):
        """available_tools=None should behave like empty list (direct passthrough)."""
        with patch("app.engine.agent_loop.model_router.generate_full_text",
                   new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = "answer"
            await run_agent(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-4o-mini",
                available_tools=None,
            )
        mock_gen.assert_called_once()


# ===========================================================================
# Integration: web_context injection in build_agent_prompt
# ===========================================================================

class TestWebContextInjection:

    @pytest.mark.asyncio
    async def test_web_context_injected_into_prompt(self):
        from app.engine.debate import CouncilDebateEngine
        from unittest.mock import MagicMock

        eng = CouncilDebateEngine()
        agent = MagicMock()
        agent.id = __import__("uuid").uuid4()
        agent.name = "NOVA"
        agent.role = "Research"
        agent.personality = "Direct."
        agent.model_preference = "claude-haiku-4-5-20251001"
        agent.config = {}

        council = MagicMock()
        council.id = __import__("uuid").uuid4()
        council.title = "Test"
        council.topic = "Testing"

        prompt = await eng.build_agent_prompt(
            agent, council, [], [],
            question_type="factual",
            round_in_question=0,
            web_context="Today is March 29, 2026.",
        )

        full_content = " ".join(m["content"] for m in prompt)
        assert "March 29, 2026" in full_content, "web_context must be injected into prompt"
        assert "AUTHORITATIVE FACT" in full_content

    @pytest.mark.asyncio
    async def test_no_web_context_when_none(self):
        from app.engine.debate import CouncilDebateEngine
        from unittest.mock import MagicMock

        eng = CouncilDebateEngine()
        agent = MagicMock()
        agent.id = __import__("uuid").uuid4()
        agent.name = "NOVA"
        agent.role = "Research"
        agent.personality = "Direct."
        agent.model_preference = "claude-haiku-4-5-20251001"
        agent.config = {}

        council = MagicMock()
        council.id = __import__("uuid").uuid4()
        council.title = "Test"
        council.topic = "Testing"

        prompt = await eng.build_agent_prompt(
            agent, council, [], [],
            question_type="factual",
            round_in_question=0,
            web_context=None,
        )

        full_content = " ".join(m["content"] for m in prompt)
        assert "Real-time reference data" not in full_content
