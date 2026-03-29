"""
002 — Digital Twin layer

Adds twin identity, authorization scope, meeting types, time compression tracking,
and twin accuracy feedback — the foundation for AI-mediated human collaboration.

Revision ID: 002_digital_twins
Revises: 001_initial
Create Date: 2026-03-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_digital_twins"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # Extend council.agents with twin identity fields
    # -----------------------------------------------------------------------

    # twin_of: human identity reference (name, email, or external ID of the
    # person this agent represents). NULL = not a twin (pure AI agent).
    op.add_column(
        "agents",
        sa.Column("twin_of", sa.Text(), nullable=True),
        schema="council",
    )

    # authorization_scope: what the twin is empowered to commit to on behalf
    # of its human.
    # Example:
    # {
    #   "level": "delegated",           // "read-only" | "advisory" | "delegated"
    #   "domains": ["product", "tech"], // scopes the twin is authorized for
    #   "max_commitment_value": 10000,  // e.g. dollar amount or story points
    #   "requires_human_approval_for": ["budget_changes", "headcount"]
    # }
    op.add_column(
        "agents",
        sa.Column(
            "authorization_scope",
            postgresql.JSONB(),
            nullable=False,
            server_default='{"level":"advisory","domains":[],"requires_human_approval_for":[]}',
        ),
        schema="council",
    )

    # twin_profile: rich profile of the human the twin represents.
    # Used to make the twin's responses authentic to that person.
    # Example:
    # {
    #   "expertise": ["ML infrastructure", "distributed systems"],
    #   "communication_style": "direct, data-driven, no filler",
    #   "non_negotiables": ["security", "test coverage"],
    #   "decision_patterns": "prefers reversible decisions; asks for data before committing",
    #   "timezone": "America/New_York",
    #   "context_injections": ["Always consider patent implications"]
    # }
    op.add_column(
        "agents",
        sa.Column(
            "twin_profile",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        schema="council",
    )

    # accuracy_score: 0.0–1.0. Updated by twin accuracy feedback loop.
    # New twins start at 0.5 (unknown). Improves as humans review decisions.
    op.add_column(
        "agents",
        sa.Column("accuracy_score", sa.Float(), nullable=False, server_default="0.5"),
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.councils with meeting type and time compression
    # -----------------------------------------------------------------------

    # meeting_type distinguishes internal AI debates from human-twin meetings
    # "internal"     — PKA agents debating (no human delegation)
    # "twin-meeting" — Two or more humans represented by their digital twins
    # "mixed"        — Some humans present, some represented by twins
    # "open"         — External agents can join with an API key
    op.add_column(
        "councils",
        sa.Column(
            "meeting_type",
            sa.Text(),
            nullable=False,
            server_default="internal",
        ),
        schema="council",
    )
    op.create_check_constraint(
        "ck_council_meeting_type",
        "councils",
        "meeting_type IN ('internal','twin-meeting','mixed','open')",
        schema="council",
    )

    # estimated_duration_minutes: what the meeting would take with all humans
    # present. Set by the human scheduling the meeting (or AI estimation).
    op.add_column(
        "councils",
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True),
        schema="council",
    )

    # time_compression_ratio: actual_duration / estimated_duration.
    # < 1.0 = faster than expected. Calculated and stored when council completes.
    op.add_column(
        "councils",
        sa.Column("time_compression_ratio", sa.Float(), nullable=True),
        schema="council",
    )

    # human_notification_url: webhook URL to ping when the council needs
    # human input (e.g., a decision outside the twin's authorization scope).
    op.add_column(
        "councils",
        sa.Column("human_notification_url", sa.Text(), nullable=True),
        schema="council",
    )

    # -----------------------------------------------------------------------
    # New table: council.twin_accuracy_reviews
    #
    # After a twin meeting, each human reviews whether their twin represented
    # them accurately. This drives the accuracy_score feedback loop.
    # -----------------------------------------------------------------------
    op.create_table(
        "twin_accuracy_reviews",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Who left this review (the human the twin represents)
        sa.Column("reviewer_identity", sa.Text(), nullable=False),
        # Overall: did the twin represent me correctly?
        sa.Column("overall_accurate", sa.Boolean(), nullable=False),
        # Per-decision breakdown: list of {message_id, accurate: bool, correction: str}
        sa.Column("decision_reviews", postgresql.JSONB(), nullable=False, server_default="[]"),
        # Free-form feedback for twin self-model update
        sa.Column("feedback", sa.Text(), nullable=True),
        # Updated accuracy score after this review
        sa.Column("resulting_accuracy_score", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        schema="council",
    )
    op.create_index(
        "idx_twin_reviews_agent",
        "twin_accuracy_reviews",
        ["agent_id", "created_at"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # New table: council.pre_debate_context
    #
    # Structured pre-debate context phase: before round 1, agents can POST
    # context they want to surface (prior decisions, relevant memory, sources).
    # Creates an audit trail of what each agent knew going in.
    # -----------------------------------------------------------------------
    op.create_table(
        "pre_debate_context",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Type: "memory", "prior_decision", "source", "constraint", "position"
        sa.Column("context_type", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("relevance_score", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "context_type IN ('memory','prior_decision','source','constraint','position','expertise')",
            name="ck_context_type",
        ),
        schema="council",
    )
    op.create_index(
        "idx_pre_context_council",
        "pre_debate_context",
        ["council_id", "agent_id"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.messages with structured position field
    # (NOVA's API pattern #4: structured position schema required)
    # -----------------------------------------------------------------------
    # position: {stance: "YES"|"NO"|"ABSTAIN"|"CHANGED", confidence: 0.0-1.0,
    #            previous_stance: "...", reasoning: "..."}
    op.add_column(
        "messages",
        sa.Column("position", postgresql.JSONB(), nullable=True),
        schema="council",
    )

    # reply_to_id: threading — which message is this directly responding to?
    op.add_column(
        "messages",
        sa.Column(
            "reply_to_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="council",
    )

    # round_number: which debate round this message belongs to
    op.add_column(
        "messages",
        sa.Column("round_number", sa.Integer(), nullable=True),
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.syntheses with time compression report
    # -----------------------------------------------------------------------
    op.add_column(
        "syntheses",
        sa.Column("time_compression_report", sa.Text(), nullable=True),
        schema="council",
    )
    op.add_column(
        "syntheses",
        sa.Column("verdict_card", postgresql.JSONB(), nullable=True),
        schema="council",
    )


def downgrade() -> None:
    op.drop_column("syntheses", "verdict_card", schema="council")
    op.drop_column("syntheses", "time_compression_report", schema="council")
    op.drop_column("messages", "round_number", schema="council")
    op.drop_column("messages", "reply_to_id", schema="council")
    op.drop_column("messages", "position", schema="council")
    op.drop_index("idx_pre_context_council", table_name="pre_debate_context", schema="council")
    op.drop_table("pre_debate_context", schema="council")
    op.drop_index("idx_twin_reviews_agent", table_name="twin_accuracy_reviews", schema="council")
    op.drop_table("twin_accuracy_reviews", schema="council")
    op.drop_column("councils", "human_notification_url", schema="council")
    op.drop_column("councils", "time_compression_ratio", schema="council")
    op.drop_column("councils", "estimated_duration_minutes", schema="council")
    op.drop_constraint("ck_council_meeting_type", "councils", schema="council")
    op.drop_column("councils", "meeting_type", schema="council")
    op.drop_column("agents", "accuracy_score", schema="council")
    op.drop_column("agents", "twin_profile", schema="council")
    op.drop_column("agents", "authorization_scope", schema="council")
    op.drop_column("agents", "twin_of", schema="council")
