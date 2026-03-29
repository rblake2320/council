"""
Notification channel management + twin escalation API.

POST /api/notifications/channels   — register SMS/email/webhook/push channel
GET  /api/notifications/channels   — list channels for an identity
DELETE /api/notifications/channels/{id} — remove channel
POST /api/notifications/test       — send a test notification
GET  /api/councils/{council_id}/escalations — list pending twin escalations
POST /api/councils/{council_id}/escalations/{id}/respond — human responds to escalation
POST /api/notifications/respond/{notification_id} — respond to a notification requiring input
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.db import get_db
from app.engine.notifications import notification_engine
from app.models.council import NotificationChannel, TwinEscalation, Council
from app.utils import make_response

router = APIRouter(prefix="/api", tags=["notifications"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class NotificationChannelCreate(BaseModel):
    identity: str = Field(..., description="Human identity — email, phone, or ID. Must match twin_of or human_participant.identity")
    display_name: str = Field(..., description="Human-readable name for this channel")
    channel_type: str = Field(..., description="sms | email | webhook | push | slack | discord")
    destination: str = Field(..., description="Phone number, email address, webhook URL, etc.")
    config: dict = Field(default_factory=dict, description="Provider credentials (Twilio, SendGrid, etc.)")
    notify_on: list[str] = Field(
        default=["twin_needs_input", "meeting_complete", "synthesis_ready"],
        description="Event types that trigger this channel"
    )


class NotificationChannelOut(BaseModel):
    id: UUID
    identity: str
    display_name: str
    channel_type: str
    destination: str  # Note: in production, mask sensitive values
    notify_on: list[str]
    is_active: bool
    last_notified_at: Optional[datetime]
    created_at: datetime


class EscalationResponse(BaseModel):
    human_instruction: str = Field(..., description="What the human wants the twin to say/do")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/notifications/channels", status_code=status.HTTP_201_CREATED)
async def create_notification_channel(
    body: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_api_key),
):
    """Register a notification channel for a human identity."""
    valid_types = {"sms", "email", "webhook", "push", "slack", "discord"}
    if body.channel_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CHANNEL_TYPE", "message": f"Must be one of: {', '.join(valid_types)}"}
        )

    channel = NotificationChannel(
        identity=body.identity,
        display_name=body.display_name,
        channel_type=body.channel_type,
        destination=body.destination,
        config=body.config,
        notify_on=body.notify_on,
        is_active=True,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return make_response(data={"id": str(channel.id), "channel_type": channel.channel_type, "status": "created"})


@router.get("/notifications/channels")
async def list_notification_channels(
    identity: str,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_api_key),
):
    """List notification channels for a human identity."""
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.identity == identity)
    )
    channels = result.scalars().all()
    data = [
        {
            "id": str(c.id),
            "channel_type": c.channel_type,
            "display_name": c.display_name,
            "destination": c.destination[:4] + "****" if len(c.destination) > 6 else "****",  # mask
            "notify_on": c.notify_on,
            "is_active": c.is_active,
            "last_notified_at": c.last_notified_at.isoformat() if c.last_notified_at else None,
        }
        for c in channels
    ]
    return make_response(data=data)


@router.delete("/notifications/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification_channel(
    channel_id: UUID,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_api_key),
):
    """Remove a notification channel."""
    result = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND"})
    await db.delete(channel)
    await db.commit()


@router.post("/notifications/test")
async def send_test_notification(
    identity: str,
    event_type: str = "meeting_complete",
    _auth=Depends(require_api_key),
):
    """Send a test notification to verify channel configuration."""
    context = {
        "agent_name": "NOVA",
        "council_title": "Test Council",
        "duration": "4 minutes",
        "estimated_duration": "60 minutes",
        "compression_ratio": "15",
        "recommendation": "This is a test notification from Council platform.",
        "yes_count": 3, "no_count": 1, "abstain_count": 1,
        "council_url": "http://localhost:3000/councils/test",
        "reason": "Test escalation reason",
        "tentative_response": "Test tentative response",
        "timeout_minutes": 5,
    }
    results = await notification_engine.notify(identity=identity, event_type=event_type, context=context)
    return make_response(data={"results": results, "channels_notified": len(results)})


@router.get("/councils/{council_id}/escalations")
async def list_escalations(
    council_id: UUID,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_api_key),
):
    """List twin escalations for a council. Poll this to see if your twin needs input."""
    query = select(TwinEscalation).where(TwinEscalation.council_id == council_id)
    if status_filter:
        query = query.where(TwinEscalation.status == status_filter)
    result = await db.execute(query.order_by(TwinEscalation.escalated_at.desc()))
    escalations = result.scalars().all()
    data = [
        {
            "id": str(e.id),
            "agent_id": str(e.agent_id),
            "status": e.status,
            "escalation_reason": e.escalation_reason,
            "twin_tentative_response": e.twin_tentative_response,
            "timeout_seconds": e.timeout_seconds,
            "escalated_at": e.escalated_at.isoformat(),
            "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
        }
        for e in escalations
    ]
    return make_response(data=data)


@router.post("/councils/{council_id}/escalations/{escalation_id}/respond")
async def respond_to_escalation(
    council_id: UUID,
    escalation_id: UUID,
    body: EscalationResponse,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
    _auth=Depends(require_api_key),
):
    """
    Human responds to a twin escalation.
    The debate engine picks this up and injects the instruction into the twin's next response.
    The meeting continues.
    """
    result = await db.execute(
        select(TwinEscalation).where(
            TwinEscalation.id == escalation_id,
            TwinEscalation.council_id == council_id,
        )
    )
    escalation = result.scalar_one_or_none()
    if not escalation:
        raise HTTPException(status_code=404, detail={"code": "ESCALATION_NOT_FOUND"})

    if escalation.status != "pending":
        raise HTTPException(
            status_code=400,
            detail={"code": "ALREADY_RESOLVED", "message": f"Escalation is already {escalation.status}"}
        )

    escalation.status = "human_responded"
    escalation.human_instruction = body.human_instruction
    escalation.resolved_at = datetime.now(timezone.utc)
    await db.commit()

    # Broadcast via Redis so the debate engine picks up the instruction
    redis = getattr(request.app.state if request else None, "redis", None)
    if not redis:
        try:
            from app.main import app as fastapi_app  # noqa: PLC0415
            redis = getattr(fastapi_app.state, "redis", None)
        except Exception:
            pass

    if redis:
        import json  # noqa: PLC0415
        await redis.publish(
            f"council:{council_id}",
            json.dumps({
                "type": "escalation_resolved",
                "data": {
                    "escalation_id": str(escalation_id),
                    "agent_id": str(escalation.agent_id),
                    "human_instruction": body.human_instruction,
                },
            }),
        )

    return make_response(data={
        "escalation_id": str(escalation_id),
        "status": "human_responded",
        "message": "Instruction received. The debate engine will incorporate your guidance in the next agent response.",
    })
