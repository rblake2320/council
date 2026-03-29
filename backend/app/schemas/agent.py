"""
Pydantic v2 schemas for Agent objects.

api_key is only included in AgentOut when it is freshly created or rotated
— on all subsequent reads it is excluded (None).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Unique agent name")
    role: str = Field(..., min_length=1, max_length=100, description="Agent role (e.g. 'Devil's Advocate')")
    personality: Optional[str] = Field(None, max_length=500)
    system_prompt: str = Field(..., min_length=10, description="Full system prompt for this agent")
    model_preference: str = Field("gemma3:latest", description="Preferred LLM (e.g. gemma3:latest, claude-sonnet-4-6)")
    tools_allowed: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    is_external: bool = Field(False, description="True = external AI agent that connects via WebSocket/SSE")
    webhook_url: Optional[str] = Field(None, description="URL to notify when this agent is mentioned")

    @field_validator("name")
    @classmethod
    def name_no_spaces_leading_trailing(cls, v: str) -> str:
        return v.strip()


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, min_length=1, max_length=100)
    personality: Optional[str] = Field(None, max_length=500)
    system_prompt: Optional[str] = Field(None, min_length=10)
    model_preference: Optional[str] = None
    tools_allowed: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None
    is_external: Optional[bool] = None
    webhook_url: Optional[str] = None


class AgentSummary(BaseModel):
    """Lightweight representation for list endpoints."""
    id: UUID
    name: str
    role: str
    personality: Optional[str]
    model_preference: str
    is_external: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentMemoryOut(BaseModel):
    id: UUID
    agent_id: UUID
    council_id: Optional[UUID]
    memory_type: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentOut(BaseModel):
    """Full agent detail. api_key is only populated immediately after creation/rotation."""
    id: UUID
    name: str
    role: str
    personality: Optional[str]
    system_prompt: str
    model_preference: str
    tools_allowed: List[str]
    config: Dict[str, Any]
    is_external: bool
    webhook_url: Optional[str]
    api_key: Optional[str] = Field(
        None, description="Only returned on creation or key rotation. Store it securely — it will not be shown again."
    )
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentStatsOut(BaseModel):
    agent_id: UUID
    name: str
    total_councils: int
    total_messages: int
    memory_entries: int
