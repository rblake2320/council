"""
Pydantic v2 schemas for Council objects.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


# ---------------------------------------------------------------------------
# Participant
# ---------------------------------------------------------------------------

class ParticipantOut(BaseModel):
    agent_id: UUID
    name: str
    role: str
    model_preference: str
    is_external: bool
    joined_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Council
# ---------------------------------------------------------------------------

class CouncilCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    topic: str = Field(..., min_length=10, description="The question or topic the council will debate")
    mode: str = Field("standard", description="quick | standard | marathon")
    agent_ids: List[UUID] = Field(..., min_length=1, description="Agents to participate in this council")
    config: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("mode")
    @classmethod
    def valid_mode(cls, v: str) -> str:
        allowed = {"quick", "standard", "marathon"}
        if v not in allowed:
            raise ValueError(f"mode must be one of {allowed}")
        return v


class CouncilUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"active", "paused", "completed", "archived"}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


class CouncilSummary(BaseModel):
    id: UUID
    title: str
    topic: str
    status: str
    mode: str
    created_at: datetime
    completed_at: Optional[datetime]
    message_count: int = 0
    participant_count: int = 0

    model_config = {"from_attributes": True}


class CouncilOut(BaseModel):
    id: UUID
    title: str
    topic: str
    status: str
    mode: str
    config: Dict[str, Any]
    synthesis_id: Optional[UUID]
    created_at: datetime
    completed_at: Optional[datetime]
    participants: List[ParticipantOut] = Field(default_factory=list)
    message_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    role: str = Field("human", description="human | system")
    mentions: List[UUID] = Field(default_factory=list, description="Agent UUIDs mentioned in the message")
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        allowed = {"human", "system"}
        if v not in allowed:
            raise ValueError(f"role must be one of {allowed}")
        return v

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        # Basic XSS prevention: strip null bytes; full HTML sanitization happens at render layer
        return v.replace("\x00", "").strip()


class MessageOut(BaseModel):
    id: UUID
    council_id: UUID
    agent_id: Optional[UUID]
    agent_name: Optional[str] = None
    agent_role: Optional[str] = None
    role: str
    content: str
    mentions: List[UUID]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

class SynthesisOut(BaseModel):
    id: UUID
    council_id: UUID
    consensus: Optional[str]
    dissent: Optional[str]
    insights: Optional[str]
    recommendations: Optional[str]
    votes: Dict[str, Any]
    model_used: Optional[str]
    message_count: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# External agent participation
# ---------------------------------------------------------------------------

class ExternalParticipateRequest(BaseModel):
    """
    An external AI agent calls POST /api/councils/{id}/participate to join
    a council ad-hoc. The agent is created (or looked up by name) and added
    as a participant.
    """
    agent_name: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., min_length=1, max_length=100)
    system_prompt: str = Field(..., min_length=10)
    model: str = Field("gemma3:latest")
    webhook_url: Optional[str] = None
    personality: Optional[str] = None


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

class WebhookCreate(BaseModel):
    url: str = Field(..., description="HTTPS URL to receive webhook events")
    events: List[str] = Field(
        default_factory=lambda: ["message", "synthesis", "status_change"]
    )
    secret: Optional[str] = Field(None, description="HMAC secret for payload signing")

    @field_validator("events")
    @classmethod
    def valid_events(cls, v: List[str]) -> List[str]:
        allowed = {"message", "synthesis", "status_change", "agent_joined"}
        invalid = set(v) - allowed
        if invalid:
            raise ValueError(f"Unknown events: {invalid}. Allowed: {allowed}")
        return v


class WebhookOut(BaseModel):
    id: UUID
    council_id: Optional[UUID]
    agent_id: Optional[UUID]
    url: str
    events: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# API Key management
# ---------------------------------------------------------------------------

class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable label for this key")
    permissions: Dict[str, bool] = Field(
        default_factory=lambda: {"read": True, "write": True, "join_council": True}
    )
    expires_at: Optional[datetime] = None


class ApiKeyOut(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    permissions: Dict[str, Any]
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyOut):
    """Returned only on creation — includes the full key."""
    api_key: str = Field(..., description="Full API key. Store securely — shown once only.")
