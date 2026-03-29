"""
001 — Initial Council schema

Revision ID: 001_initial
Revises:
Create Date: 2026-03-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------
    op.execute("CREATE SCHEMA IF NOT EXISTS council")

    # ------------------------------------------------------------------
    # council.agents
    # ------------------------------------------------------------------
    op.create_table(
        "agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("personality", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("model_preference", sa.Text(), nullable=False, server_default="gemma3:latest"),
        sa.Column("tools_allowed", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("is_external", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("name", name="uq_agents_name"),
        sa.UniqueConstraint("api_key", name="uq_agents_api_key"),
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.councils
    # ------------------------------------------------------------------
    op.create_table(
        "councils",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("mode", sa.Text(), nullable=False, server_default="standard"),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("synthesis_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active','paused','completed','archived')",
            name="ck_council_status",
        ),
        sa.CheckConstraint(
            "mode IN ('quick','standard','marathon')",
            name="ck_council_mode",
        ),
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.participants
    # ------------------------------------------------------------------
    op.create_table(
        "participants",
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.messages
    # ------------------------------------------------------------------
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("mentions", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False, server_default="{}"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint("role IN ('agent','human','system')", name="ck_message_role"),
        schema="council",
    )
    op.create_index(
        "idx_messages_council",
        "messages",
        ["council_id", "created_at"],
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.syntheses
    # ------------------------------------------------------------------
    op.create_table(
        "syntheses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("consensus", sa.Text(), nullable=True),
        sa.Column("dissent", sa.Text(), nullable=True),
        sa.Column("insights", sa.Text(), nullable=True),
        sa.Column("recommendations", sa.Text(), nullable=True),
        sa.Column("votes", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("model_used", sa.Text(), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.agent_memory
    # ------------------------------------------------------------------
    op.create_table(
        "agent_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("memory_type", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "memory_type IN ('self_model','session_log','feedback','pattern')",
            name="ck_memory_type",
        ),
        schema="council",
    )
    op.create_index(
        "idx_memory_agent",
        "agent_memory",
        ["agent_id", "memory_type"],
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.api_keys
    # ------------------------------------------------------------------
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("key_hash", sa.Text(), unique=True, nullable=False),
        sa.Column("key_prefix", sa.Text(), nullable=False),
        sa.Column(
            "permissions",
            postgresql.JSONB(),
            nullable=False,
            server_default='{"read":true,"write":true,"join_council":true}',
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        schema="council",
    )

    # ------------------------------------------------------------------
    # council.webhooks
    # ------------------------------------------------------------------
    op.create_table(
        "webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column(
            "events",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("ARRAY['message','synthesis','status_change']"),
        ),
        sa.Column("secret", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        schema="council",
    )

    # ------------------------------------------------------------------
    # updated_at trigger for agents
    # ------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE FUNCTION council.set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER agents_updated_at
        BEFORE UPDATE ON council.agents
        FOR EACH ROW EXECUTE FUNCTION council.set_updated_at();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS agents_updated_at ON council.agents")
    op.execute("DROP FUNCTION IF EXISTS council.set_updated_at()")

    op.drop_table("webhooks", schema="council")
    op.drop_table("api_keys", schema="council")
    op.drop_index("idx_memory_agent", table_name="agent_memory", schema="council")
    op.drop_table("agent_memory", schema="council")
    op.drop_table("syntheses", schema="council")
    op.drop_index("idx_messages_council", table_name="messages", schema="council")
    op.drop_table("messages", schema="council")
    op.drop_table("participants", schema="council")
    op.drop_table("councils", schema="council")
    op.drop_table("agents", schema="council")
    op.execute("DROP SCHEMA IF EXISTS council CASCADE")
