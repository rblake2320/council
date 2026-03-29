"""
Tool-augmented agent loop — ReAct (Reason + Act) pattern.

Wraps model_router.generate_full_text() with an optional tool-use loop
so agents can search the web, fetch URLs, or run safe CLI commands.

How it works:
  1. Tool hint is appended to the last user message in the prompt.
  2. Model responds (optionally with: ACTION: web_search("query"))
  3. If an ACTION is found, the tool is executed and the result is injected.
  4. Model is called again with the tool result in context.
  5. Loop repeats up to max_iterations times.
  6. Final response has ACTION scaffolding stripped — only the agent's
     actual answer is returned.

If available_tools is empty, this is a zero-overhead pass-through to
model_router.generate_full_text() — no overhead at all.
"""
import logging
import re

from app.engine.router import model_router
from app.engine.tools import TOOL_FUNCTIONS  # noqa: F401 (used by tests + loop)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool call parsing
# ---------------------------------------------------------------------------

# Matches any registered tool call:
#   ACTION: web_search("some query")
#   ACTION: web_fetch("https://example.com")
#   ACTION: calculate("4 + 5 * 2")
#   ACTION: http_call("GET http://localhost:11434/api/tags")
#   ACTION: run_cli("git status")
_ACTION_RE = re.compile(
    r"ACTION:\s*(web_search|web_fetch|calculate|http_call|run_cli)\(\"([^\"]{1,500})\"\)",
    re.MULTILINE,
)

# ---------------------------------------------------------------------------
# Tool availability hints injected into the prompt
# (built dynamically based on which tools are available to this agent)
# ---------------------------------------------------------------------------

_TOOL_LINES = {
    "web_search": '  ACTION: web_search("your query")          — search the internet\n',
    "web_fetch":  '  ACTION: web_fetch("https://...")           — read a specific webpage\n',
    "calculate":  '  ACTION: calculate("4 + 5")                 — evaluate math safely\n',
    "http_call":  '  ACTION: http_call("GET http://host/path")  — call any HTTP API or local service\n',
    "run_cli":    '  ACTION: run_cli("git status")              — run a safe read-only shell command\n',
}


def _build_hint(available_tools: list[str]) -> str:
    lines = "".join(_TOOL_LINES[t] for t in _TOOL_LINES if t in available_tools)
    return (
        "\n\n---\n"
        "TOOLS (use only when you need real-time or external information):\n"
        f"{lines}"
        "Write the ACTION on its own line. You will receive the result, then write your answer.\n"
        "---"
    )


def _strip_action_lines(text: str) -> str:
    """Remove raw ACTION: lines from the final visible response."""
    lines = [ln for ln in text.splitlines() if not _ACTION_RE.search(ln)]
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Main ReAct loop
# ---------------------------------------------------------------------------

async def run_agent(
    messages: list[dict],
    model: str,
    config: dict | None = None,
    ollama_url: str | None = None,
    available_tools: list[str] | None = None,
    max_iterations: int = 3,
) -> str:
    """
    Tool-augmented generation.

    available_tools: list of tool names this agent is allowed to use.
                     Empty list → zero-overhead pass-through (no tool loop).

    Returns the agent's final plain-text response with all ACTION scaffolding
    removed. Tool results are incorporated into the response naturally.
    """
    if config is None:
        config = {}

    # Only allow tools that are registered in TOOL_FUNCTIONS
    effective_tools = [t for t in (available_tools or []) if t in TOOL_FUNCTIONS]

    # -----------------------------------------------------------------------
    # Fast path: no tools configured — direct model call, no overhead
    # -----------------------------------------------------------------------
    if not effective_tools:
        return await model_router.generate_full_text(
            messages=messages,
            model=model,
            config=config,
            ollama_url=ollama_url,
        )

    # -----------------------------------------------------------------------
    # Tool-augmented path: append hint, then ReAct loop
    # -----------------------------------------------------------------------
    hint = _build_hint(effective_tools)

    # Append the tool hint to the last user message
    augmented = list(messages)
    for i in range(len(augmented) - 1, -1, -1):
        if augmented[i]["role"] == "user":
            augmented[i] = {
                "role": "user",
                "content": augmented[i]["content"] + hint,
            }
            break

    working = list(augmented)

    for iteration in range(max_iterations):
        text = await model_router.generate_full_text(
            messages=working,
            model=model,
            config=config,
            ollama_url=ollama_url,
        )

        match = _ACTION_RE.search(text)
        if not match:
            # No tool call — this is the final response
            return _strip_action_lines(text)

        tool_name = match.group(1)
        tool_arg = match.group(2)

        if tool_name not in effective_tools:
            logger.debug(
                "Agent requested tool %r but it is not in their allowed list %s",
                tool_name, effective_tools,
            )
            return _strip_action_lines(text)

        logger.info(
            "Agent tool call [iter %d/%d]: %s(%r)",
            iteration + 1, max_iterations, tool_name, tool_arg,
        )

        try:
            tool_result = await TOOL_FUNCTIONS[tool_name](tool_arg)
        except Exception as exc:
            tool_result = f"Tool error: {exc}"
            logger.warning("Tool %s(%r) raised: %s", tool_name, tool_arg, exc)

        # Truncate large results to stay within token budget
        max_result_chars = 1500
        if len(tool_result) > max_result_chars:
            tool_result = tool_result[:max_result_chars] + " ... [truncated]"

        # Extend conversation with assistant's partial response + tool result
        working.append({"role": "assistant", "content": text})
        working.append({
            "role": "user",
            "content": (
                f"[Tool result for {tool_name}(\"{tool_arg}\")]\n"
                f"{tool_result}\n"
                "[End tool result. Now write your final answer.]"
            ),
        })

    # Exhausted iterations — one final call for the conclusive answer
    logger.debug("Agent loop exhausted %d iterations — calling for final answer", max_iterations)
    final = await model_router.generate_full_text(
        messages=working,
        model=model,
        config=config,
        ollama_url=ollama_url,
    )
    return _strip_action_lines(final)
