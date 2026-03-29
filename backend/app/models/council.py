"""
SQLAlchemy 2.0 async ORM — Council, Participant, Message, Synthesis,
AgentMemory, ApiKey, Webhook models.
"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


# ---------------------------------------------------------------------------
# Council
# ---------------------------------------------------------------------------

class Council(Base):
    __tablename__ = "councils"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','paused','completed','archived')",
            name="ck_council_status",
        ),
        CheckConstraint(
            "mode IN ('quick','standard','marathon')",
            name="ck_council_mode",
        ),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    mode: Mapped[str] = mapped_column(Text, nullable=False, default="standard")
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    synthesis_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    participants: Mapped[List["Participant"]] = relationship(
        "Participant", back_populates="council", cascade="all, delete-orphan"
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="council", cascade="all, delete-orphan"
    )
    syntheses: Mapped[List["Synthesis"]] = relationship(
        "Synthesis", back_populates="council", cascade="all, delete-orphan"
    )
    agent_memories: Mapped[List["AgentMemory"]] = relationship(
        "AgentMemory", back_populates="council"
    )
    webhooks: Mapped[List["Webhook"]] = relationship(
        "Webhook", back_populates="council", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Council id={self.id} title={self.title!r} status={self.status!r}>"


# ---------------------------------------------------------------------------
# Participant (join table with extra columns)
# ---------------------------------------------------------------------------

class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = {"schema": "council"}

    council_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        primary_key=True,
    )
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    council: Mapped["Council"] = relationship("Council", back_populates="participants")
    agent: Mapped["Agent"] = relationship("Agent", back_populates="participations")


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------

class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('agent','human','system')",
            name="ck_message_role",
        ),
        Index("idx_messages_council", "council_id", "created_at"),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    council_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        nullable=False,
    )
    agent_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="SET NULL"),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mentions: Mapped[List[UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    council: Mapped["Council"] = relationship("Council", back_populates="messages")
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="messages")


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

class Synthesis(Base):
    __tablename__ = "syntheses"
    __table_args__ = {"schema": "council"}

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    council_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        nullable=False,
    )
    consensus: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dissent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    insights: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    votes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_used: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    council: Mapped["Council"] = relationship("Council", back_populates="syntheses")


# ---------------------------------------------------------------------------
# AgentMemory
# ---------------------------------------------------------------------------

class AgentMemory(Base):
    __tablename__ = "agent_memory"
    __table_args__ = (
        CheckConstraint(
            "memory_type IN ('self_model','session_log','feedback','pattern')",
            name="ck_memory_type",
        ),
        Index("idx_memory_agent", "agent_id", "memory_type"),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    council_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="SET NULL"),
        nullable=True,
    )
    memory_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    agent: Mapped["Agent"] = relationship("Agent", back_populates="memories")
    council: Mapped[Optional["Council"]] = relationship(
        "Council", back_populates="agent_memories"
    )


# ---------------------------------------------------------------------------
# ApiKey
# ---------------------------------------------------------------------------

class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = {"schema": "council"}

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    key_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    permissions: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {"read": True, "write": True, "join_council": True},
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

class Webhook(Base):
    __tablename__ = "webhooks"
    __table_args__ = {"schema": "council"}

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    council_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        nullable=True,
    )
    agent_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="CASCADE"),
        nullable=True,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    events: Mapped[List[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        default=lambda: ["message", "synthesis", "status_change"],
    )
    secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    council: Mapped[Optional["Council"]] = relationship(
        "Council", back_populates="webhooks"
    )
    agent: Mapped[Optional["Agent"]] = relationship(
        "Agent", back_populates="webhooks"
    )


# ---------------------------------------------------------------------------
# HumanParticipant (migration 003)
# ---------------------------------------------------------------------------

class HumanParticipant(Base):
    """
    A human participating directly in a council debate.
    Humans are first-class participants — they appear in the roster alongside
    AI agents, their messages are attributed by name, and they can take over
    from their digital twin mid-meeting.
    """
    __tablename__ = "human_participants"
    __table_args__ = (
        CheckConstraint(
            "council_role IN ('owner','participant','observer')",
            name="ck_human_council_role",
        ),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    council_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    identity: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # email or external ID
    council_role: Mapped[str] = mapped_column(Text, nullable=False, default="participant")
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    twin_agent_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="SET NULL"),
        nullable=True,
    )
    twin_override_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<HumanParticipant name={self.display_name!r} council={self.council_id}>"


# ---------------------------------------------------------------------------
# NotificationChannel (migration 004)
# ---------------------------------------------------------------------------

class NotificationChannel(Base):
    """
    Where to reach a human when their twin needs them — SMS, email, webhook, push.
    When a twin hits a decision outside its authorization scope, or when a meeting
    concludes, notifications fire through all active channels for that human identity.
    """
    __tablename__ = "notification_channels"
    __table_args__ = (
        CheckConstraint(
            "channel_type IN ('sms','email','webhook','push','slack','discord')",
            name="ck_channel_type",
        ),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    identity: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    channel_type: Mapped[str] = mapped_column(Text, nullable=False)
    destination: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notify_on: Mapped[List[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        default=lambda: ["twin_needs_input", "meeting_complete", "synthesis_ready"],
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# TwinEscalation (migration 004)
# ---------------------------------------------------------------------------

class TwinEscalation(Base):
    """
    When a twin hits a decision outside its authorization scope, it escalates
    to its human. The debate engine pauses that agent's turn, fires notifications,
    and waits for human_instruction before generating the agent's actual response.
    Timeout = twin abstains and debate continues.
    """
    __tablename__ = "twin_escalations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','human_responded','timed_out','auto_resolved')",
            name="ck_escalation_status",
        ),
        {"schema": "council"},
    )

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    council_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.councils.id", ondelete="CASCADE"),
        nullable=False,
    )
    agent_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    trigger_message_id: Mapped[Optional[UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("council.messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    escalation_reason: Mapped[str] = mapped_column(Text, nullable=False)
    twin_tentative_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    human_instruction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    escalated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
