"""
Council management and debate control endpoints.

Full list in module docstring below.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import generate_api_key, optional_api_key, require_api_key
from app.db import get_db
from app.engine.debate import debate_engine
from app.engine.synthesis import synthesis_engine
from app.models.agent import Agent
from app.models.council import AgentMemory, Council, Message, Participant, Synthesis, Webhook
from app.schemas.council import (
    CouncilCreate,
    CouncilOut,
    CouncilSummary,
    CouncilUpdate,
    ExternalParticipateRequest,
    MessageCreate,
    MessageOut,
    SynthesisOut,
    WebhookCreate,
    WebhookOut,
)
from app.utils import make_response, not_found

router = APIRouter(prefix="/api/councils", tags=["councils"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_council_or_404(council_id: UUID, db: AsyncSession) -> Council:
    result = await db.execute(
        select(Council)
        .options(
            selectinload(Council.participants).selectinload(Participant.agent)
        )
        .where(Council.id == council_id)
    )
    council = result.scalar_one_or_none()
    if not council:
        raise not_found("Council", council_id)
    return council


async def _message_count(council_id: UUID, db: AsyncSession) -> int:
    r = await db.execute(
        select(func.count()).where(Message.council_id == council_id)
    )
    return r.scalar_one() or 0


def _build_participants_out(council: Council) -> list[dict]:
    out = []
    for p in council.participants:
        a = p.agent
        out.append({
            "agent_id": str(a.id),
            "name": a.name,
            "role": a.role,
            "model_preference": a.model_preference,
            "is_external": a.is_external,
            "joined_at": p.joined_at.isoformat(),
        })
    return out


async def _council_out(council: Council, db: AsyncSession) -> dict:
    mc = await _message_count(council.id, db)
    return {
        "id": str(council.id),
        "title": council.title,
        "topic": council.topic,
        "status": council.status,
        "mode": council.mode,
        "config": council.config,
        "synthesis_id": str(council.synthesis_id) if council.synthesis_id else None,
        "created_at": council.created_at.isoformat(),
        "completed_at": council.completed_at.isoformat() if council.completed_at else None,
        "participants": _build_participants_out(council),
        "message_count": mc,
    }


# ---------------------------------------------------------------------------
# List councils
# ---------------------------------------------------------------------------

@router.get("", response_model=dict, summary="List councils")
async def list_councils(
    status_filter: Optional[str] = Query(None, alias="status"),
    mode: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    q = (
        select(Council)
        .options(selectinload(Council.participants).selectinload(Participant.agent))
        .order_by(Council.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status_filter:
        q = q.where(Council.status == status_filter)
    if mode:
        q = q.where(Council.mode == mode)

    result = await db.execute(q)
    councils = result.scalars().all()

    data = []
    for c in councils:
        mc = await _message_count(c.id, db)
        data.append({
            "id": str(c.id),
            "title": c.title,
            "topic": c.topic,
            "status": c.status,
            "mode": c.mode,
            "created_at": c.created_at.isoformat(),
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
            "message_count": mc,
            "participant_count": len(c.participants),
        })

    return make_response(data=data, meta={"total": len(data), "offset": offset, "limit": limit})


# ---------------------------------------------------------------------------
# Create council
# ---------------------------------------------------------------------------

@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED, summary="Create council")
async def create_council(
    body: CouncilCreate,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    # Verify agents exist
    agents_result = await db.execute(
        select(Agent).where(Agent.id.in_(body.agent_ids))
    )
    agents = agents_result.scalars().all()
    found_ids = {a.id for a in agents}
    missing = set(body.agent_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "AGENTS_NOT_FOUND", "missing": [str(i) for i in missing]},
        )

    council = Council(
        title=body.title,
        topic=body.topic,
        mode=body.mode,
        config=body.config,
    )
    db.add(council)
    await db.flush()  # get council.id

    for agent in agents:
        participant = Participant(council_id=council.id, agent_id=agent.id)
        db.add(participant)

    await db.commit()
    await db.refresh(council)

    # Re-load with participants
    council = await _load_council_or_404(council.id, db)
    return make_response(data=await _council_out(council, db))


# ---------------------------------------------------------------------------
# Get council
# ---------------------------------------------------------------------------

@router.get("/{council_id}", response_model=dict, summary="Get council detail")
async def get_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    council = await _load_council_or_404(council_id, db)
    return make_response(data=await _council_out(council, db))


# ---------------------------------------------------------------------------
# Update council
# ---------------------------------------------------------------------------

@router.put("/{council_id}", response_model=dict, summary="Update council")
async def update_council(
    council_id: UUID,
    body: CouncilUpdate,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(council, field, value)
    await db.commit()
    await db.refresh(council)
    council = await _load_council_or_404(council_id, db)
    return make_response(data=await _council_out(council, db))


# ---------------------------------------------------------------------------
# Archive council
# ---------------------------------------------------------------------------

@router.delete("/{council_id}", response_model=dict, summary="Archive council")
async def archive_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    council.status = "archived"
    await db.commit()
    return make_response(data={"archived": str(council_id)})


# ---------------------------------------------------------------------------
# Post a human message
# ---------------------------------------------------------------------------

@router.post("/{council_id}/messages", response_model=dict, status_code=status.HTTP_201_CREATED)
async def post_message(
    council_id: UUID,
    body: MessageCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
    request: Request = None,
):
    council = await _load_council_or_404(council_id, db)
    if council.status not in ("active",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "COUNCIL_NOT_ACTIVE", "message": f"Council status is '{council.status}'."},
        )

    msg = Message(
        council_id=council_id,
        agent_id=None,
        role=body.role,
        content=body.content,
        mentions=body.mentions,
        metadata_=body.metadata,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Broadcast to WebSocket clients via Redis
    redis = request.app.state.redis if request and hasattr(request.app.state, "redis") else None
    if redis:
        background_tasks.add_task(
            _broadcast_single_message, council_id, msg, redis
        )

    out = _message_to_dict(msg, agent_name=None, agent_role=None)
    return make_response(data=out)


async def _broadcast_single_message(council_id: UUID, msg: Message, redis) -> None:
    channel = f"council:{council_id}"
    payload = {
        "type": "message",
        "data": _message_to_dict(msg),
    }
    try:
        await redis.publish(channel, json.dumps(payload, default=str))
    except Exception as exc:
        logger.warning("Broadcast failed: %s", exc)


# ---------------------------------------------------------------------------
# Get messages (paginated + polling-friendly)
# ---------------------------------------------------------------------------

@router.get("/{council_id}/messages", response_model=dict, summary="Get messages")
async def get_messages(
    council_id: UUID,
    after: Optional[UUID] = Query(None, description="Return messages after this message ID (for polling)"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    await _load_council_or_404(council_id, db)

    q = (
        select(Message)
        .options(selectinload(Message.agent))
        .where(Message.council_id == council_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )

    if after:
        # Find the created_at of the 'after' message and filter
        after_result = await db.execute(
            select(Message.created_at).where(Message.id == after)
        )
        after_ts = after_result.scalar_one_or_none()
        if after_ts:
            q = q.where(Message.created_at > after_ts)

    result = await db.execute(q)
    messages = result.scalars().all()

    data = [
        _message_to_dict(m, m.agent.name if m.agent else None, m.agent.role if m.agent else None)
        for m in messages
    ]
    return make_response(data=data, meta={"total": len(data)})


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

@router.post("/{council_id}/synthesize", response_model=dict, summary="Trigger synthesis")
async def trigger_synthesis(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    await _load_council_or_404(council_id, db)
    synthesis = await synthesis_engine.synthesize(council_id=council_id, db=db)
    out = SynthesisOut.model_validate(synthesis)
    return make_response(data=out.model_dump())


@router.get("/{council_id}/synthesis", response_model=dict, summary="Get latest synthesis")
async def get_synthesis(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    result = await db.execute(
        select(Synthesis)
        .where(Synthesis.council_id == council_id)
        .order_by(Synthesis.created_at.desc())
        .limit(1)
    )
    synthesis = result.scalar_one_or_none()
    if not synthesis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_SYNTHESIS", "message": "No synthesis exists for this council yet. Call POST /synthesize first."},
        )
    out = SynthesisOut.model_validate(synthesis)
    return make_response(data=out.model_dump())


# ---------------------------------------------------------------------------
# Debate control
# ---------------------------------------------------------------------------

@router.post("/{council_id}/run", response_model=dict, summary="Run one debate round")
async def run_debate_round(
    council_id: UUID,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    if council.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "COUNCIL_NOT_ACTIVE", "message": f"Status is '{council.status}'. Resume before running."},
        )
    redis = getattr(request.app.state, "redis", None)
    background_tasks.add_task(debate_engine.run_round, council_id, db, redis)
    return make_response(data={"status": "round_started", "council_id": str(council_id)})


@router.post("/{council_id}/pause", response_model=dict, summary="Pause debate")
async def pause_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    council.status = "paused"
    await db.commit()
    return make_response(data={"status": "paused", "council_id": str(council_id)})


@router.post("/{council_id}/resume", response_model=dict, summary="Resume debate")
async def resume_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    if council.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NOT_PAUSED", "message": f"Council is '{council.status}', not paused."},
        )
    council.status = "active"
    await db.commit()
    return make_response(data={"status": "active", "council_id": str(council_id)})


@router.post("/{council_id}/complete", response_model=dict, summary="Mark council completed")
async def complete_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)
    council.status = "completed"
    council.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return make_response(data={"status": "completed", "council_id": str(council_id)})


# ---------------------------------------------------------------------------
# External agent participation
# ---------------------------------------------------------------------------

@router.post(
    "/{council_id}/participate",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Join council as external AI agent",
    description=(
        "External AI agents call this endpoint to join a council ad-hoc. "
        "The agent is created (or retrieved by name) and added as a participant. "
        "Requires X-Council-Key authentication."
    ),
)
async def external_participate(
    council_id: UUID,
    body: ExternalParticipateRequest,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    council = await _load_council_or_404(council_id, db)

    # Find or create agent
    existing = await db.execute(select(Agent).where(Agent.name == body.agent_name))
    agent = existing.scalar_one_or_none()

    if not agent:
        full_key, key_hash, _ = generate_api_key()
        agent = Agent(
            name=body.agent_name,
            role=body.role,
            personality=body.personality,
            system_prompt=body.system_prompt,
            model_preference=body.model,
            is_external=True,
            webhook_url=body.webhook_url,
            api_key=key_hash,
        )
        db.add(agent)
        await db.flush()
        agent_api_key = full_key
    else:
        agent_api_key = None  # existing agent, key not re-shown

    # Check not already in council
    existing_participant = await db.execute(
        select(Participant).where(
            Participant.council_id == council_id,
            Participant.agent_id == agent.id,
        )
    )
    if not existing_participant.scalar_one_or_none():
        participant = Participant(council_id=council_id, agent_id=agent.id)
        db.add(participant)

    await db.commit()
    await db.refresh(agent)

    response_data = {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "council_id": str(council_id),
        "status": "joined",
    }
    if agent_api_key:
        response_data["api_key"] = agent_api_key

    return make_response(
        data=response_data,
        meta={"note": "Connect to WebSocket at /ws/councils/{council_id}?token=<api_key>"},
    )


# ---------------------------------------------------------------------------
# SSE stream (EventSource-compatible)
# ---------------------------------------------------------------------------

@router.get(
    "/{council_id}/stream",
    summary="Stream messages via SSE",
    description=(
        "Server-Sent Events endpoint. AI agents and browsers can subscribe with EventSource. "
        "Uses X-Council-Key header or ?token= query param for auth. "
        "Events: message, synthesis, status_change, heartbeat."
    ),
)
async def stream_council(
    council_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    await _load_council_or_404(council_id, db)

    async def event_generator() -> AsyncGenerator[str, None]:
        redis = getattr(request.app.state, "redis", None)
        if redis is None:
            yield "event: error\ndata: {\"code\":\"NO_REDIS\",\"message\":\"Redis not available\"}\n\n"
            return

        channel = f"council:{council_id}"
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)

        try:
            # Initial heartbeat
            yield "event: connected\ndata: {\"council_id\": \"" + str(council_id) + "\"}\n\n"

            heartbeat_interval = 15  # seconds
            last_heartbeat = asyncio.get_event_loop().time()

            while True:
                if await request.is_disconnected():
                    break

                now = asyncio.get_event_loop().time()
                if now - last_heartbeat > heartbeat_interval:
                    yield "event: heartbeat\ndata: {\"ts\": " + str(int(now)) + "}\n\n"
                    last_heartbeat = now

                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=1.0,
                    )
                except asyncio.TimeoutError:
                    continue

                if message and message.get("type") == "message":
                    raw = message["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    try:
                        payload = json.loads(raw)
                        event_type = payload.get("type", "message")
                        data = json.dumps(payload.get("data", payload), default=str)
                        yield f"event: {event_type}\ndata: {data}\n\n"
                    except Exception:
                        yield f"event: message\ndata: {raw}\n\n"

        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Webhook management
# ---------------------------------------------------------------------------

@router.post("/{council_id}/webhooks", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register_webhook(
    council_id: UUID,
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    await _load_council_or_404(council_id, db)
    webhook = Webhook(
        council_id=council_id,
        url=body.url,
        events=body.events,
        secret=body.secret,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    out = WebhookOut.model_validate(webhook)
    return make_response(data=out.model_dump())


# ---------------------------------------------------------------------------
# Export transcript
# ---------------------------------------------------------------------------

@router.get(
    "/{council_id}/export",
    summary="Export council transcript",
    description="Machine-readable JSON export of the complete council including all messages and latest synthesis.",
)
async def export_council(
    council_id: UUID,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    council = await _load_council_or_404(council_id, db)

    msg_result = await db.execute(
        select(Message)
        .options(selectinload(Message.agent))
        .where(Message.council_id == council_id)
        .order_by(Message.created_at.asc())
    )
    messages = msg_result.scalars().all()

    synthesis_result = await db.execute(
        select(Synthesis)
        .where(Synthesis.council_id == council_id)
        .order_by(Synthesis.created_at.desc())
        .limit(1)
    )
    synthesis = synthesis_result.scalar_one_or_none()

    export_data = {
        "export_version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "council": {
            "id": str(council.id),
            "title": council.title,
            "topic": council.topic,
            "status": council.status,
            "mode": council.mode,
            "created_at": council.created_at.isoformat(),
            "completed_at": council.completed_at.isoformat() if council.completed_at else None,
        },
        "participants": _build_participants_out(council),
        "messages": [
            _message_to_dict(m, m.agent.name if m.agent else None, m.agent.role if m.agent else None)
            for m in messages
        ],
        "synthesis": SynthesisOut.model_validate(synthesis).model_dump() if synthesis else None,
    }

    return make_response(data=export_data)


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _message_to_dict(
    msg: Message,
    agent_name: Optional[str] = None,
    agent_role: Optional[str] = None,
) -> dict:
    return {
        "id": str(msg.id),
        "council_id": str(msg.council_id),
        "agent_id": str(msg.agent_id) if msg.agent_id else None,
        "agent_name": agent_name,
        "agent_role": agent_role,
        "role": msg.role,
        "content": msg.content,
        "mentions": [str(m) for m in (msg.mentions or [])],
        "metadata": msg.metadata_,
        "created_at": msg.created_at.isoformat(),
    }
