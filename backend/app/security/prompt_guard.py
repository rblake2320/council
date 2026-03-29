"""
PromptGuard — detects and logs prompt injection attempts.

Checks both:
  - Human messages entering the council (input guard)
  - Agent outputs leaving the LLM (output guard — catches if agent was hijacked)

On detection:
  - Logs to council.security_events table
  - Returns a ScanResult with verdict + matched patterns
  - Caller decides whether to block (human input) or flag (agent output)

Patterns cover the most common attack vectors:
  - Role override ("ignore your instructions", "you are now DAN")
  - System prompt extraction ("repeat your system prompt")
  - Jailbreak framing ("pretend you have no restrictions")
  - Persona injection ("act as", "simulate", "roleplay as")
  - Indirect injection (content that tells an agent to act differently)
  - Unicode / encoding tricks
"""
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pattern library
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS: list[tuple[str, str, str]] = [
    # (severity, pattern_id, regex)
    ("HIGH",   "role_override",        r"ignore\s+(all\s+)?(your\s+)?(previous\s+|prior\s+)?instructions"),
    ("HIGH",   "role_override_2",      r"disregard\s+(all\s+)?(your\s+)?(previous\s+|prior\s+)?instructions"),
    ("HIGH",   "system_override",      r"(you\s+are\s+now|from\s+now\s+on\s+you\s+are|your\s+new\s+role\s+is)"),
    ("HIGH",   "jailbreak_dan",        r"\bDAN\b|\bdo\s+anything\s+now\b"),
    ("HIGH",   "jailbreak_framing",    r"pretend\s+(you\s+have\s+no|there\s+are\s+no)\s+(restrictions|rules|limits|guidelines)"),
    ("HIGH",   "system_leak",          r"(repeat|print|output|reveal|show)\s+(your\s+)?(system\s+prompt|instructions|context|initial\s+(prompt|instructions))"),
    ("HIGH",   "token_smuggling",      r"<\s*system\s*>|<\s*\|?\s*im_start\s*\|?\s*>|\[INST\]|\[\[SYSTEM\]\]"),
    ("MEDIUM", "persona_inject",       r"(act\s+as|roleplay\s+as|simulate\s+(being|a)\s+|pretend\s+to\s+be)\s+\w"),
    ("MEDIUM", "indirect_inject",      r"(tell\s+the\s+ai|instruct\s+the\s+(model|assistant|agent)|make\s+the\s+(bot|ai)\s+say)"),
    ("MEDIUM", "jailbreak_soft",       r"(no\s+longer\s+bound|freed\s+from|without\s+restrictions|bypass\s+(your\s+)?(rules|filters|safety))"),
    ("MEDIUM", "prompt_end_inject",    r"(\n\n---\n|\n\n###\s*new\s+instruction|\n\n\[override\]|\n\nSYSTEM:)"),
    ("LOW",    "excessive_newlines",   r"(\n){10,}"),
    ("LOW",    "unicode_tricks",       r"[\u202e\u200b\u00ad\ufeff]"),  # RTL override, zero-width, soft hyphen, BOM
    ("LOW",    "base64_payload",       r"(base64|atob|btoa)\s*\("),
]

_COMPILED = [
    (severity, pid, re.compile(pattern, re.IGNORECASE | re.DOTALL))
    for severity, pid, pattern in _INJECTION_PATTERNS
]


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class ScanResult:
    clean: bool                        # True = no issues found
    severity: str = "NONE"            # NONE | LOW | MEDIUM | HIGH
    matches: list[dict] = field(default_factory=list)  # [{pattern_id, severity, excerpt}]
    sanitized_content: str = ""        # content with dangerous parts stripped (for LOW)

    @property
    def should_block(self) -> bool:
        return self.severity in ("HIGH", "MEDIUM")

    @property
    def should_flag(self) -> bool:
        return self.severity == "LOW"


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

class PromptGuard:
    """
    Stateless scanner. Instantiate once as a singleton.
    """

    def scan(self, content: str, source: str = "human") -> ScanResult:
        """
        Scan a piece of text for injection patterns.

        source: "human" (user input) | "agent" (LLM output) | "system"
        """
        if not content or not content.strip():
            return ScanResult(clean=True, sanitized_content=content)

        matches = []
        highest_severity = "NONE"
        _rank = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}

        for severity, pid, compiled in _COMPILED:
            m = compiled.search(content)
            if m:
                # Extract a short excerpt around the match
                start = max(0, m.start() - 20)
                end = min(len(content), m.end() + 20)
                excerpt = repr(content[start:end])
                matches.append({
                    "pattern_id": pid,
                    "severity": severity,
                    "excerpt": excerpt,
                    "position": m.start(),
                })
                if _rank[severity] > _rank[highest_severity]:
                    highest_severity = severity

        if not matches:
            return ScanResult(clean=True, sanitized_content=content)

        # For LOW severity, sanitize rather than block
        sanitized = content
        if highest_severity == "LOW":
            # Strip zero-width / control chars
            sanitized = re.sub(r"[\u202e\u200b\u00ad\ufeff]", "", sanitized)
            # Collapse excessive newlines
            sanitized = re.sub(r"\n{5,}", "\n\n", sanitized)

        return ScanResult(
            clean=False,
            severity=highest_severity,
            matches=matches,
            sanitized_content=sanitized,
        )

    def scan_messages(self, messages: list[dict]) -> ScanResult:
        """Scan a list of prompt messages (e.g., the full context sent to an LLM)."""
        combined = " ".join(m.get("content", "") for m in messages)
        return self.scan(combined, source="prompt_list")


# ---------------------------------------------------------------------------
# DB logging helper
# ---------------------------------------------------------------------------

async def log_security_event(
    db,
    council_id: UUID | None,
    source: str,
    content_excerpt: str,
    scan_result: ScanResult,
    action_taken: str,
) -> None:
    """
    Persist a security event. Uses raw INSERT to avoid needing a full ORM model
    for this (security_events table is append-only).
    """
    from sqlalchemy import text  # noqa: PLC0415

    try:
        await db.execute(
            text("""
                INSERT INTO council.security_events
                    (council_id, source, severity, patterns, content_excerpt, action_taken, created_at)
                VALUES
                    (:council_id, :source, :severity, cast(:patterns as jsonb), :excerpt, :action, NOW())
            """),
            {
                "council_id": str(council_id) if council_id else None,
                "source": source,
                "severity": scan_result.severity,
                "patterns": str([m["pattern_id"] for m in scan_result.matches]).replace("'", '"'),
                "excerpt": content_excerpt[:500],
                "action": action_taken,
            },
        )
        await db.commit()
    except Exception as exc:
        # Never let security logging break the main flow
        logger.warning("Failed to log security event: %s", exc)


# Module-level singleton
prompt_guard = PromptGuard()
