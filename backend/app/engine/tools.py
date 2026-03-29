"""
Agent tools — web search, web fetch, calculator, HTTP API calls, and safe CLI.

All tools are async functions that return plain-text results.
They are called by the agent_loop ReAct engine or pre-injected as
web_context for factual questions.

Tool summary:
  web_search  — search the internet (Tavily > Brave > DuckDuckGo)
  web_fetch   — fetch and clean a URL as plain text
  calculate   — evaluate math expressions safely (no network)
  http_call   — call any HTTP endpoint (MCP-over-HTTP, A2A, local services)
  run_cli     — safe read-only shell commands (opt-in)

Search provider priority:
  1. Tavily     (if TAVILY_API_KEY set in .env — best quality)
  2. Brave      (if BRAVE_SEARCH_API_KEY set in .env — reliable)
  3. DuckDuckGo (free, no key required — always available as fallback)

Date/time queries never hit the network — answered from the server clock.
"""
import ast
import asyncio
import html as html_lib
import json
import logging
import operator
import re
import time
from datetime import datetime, timezone
from typing import Callable, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result cache — reuse responses within 5 minutes (300 s)
# ---------------------------------------------------------------------------
_CACHE: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 300.0


def _cached(key: str) -> Optional[str]:
    if key in _CACHE:
        result, ts = _CACHE[key]
        if time.monotonic() - ts < _CACHE_TTL:
            return result
    return None


def _cache_set(key: str, value: str) -> None:
    _CACHE[key] = (value, time.monotonic())


# ---------------------------------------------------------------------------
# Shared HTTP client (connection-pooled, reasonable timeouts)
# ---------------------------------------------------------------------------
_http: Optional[httpx.AsyncClient] = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            follow_redirects=True,
            headers={"User-Agent": "CouncilAI/1.0 (research agent)"},
        )
    return _http


# ---------------------------------------------------------------------------
# Date / time — no network needed
# ---------------------------------------------------------------------------
_DATE_RE = re.compile(
    r"(today|tomorrow|yesterday|current date|what date|what time|what year|what day"
    r"|what month|todays date|tomorrows date|current time|right now"
    r"|this year|this month|what('s| is) the date|what('s| is) today"
    r"|what('s| is) tomorrow|what day is)",
    re.IGNORECASE,
)


def _is_date_query(query: str) -> bool:
    return bool(_DATE_RE.search(query))


def _server_datetime() -> str:
    """Return a rich date/time string covering today, tomorrow, and yesterday."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(days=1)
    yesterday = now - timedelta(days=1)
    return (
        f"Today: {now.strftime('%A, %B %d, %Y')} (UTC {now.strftime('%H:%M')}). "
        f"Tomorrow: {tomorrow.strftime('%A, %B %d, %Y')}. "
        f"Yesterday: {yesterday.strftime('%A, %B %d, %Y')}."
    )


# ---------------------------------------------------------------------------
# DuckDuckGo Instant Answer (free, no key)
# ---------------------------------------------------------------------------
async def _ddg_instant(query: str) -> Optional[str]:
    """DuckDuckGo Instant Answer API — best for math, definitions, quick facts."""
    url = (
        "https://api.duckduckgo.com/"
        f"?q={quote_plus(query)}&format=json&no_html=1&skip_disambig=1"
    )
    try:
        resp = await _get_http().get(url)
        resp.raise_for_status()
        data = resp.json()

        # Calculator / instant answer (highest confidence)
        if data.get("Answer"):
            return str(data["Answer"])

        # Wikipedia abstract
        if data.get("AbstractText"):
            text = data["AbstractText"][:600]
            src = data.get("AbstractURL", "")
            return f"{text}\nSource: {src}" if src else text

        # Related topic snippets
        topics = [
            t["Text"] for t in data.get("RelatedTopics", [])[:3]
            if isinstance(t, dict) and t.get("Text")
        ]
        if topics:
            return "\n".join(topics)

    except Exception as exc:
        logger.debug("DDG instant answer failed for %r: %s", query, exc)
    return None


# ---------------------------------------------------------------------------
# Tavily (requires TAVILY_API_KEY in .env)
# ---------------------------------------------------------------------------
async def _tavily_search(query: str, api_key: str) -> Optional[str]:
    try:
        resp = await _get_http().post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": 3,
                "search_depth": "basic",
            },
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return None
        parts = []
        for r in results[:3]:
            title = r.get("title", "")
            snippet = r.get("content", "")[:300]
            url = r.get("url", "")
            parts.append(f"{title}: {snippet} ({url})")
        return "\n".join(parts)
    except Exception as exc:
        logger.debug("Tavily search failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Brave Search (requires BRAVE_SEARCH_API_KEY in .env)
# ---------------------------------------------------------------------------
async def _brave_search(query: str, api_key: str) -> Optional[str]:
    try:
        resp = await _get_http().get(
            f"https://api.search.brave.com/res/v1/web/search"
            f"?q={quote_plus(query)}&count=3",
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": api_key,
            },
        )
        resp.raise_for_status()
        results = resp.json().get("web", {}).get("results", [])
        if not results:
            return None
        parts = []
        for r in results[:3]:
            title = r.get("title", "")
            desc = r.get("description", "")[:300]
            url = r.get("url", "")
            parts.append(f"{title}: {desc} ({url})")
        return "\n".join(parts)
    except Exception as exc:
        logger.debug("Brave search failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Public tool: web_search
# ---------------------------------------------------------------------------
async def web_search(query: str) -> str:
    """
    Search the web for current information.
    Provider priority: Tavily > Brave > DuckDuckGo.
    Date/time queries return the server clock directly (no network call).
    Results are cached for 5 minutes per query.
    """
    query = (query or "").strip()
    if not query:
        return "No search query provided."

    # Fast path: date/time — answer from server clock
    if _is_date_query(query):
        result = _server_datetime()
        _cache_set(f"s:{query}", result)
        return result

    # Check cache
    cached = _cached(f"s:{query}")
    if cached:
        logger.debug("web_search cache hit for %r", query)
        return cached

    # Try providers in priority order
    result: Optional[str] = None

    try:
        from app.config import settings  # lazy to avoid any startup ordering issue
        if settings.tavily_api_key:
            result = await _tavily_search(query, settings.tavily_api_key)
        if not result and settings.brave_search_api_key:
            result = await _brave_search(query, settings.brave_search_api_key)
    except Exception as exc:
        logger.debug("Premium search providers failed: %s", exc)

    if not result:
        result = await _ddg_instant(query)

    if not result:
        result = f"No results found for: {query!r}"

    _cache_set(f"s:{query}", result)
    return result


# ---------------------------------------------------------------------------
# Public tool: web_fetch
# ---------------------------------------------------------------------------
async def web_fetch(url: str, max_chars: int = 2000) -> str:
    """
    Fetch a URL and return cleaned plain-text content.
    Strips HTML tags, decodes entities, collapses whitespace.
    """
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        return f"Invalid URL (must start with http:// or https://): {url!r}"

    cached = _cached(f"f:{url}")
    if cached:
        return cached

    try:
        resp = await _get_http().get(url)
        resp.raise_for_status()
        raw = resp.text

        # Remove <style> and <script> blocks entirely
        raw = re.sub(r"<style[^>]*>.*?</style>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
        raw = re.sub(r"<script[^>]*>.*?</script>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
        # Strip all remaining HTML tags
        raw = re.sub(r"<[^>]+>", " ", raw)
        # Decode HTML entities (&amp; → &, etc.)
        raw = html_lib.unescape(raw)
        # Collapse whitespace
        raw = re.sub(r"\s+", " ", raw).strip()

        result = raw[:max_chars]
        if len(raw) > max_chars:
            result += " ... [truncated]"

        _cache_set(f"f:{url}", result)
        return result

    except httpx.HTTPStatusError as exc:
        return f"HTTP {exc.response.status_code} error fetching {url}"
    except Exception as exc:
        logger.warning("web_fetch failed for %s: %s", url, exc)
        return f"Failed to fetch {url}: {exc}"


# ---------------------------------------------------------------------------
# Public tool: calculate — safe expression evaluator
# ---------------------------------------------------------------------------

# AST nodes allowed in safe math expressions
_SAFE_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.FloorDiv,
    ast.USub, ast.UAdd,
)
_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp):
        return _OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp):
        return _OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError(f"Unsupported expression node: {type(node).__name__}")


async def calculate(expression: str) -> str:
    """
    Safely evaluate a math expression. No network call needed.
    Examples: "4 + 5", "2 ** 10", "100 / 3", "7 % 2"
    """
    expression = (expression or "").strip()
    if not expression:
        return "No expression provided."
    try:
        tree = ast.parse(expression, mode="eval")
        for node in ast.walk(tree):
            if not isinstance(node, _SAFE_NODES):
                return f"Blocked: expression contains unsupported operation ({type(node).__name__})."
        result = _eval_node(tree.body)
        # Format: drop .0 for whole numbers
        if isinstance(result, float) and result == int(result):
            return str(int(result))
        return str(result)
    except ZeroDivisionError:
        return "Error: division by zero."
    except Exception as exc:
        return f"Calculation error: {exc}"


# ---------------------------------------------------------------------------
# Public tool: http_call — generic HTTP request to any endpoint
# ---------------------------------------------------------------------------
# Covers: MCP-over-HTTP servers, A2A (Council API, other agents), local services
# Format: "METHOD url" for GET/DELETE  OR  "METHOD url JSON_BODY" for POST/PUT/PATCH

_HTTP_METHOD_RE = re.compile(
    r"^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(https?://\S+)(\s+(.+))?$",
    re.IGNORECASE | re.DOTALL,
)


async def http_call(spec: str) -> str:
    """
    Make an HTTP request to any endpoint.

    Format:
      GET  http://localhost:11434/api/tags
      POST http://localhost:8100/api/search {"query": "AI news"}
      GET  https://api.github.com/repos/crewAIInc/crewAI

    Returns the response body as plain text (JSON pretty-printed if applicable).
    """
    spec = (spec or "").strip()
    m = _HTTP_METHOD_RE.match(spec)
    if not m:
        return (
            "Invalid format. Use: METHOD url [json_body]\n"
            'Example: POST http://localhost:8100/api/search {"query": "AI"}'
        )

    method = m.group(1).upper()
    url = m.group(2)
    body_str = (m.group(4) or "").strip()

    cache_key = f"h:{method}:{url}:{body_str}"
    if method == "GET":
        cached = _cached(cache_key)
        if cached:
            return cached

    http = _get_http()
    try:
        if body_str:
            try:
                body_json = json.loads(body_str)
            except json.JSONDecodeError:
                return f"Invalid JSON body: {body_str!r}"
            resp = await http.request(method, url, json=body_json)
        else:
            resp = await http.request(method, url)

        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")

        if "application/json" in content_type or resp.text.lstrip().startswith(("{", "[")):
            try:
                data = resp.json()
                result = json.dumps(data, indent=2)[:3000]
                if len(json.dumps(data)) > 3000:
                    result += "\n... [truncated]"
            except Exception:
                result = resp.text[:3000]
        else:
            result = resp.text[:3000]

        if method == "GET":
            _cache_set(cache_key, result)
        return result

    except httpx.HTTPStatusError as exc:
        return f"HTTP {exc.response.status_code}: {exc.response.text[:500]}"
    except Exception as exc:
        logger.warning("http_call failed for %r: %s", spec, exc)
        return f"Request failed: {exc}"


# ---------------------------------------------------------------------------
# Public tool: run_cli (opt-in, allowlisted read-only commands)
# ---------------------------------------------------------------------------
_CLI_ALLOWLIST = frozenset([
    # Info / inspection
    "echo", "date", "hostname", "whoami", "pwd", "uname",
    # File system (read-only)
    "ls ", "ls\n", "cat ", "head ", "tail ", "wc ", "file ", "find ",
    # Python
    "python3 -c", "python -c", "python3 -m", "python -m",
    # Git (read-only)
    "git status", "git log", "git diff", "git branch", "git show", "git remote",
    # Process / system info
    "ps ", "top ", "df ", "du ", "free ", "lscpu", "nvidia-smi",
    # curl / wget (read)
    "curl ", "wget ",
    # pip info
    "pip show", "pip list",
])
_CLI_DANGEROUS = [
    "rm ", "del ", "rmdir", "mkfs", "dd if=", " > ", " >> ", " | ",
    "; rm", "; del", "&& rm", "&& del",
    "__import__", "os.system", "subprocess", "exec(", "eval(",
    "chmod", "chown", "sudo", "su ", "passwd",
    "DROP ", "DELETE FROM", "TRUNCATE",
]


async def run_cli(command: str) -> str:
    """
    Run a safe, read-only CLI command.
    Requires 'run_cli' in agent.tools_allowed (or is in DEFAULT_TOOLS for agents where enabled).
    Expanded allowlist: ls, cat, git, python, nvidia-smi, curl, pip, etc.
    """
    command = (command or "").strip()
    cmd_lower = command.lower()

    if not any(cmd_lower.startswith(prefix) or cmd_lower == prefix.rstrip()
               for prefix in _CLI_ALLOWLIST):
        return (
            f"Command not permitted: {command!r}. "
            f"Allowed: echo, ls, cat, git status/log/diff, python -c, curl, df, ps, nvidia-smi, pip show, ..."
        )

    for pat in _CLI_DANGEROUS:
        if pat.lower() in command.lower():
            return "Command blocked — contains unsafe pattern."

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15.0)
        out = (stdout or b"").decode(errors="replace")[:3000]
        err = (stderr or b"").decode(errors="replace")[:300]
        if err and not out:
            return f"stderr: {err}"
        if err:
            return f"{out.strip()}\n[stderr: {err.strip()}]"
        return out.strip() or "(no output)"
    except asyncio.TimeoutError:
        return "Command timed out (15 s limit)."
    except Exception as exc:
        logger.warning("run_cli failed for %r: %s", command, exc)
        return f"CLI error: {exc}"


# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

# Name → async callable mapping used by agent_loop
TOOL_FUNCTIONS: dict[str, Callable] = {
    "web_search": web_search,
    "web_fetch": web_fetch,
    "calculate": calculate,
    "http_call": http_call,
    "run_cli": run_cli,
}

# Default tools given to every agent
# run_cli is still opt-in (requires explicit tools_allowed entry on the Agent DB row)
DEFAULT_TOOLS: list[str] = ["web_search", "web_fetch", "calculate", "http_call"]
