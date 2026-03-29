"""
SQLAlchemy 2.0 async ORM — Agent model.

Agents are the participants in council debates. They may be:
- Internal PKA agents (is_external=False) — driven by the debate engine
- External AI agents (is_external=True) — connect via WebSocket/SSE with an API key
"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.council import AgentMemory, Message, Participant, Webhook


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = {"schema": "council"}

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    personality: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model_preference: Mapped[str] = mapped_column(
        Text, nullable=False, default="gemma3:latest"
    )
    tools_allowed: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list
    )
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # External agent auth
    api_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    webhook_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    participations: Mapped[List["Participant"]] = relationship(
        "Participant", back_populates="agent", cascade="all, delete-orphan"
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="agent"
    )
    memories: Mapped[List["AgentMemory"]] = relationship(
        "AgentMemory", back_populates="agent", cascade="all, delete-orphan"
    )
    webhooks: Mapped[List["Webhook"]] = relationship(
        "Webhook", back_populates="agent", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Agent id={self.id} name={self.name!r} role={self.role!r}>"
