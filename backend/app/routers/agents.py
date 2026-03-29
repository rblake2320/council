"""
Agent management endpoints.

POST /api/agents          — create (returns api_key once)
GET  /api/agents          — list all (summary)
GET  /api/agents/{id}     — full detail
PUT  /api/agents/{id}     — update
DELETE /api/agents/{id}   — delete
POST /api/agents/{id}/rotate-key  — new API key
GET  /api/agents/{id}/memory      — agent memory entries
GET  /api/agents/{id}/stats       — participation + message stats
"""
import hashlib
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import optional_api_key, require_api_key
from app.auth import generate_api_key
from app.db import get_db
from app.models.agent import Agent
from app.models.council import AgentMemory, Message, Participant
from app.schemas.agent import (
    AgentCreate,
    AgentMemoryOut,
    AgentOut,
    AgentStatsOut,
    AgentSummary,
    AgentUpdate,
)
from app.utils import make_response, not_found

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# List agents
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=dict,
    summary="List all agents",
    description="Returns a summary list of all registered agents. No authentication required.",
)
async def list_agents(
    is_external: Optional[bool] = Query(None, description="Filter by external/internal agents"),
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    q = select(Agent).order_by(Agent.created_at.desc())
    if is_external is not None:
        q = q.where(Agent.is_external == is_external)
    result = await db.execute(q)
    agents = result.scalars().all()
    data = [AgentSummary.model_validate(a) for a in agents]
    return make_response(data=[a.model_dump() for a in data], meta={"total": len(data)})


# ---------------------------------------------------------------------------
# Create agent
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Create an agent",
    description="Creates a new agent. Returns the api_key once — store it securely.",
)
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    # Check name uniqueness
    existing = await db.execute(select(Agent).where(Agent.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "AGENT_NAME_EXISTS", "message": f"Agent name '{body.name}' is already taken."},
        )

    full_key, key_hash, _ = generate_api_key()

    agent = Agent(
        name=body.name,
        role=body.role,
        personality=body.personality,
        system_prompt=body.system_prompt,
        model_preference=body.model_preference,
        tools_allowed=body.tools_allowed,
        config=body.config,
        is_external=body.is_external,
        webhook_url=body.webhook_url,
        api_key=key_hash,   # store hash, not plaintext
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    out = AgentOut.model_validate(agent)
    out_dict = out.model_dump()
    # Return the full key once (not the hash stored in DB)
    out_dict["api_key"] = full_key

    return make_response(
        data=out_dict,
        meta={"note": "api_key shown once — store it securely"},
    )


# ---------------------------------------------------------------------------
# Get agent
# ---------------------------------------------------------------------------

@router.get(
    "/{agent_id}",
    response_model=dict,
    summary="Get agent detail",
)
async def get_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise not_found("Agent", agent_id)

    out = AgentOut.model_validate(agent)
    out_dict = out.model_dump()
    out_dict["api_key"] = None  # never expose stored hash on reads
    return make_response(data=out_dict)


# ---------------------------------------------------------------------------
# Update agent
# ---------------------------------------------------------------------------

@router.put(
    "/{agent_id}",
    response_model=dict,
    summary="Update agent",
)
async def update_agent(
    agent_id: UUID,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise not_found("Agent", agent_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)

    out = AgentOut.model_validate(agent)
    out_dict = out.model_dump()
    out_dict["api_key"] = None
    return make_response(data=out_dict)


# ---------------------------------------------------------------------------
# Delete agent
# ---------------------------------------------------------------------------

@router.delete(
    "/{agent_id}",
    response_model=dict,
    summary="Delete agent",
)
async def delete_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise not_found("Agent", agent_id)

    await db.delete(agent)
    await db.commit()
    return make_response(data={"deleted": str(agent_id)})


# ---------------------------------------------------------------------------
# Rotate API key
# ---------------------------------------------------------------------------

@router.post(
    "/{agent_id}/rotate-key",
    response_model=dict,
    summary="Rotate agent API key",
    description="Generates a new API key for this agent. The old key is immediately invalidated.",
)
async def rotate_key(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise not_found("Agent", agent_id)

    full_key, key_hash, _ = generate_api_key()
    agent.api_key = key_hash
    await db.commit()

    return make_response(
        data={
            "agent_id": str(agent_id),
            "api_key": full_key,
        },
        meta={"note": "New api_key shown once — store it securely. Old key is invalidated."},
    )


# ---------------------------------------------------------------------------
# Agent memory
# ---------------------------------------------------------------------------

@router.get(
    "/{agent_id}/memory",
    response_model=dict,
    summary="Get agent memory",
    description="Returns all persisted memory entries for an agent across all councils.",
)
async def get_agent_memory(
    agent_id: UUID,
    memory_type: Optional[str] = Query(None, description="Filter: self_model | session_log | feedback | pattern"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if not result.scalar_one_or_none():
        raise not_found("Agent", agent_id)

    q = (
        select(AgentMemory)
        .where(AgentMemory.agent_id == agent_id)
        .order_by(AgentMemory.created_at.desc())
        .limit(limit)
    )
    if memory_type:
        q = q.where(AgentMemory.memory_type == memory_type)

    mem_result = await db.execute(q)
    memories = mem_result.scalars().all()
    data = [AgentMemoryOut.model_validate(m) for m in memories]
    return make_response(data=[m.model_dump() for m in data], meta={"total": len(data)})


# ---------------------------------------------------------------------------
# Agent stats
# ---------------------------------------------------------------------------

@router.get(
    "/{agent_id}/stats",
    response_model=dict,
    summary="Get agent participation statistics",
)
async def get_agent_stats(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise not_found("Agent", agent_id)

    councils_count_result = await db.execute(
        select(func.count()).where(Participant.agent_id == agent_id)
    )
    total_councils = councils_count_result.scalar_one() or 0

    messages_count_result = await db.execute(
        select(func.count()).where(Message.agent_id == agent_id)
    )
    total_messages = messages_count_result.scalar_one() or 0

    memory_count_result = await db.execute(
        select(func.count()).where(AgentMemory.agent_id == agent_id)
    )
    total_memory = memory_count_result.scalar_one() or 0

    stats = AgentStatsOut(
        agent_id=agent_id,
        name=agent.name,
        total_councils=total_councils,
        total_messages=total_messages,
        memory_entries=total_memory,
    )
    return make_response(data=stats.model_dump())
