"""
005 — Security events and knowledge base

Two tables that power the learning + safety system:

security_events — append-only log of prompt injection attempts detected by PromptGuard.
knowledge_base  — structured summaries extracted from completed council debates by LearningCapture.

Revision ID: 005_security_and_learning
Revises: 004_notifications
Create Date: 2026-03-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_security_and_learning"
down_revision: Union[str, None] = "004_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # council.security_events
    #
    # Append-only log of every injection attempt detected by PromptGuard.
    # One row per detected event; never updated, only inserted.
    # -----------------------------------------------------------------------
    op.create_table(
        "security_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # May be NULL for events not tied to a specific council (e.g. auth probes)
        sa.Column("council_id", postgresql.UUID(as_uuid=True), nullable=True),
        # "human" | "agent:<name>" | "system" | "prompt_list"
        sa.Column("source", sa.Text(), nullable=False),
        # "LOW" | "MEDIUM" | "HIGH"
        sa.Column("severity", sa.Text(), nullable=False),
        # JSON array of matched pattern IDs e.g. ["role_override", "jailbreak_dan"]
        sa.Column("patterns", postgresql.JSONB(), nullable=False, server_default="[]"),
        # Excerpt of flagged content (max 500 chars)
        sa.Column("content_excerpt", sa.Text(), nullable=True),
        # "blocked" | "flagged_and_sanitized" | "flagged" | "blocked_agent_output"
        sa.Column("action_taken", sa.Text(), nullable=False, server_default="flagged"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "severity IN ('LOW','MEDIUM','HIGH')",
            name="ck_security_severity",
        ),
        schema="council",
    )
    op.create_index(
        "idx_security_events_council",
        "security_events",
        ["council_id", "created_at"],
        schema="council",
    )
    op.create_index(
        "idx_security_events_severity",
        "security_events",
        ["severity", "created_at"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # council.knowledge_base
    #
    # Structured summaries extracted from completed debate sessions.
    # One entry per council, upserted on conflict (so re-running capture
    # for the same council updates the record rather than creating a duplicate).
    # -----------------------------------------------------------------------
    op.create_table(
        "knowledge_base",
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
            unique=True,
        ),
        sa.Column("topic", sa.Text(), nullable=False),
        # JSONB: {consensus, key_insights, dissenting_views, open_questions, recommendation}
        sa.Column(
            "summary",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        schema="council",
    )
    op.create_index(
        "idx_knowledge_base_council",
        "knowledge_base",
        ["council_id"],
        schema="council",
    )


def downgrade() -> None:
    op.drop_index("idx_knowledge_base_council", table_name="knowledge_base", schema="council")
    op.drop_table("knowledge_base", schema="council")
    op.drop_index("idx_security_events_severity", table_name="security_events", schema="council")
    op.drop_index("idx_security_events_council", table_name="security_events", schema="council")
    op.drop_table("security_events", schema="council")
