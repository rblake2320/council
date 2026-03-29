"""
003 — Human participants as first-class debate members

Humans join councils directly alongside AI agents — they are full participants,
not just spectators with an input box. Their messages appear in the debate stream
with their name and identity. They can take over from their digital twin mid-meeting.

Revision ID: 003_human_participants
Revises: 002_digital_twins
Create Date: 2026-03-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_human_participants"
down_revision: Union[str, None] = "002_digital_twins"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # council.human_participants
    #
    # Humans who join a council directly (not through a twin agent).
    # Tracked persistently so humans appear in the participant roster and
    # their messages are attributed correctly even across reconnections.
    # -----------------------------------------------------------------------
    op.create_table(
        "human_participants",
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
        # Human identity — set when they join
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("identity", sa.Text(), nullable=True),  # email or external ID
        # Role in this council: owner, participant, observer
        sa.Column("council_role", sa.Text(), nullable=False, server_default="participant"),
        # Is this human currently connected via WebSocket?
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        # If this human has a digital twin in the same council, track it
        sa.Column(
            "twin_agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Has the human taken over from their twin? (overrides twin auto-respond)
        sa.Column("twin_override_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "council_role IN ('owner','participant','observer')",
            name="ck_human_council_role",
        ),
        sa.UniqueConstraint("council_id", "display_name", name="uq_human_participant"),
        schema="council",
    )
    op.create_index(
        "idx_human_participants_council",
        "human_participants",
        ["council_id"],
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.messages: human_participant_id links human messages
    # to their human_participants record (named identity).
    # -----------------------------------------------------------------------
    op.add_column(
        "messages",
        sa.Column(
            "human_participant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("council.human_participants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.messages: display_name fallback for human messages
    # when human_participant_id is not set (e.g. quick anonymous join).
    # -----------------------------------------------------------------------
    op.add_column(
        "messages",
        sa.Column("display_name", sa.Text(), nullable=True),
        schema="council",
    )

    # -----------------------------------------------------------------------
    # Extend council.councils: allow observers (humans who can watch but not post)
    # and update the human_notification_url to also track the council owner's name.
    # -----------------------------------------------------------------------
    op.add_column(
        "councils",
        sa.Column("owner_name", sa.Text(), nullable=True),
        schema="council",
    )
    op.add_column(
        "councils",
        sa.Column("allow_observers", sa.Boolean(), nullable=False, server_default="true"),
        schema="council",
    )


def downgrade() -> None:
    op.drop_column("councils", "allow_observers", schema="council")
    op.drop_column("councils", "owner_name", schema="council")
    op.drop_column("messages", "display_name", schema="council")
    op.drop_column("messages", "human_participant_id", schema="council")
    op.drop_index("idx_human_participants_council", table_name="human_participants", schema="council")
    op.drop_table("human_participants", schema="council")
