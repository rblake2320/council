"""
004 — Notification channels and delivery

The twin runs meetings on your behalf. When it hits something outside its
authorization scope — or when the meeting concludes — it needs to reach you.
SMS, email, webhooks, or web push. You review and respond in 30 seconds.
The meeting continues.

Revision ID: 004_notifications
Revises: 003_human_participants
Create Date: 2026-03-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004_notifications"
down_revision: Union[str, None] = "003_human_participants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # council.notification_channels
    #
    # Where to reach a human when their twin needs them.
    # One human can have multiple channels (SMS + email + webhook).
    # -----------------------------------------------------------------------
    op.create_table(
        "notification_channels",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # Human identity this channel belongs to (matches human_participants.identity)
        sa.Column("identity", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),

        # Channel type: sms | email | webhook | push | slack | discord
        sa.Column("channel_type", sa.Text(), nullable=False),

        # Destination — format depends on channel_type:
        # sms      → "+15551234567"
        # email    → "ron@example.com"
        # webhook  → "https://..."
        # push     → Web Push subscription JSON
        # slack    → Slack webhook URL or user ID
        # discord  → Discord webhook URL
        sa.Column("destination", sa.Text(), nullable=False),

        # Credential / config (encrypted at rest in production)
        # e.g. for sms: {"provider": "twilio", "account_sid": "...", "auth_token": "..."}
        # for email: {"provider": "sendgrid", "api_key": "..."}
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),

        # Which events trigger this channel:
        # "twin_needs_input"    — twin hit decision outside authorization scope
        # "meeting_complete"    — council concluded, results ready
        # "agent_mention"       — an agent mentioned you by name
        # "round_complete"      — each round finished (high-frequency)
        # "synthesis_ready"     — synthesis generated
        # "twin_position_changed" — your twin reversed its position
        sa.Column(
            "notify_on",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("ARRAY['twin_needs_input','meeting_complete','synthesis_ready']"),
        ),

        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),

        sa.CheckConstraint(
            "channel_type IN ('sms','email','webhook','push','slack','discord')",
            name="ck_channel_type",
        ),
        schema="council",
    )
    op.create_index(
        "idx_notification_identity",
        "notification_channels",
        ["identity", "channel_type"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # council.notifications (delivery log)
    #
    # Every notification sent, its status, and any error.
    # -----------------------------------------------------------------------
    op.create_table(
        "notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "channel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.notification_channels.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "council_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.councils.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        # status: queued | sent | failed | acknowledged
        sa.Column("status", sa.Text(), nullable=False, server_default="queued"),
        # If twin_needs_input: did the human respond, and what did they say?
        sa.Column("requires_response", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("human_response", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('queued','sent','failed','acknowledged')",
            name="ck_notification_status",
        ),
        schema="council",
    )
    op.create_index(
        "idx_notifications_council",
        "notifications",
        ["council_id", "created_at"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # council.twin_escalations
    #
    # When a twin hits a decision outside its authorization_scope, it
    # escalates to its human. The meeting PAUSES on that agent's turn until
    # the human responds (or a timeout occurs and the twin abstains).
    # -----------------------------------------------------------------------
    op.create_table(
        "twin_escalations",
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
        # The message that triggered the escalation
        sa.Column(
            "trigger_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # What the twin was asked to decide
        sa.Column("escalation_reason", sa.Text(), nullable=False),
        # What the twin proposed before escalating
        sa.Column("twin_tentative_response", sa.Text(), nullable=True),
        # status: pending | human_responded | timed_out | auto_resolved
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        # Human's response (if any)
        sa.Column("human_instruction", sa.Text(), nullable=True),
        # How long to wait before timing out and having twin abstain
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="300"),  # 5 min default
        sa.Column("escalated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','human_responded','timed_out','auto_resolved')",
            name="ck_escalation_status",
        ),
        schema="council",
    )
    op.create_index(
        "idx_escalations_council",
        "twin_escalations",
        ["council_id", "status"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # API endpoints for notification management will be added to the router.
    # Add a notification_config column to agents for convenience.
    # -----------------------------------------------------------------------
    op.add_column(
        "agents",
        sa.Column(
            "notification_identity",
            sa.Text(),
            nullable=True,
            comment="Human identity (email/phone) to notify for this agent's twins"
        ),
        schema="council",
    )


def downgrade() -> None:
    op.drop_column("agents", "notification_identity", schema="council")
    op.drop_index("idx_escalations_council", table_name="twin_escalations", schema="council")
    op.drop_table("twin_escalations", schema="council")
    op.drop_index("idx_notifications_council", table_name="notifications", schema="council")
    op.drop_table("notifications", schema="council")
    op.drop_index("idx_notification_identity", table_name="notification_channels", schema="council")
    op.drop_table("notification_channels", schema="council")
