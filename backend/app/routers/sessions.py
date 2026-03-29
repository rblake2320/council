"""
WebSocket and session management endpoints.

WebSocket /ws/councils/{council_id}
    - Auth via ?token= or first message {type: "auth", token: "ck_..."}
    - Client sends: {type: "subscribe"} to join room
    - Client sends: {type: "message", content: "..."} to post
    - Client sends: {type: "heartbeat"} for keepalive
    - Server broadcasts: {type: "message", data: MessageOut}
    - Server broadcasts: {type: "synthesis", data: SynthesisOut}
    - Server sends: {type: "error", code: "...", message: "..."}

GET /api/sessions        - list active WebSocket sessions (in-memory)
POST /api/keys           - create API key (returns full key once)
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.websockets import WebSocketState
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_api_key, require_api_key, optional_api_key
from app.db import get_db, AsyncSessionLocal
from app.models.council import ApiKey, Message, Council, HumanParticipant
from app.models.agent import Agent
from app.schemas.council import ApiKeyCreate, ApiKeyCreated, ApiKeyOut
from app.utils import make_response

router = APIRouter(tags=["sessions"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory session registry (process-local; use Redis for multi-process)
# ---------------------------------------------------------------------------

class SessionRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}  # session_id → session info

    def register(self, session_id: str, info: dict) -> None:
        self._sessions[session_id] = {**info, "connected_at": datetime.now(timezone.utc).isoformat()}

    def deregister(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def list_all(self) -> list[dict]:
        return list(self._sessions.values())

    def count(self) -> int:
        return len(self._sessions)


session_registry = SessionRegistry()


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/councils/{council_id}")
async def websocket_council(
    websocket: WebSocket,
    council_id: UUID,
):
    """
    WebSocket endpoint for real-time council participation.

    Protocol:
    1. Client connects (optionally with ?token=<api_key>)
    2. Server sends {type: "connected", council_id: "..."}
    3. Client sends {type: "subscribe"} to start receiving messages
    4. Client can send {type: "message", content: "...", role: "human"} to post
    5. Server forwards new messages via Redis pub/sub to all connected clients
    """
    await websocket.accept()

    session_id = f"{council_id}:{id(websocket)}"
    redis = None
    pubsub = None

    try:
        # ------------------------------------------------------------------
        # Auth — token from query param or first message
        # ------------------------------------------------------------------
        token = websocket.query_params.get("token")
        if token:
            authenticated = await _authenticate_ws_token(token)
        else:
            authenticated = False  # allow read-only unauthenticated

        # ------------------------------------------------------------------
        # Verify council exists
        # ------------------------------------------------------------------
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Council).where(Council.id == council_id)
            )
            council = result.scalar_one_or_none()
            if not council:
                await websocket.send_json({
                    "type": "error",
                    "code": "COUNCIL_NOT_FOUND",
                    "message": f"Council {council_id} does not exist.",
                })
                await websocket.close(code=4004)
                return

        # ------------------------------------------------------------------
        # Register session
        # ------------------------------------------------------------------
        session_registry.register(session_id, {
            "session_id": session_id,
            "council_id": str(council_id),
            "authenticated": authenticated,
            "remote": websocket.client.host if websocket.client else "unknown",
        })

        # ------------------------------------------------------------------
        # Subscribe to Redis channel
        # ------------------------------------------------------------------
        app_redis = getattr(websocket.app.state if hasattr(websocket, "app") else None, "redis", None)
        # Fallback: get redis from app state via scope
        if not app_redis:
            from app.main import app as fastapi_app  # noqa: PLC0415
            app_redis = getattr(fastapi_app.state, "redis", None)

        channel = f"council:{council_id}"

        # Send connected ack
        await websocket.send_json({
            "type": "connected",
            "council_id": str(council_id),
            "authenticated": authenticated,
        })

        if app_redis:
            pubsub = app_redis.pubsub()
            await pubsub.subscribe(channel)

        # ------------------------------------------------------------------
        # Main message loop — listen from both client and Redis
        # ------------------------------------------------------------------
        async def receive_from_client():
            """Handle messages sent by the WebSocket client."""
            while True:
                try:
                    raw = await websocket.receive_text()
                except WebSocketDisconnect:
                    return
                except Exception:
                    return

                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "code": "INVALID_JSON",
                        "message": "Message must be valid JSON.",
                    })
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "heartbeat":
                    await websocket.send_json({"type": "heartbeat_ack"})

                elif msg_type == "subscribe":
                    await websocket.send_json({"type": "subscribed", "channel": channel})

                elif msg_type == "auth":
                    # Late auth — client sends token in first message
                    token_val = msg.get("token", "")
                    if await _authenticate_ws_token(token_val):
                        session_registry._sessions[session_id]["authenticated"] = True
                        await websocket.send_json({"type": "auth_ok"})
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "code": "AUTH_FAILED",
                            "message": "Invalid or expired token.",
                        })

                elif msg_type == "join":
                    # Human joins the council as a named participant.
                    # Protocol: {type: "join", display_name: "Ron", identity: "ron@example.com",
                    #            council_role: "participant"}
                    # After joining, they appear in the participant roster alongside AI agents.
                    display_name = msg.get("display_name", "").strip()
                    if not display_name:
                        await websocket.send_json({
                            "type": "error",
                            "code": "DISPLAY_NAME_REQUIRED",
                            "message": "display_name is required to join as a human participant.",
                        })
                        continue

                    identity = msg.get("identity", "").strip() or None
                    council_role = msg.get("council_role", "participant")
                    if council_role not in ("owner", "participant", "observer"):
                        council_role = "participant"

                    # Register human participant in DB
                    async with AsyncSessionLocal() as db:
                        from sqlalchemy import select as sa_select  # noqa: PLC0415
                        # Try to find existing record (reconnect case)
                        existing = await db.execute(
                            sa_select(HumanParticipant).where(
                                HumanParticipant.council_id == council_id,
                                HumanParticipant.display_name == display_name,
                            )
                        )
                        hp = existing.scalar_one_or_none()
                        if hp is None:
                            hp = HumanParticipant(
                                council_id=council_id,
                                display_name=display_name,
                                identity=identity,
                                council_role=council_role,
                                is_online=True,
                            )
                            db.add(hp)
                        else:
                            hp.is_online = True
                            hp.last_seen_at = datetime.now(timezone.utc)
                        await db.commit()
                        await db.refresh(hp)
                        human_participant_id = hp.id

                    # Store identity in session registry
                    session_registry._sessions[session_id]["display_name"] = display_name
                    session_registry._sessions[session_id]["human_participant_id"] = str(human_participant_id)
                    session_registry._sessions[session_id]["council_role"] = council_role
                    session_registry._sessions[session_id]["authenticated"] = True  # joining = authenticated

                    # Broadcast join event so UI shows human in roster
                    if app_redis:
                        await app_redis.publish(channel, json.dumps({
                            "type": "human_joined",
                            "data": {
                                "id": str(human_participant_id),
                                "display_name": display_name,
                                "council_role": council_role,
                                "council_id": str(council_id),
                            },
                        }))

                    await websocket.send_json({
                        "type": "joined",
                        "human_participant_id": str(human_participant_id),
                        "display_name": display_name,
                        "council_role": council_role,
                    })

                elif msg_type == "twin_override":
                    # Human takes over from their digital twin mid-meeting.
                    # While override is active, the twin will not auto-respond.
                    # Protocol: {type: "twin_override", active: true}
                    active = bool(msg.get("active", True))
                    hp_id = session_registry._sessions.get(session_id, {}).get("human_participant_id")
                    if hp_id:
                        async with AsyncSessionLocal() as db:
                            from sqlalchemy import select as sa_select  # noqa: PLC0415
                            result = await db.execute(
                                sa_select(HumanParticipant).where(HumanParticipant.id == hp_id)
                            )
                            hp = result.scalar_one_or_none()
                            if hp:
                                hp.twin_override_active = active
                                await db.commit()

                    # Broadcast so the debate engine knows to skip the twin
                    if app_redis:
                        await app_redis.publish(channel, json.dumps({
                            "type": "twin_override",
                            "data": {
                                "session_id": session_id,
                                "display_name": session_registry._sessions.get(session_id, {}).get("display_name", "Human"),
                                "active": active,
                            },
                        }))
                    await websocket.send_json({"type": "twin_override_ack", "active": active})

                elif msg_type == "message":
                    if not session_registry._sessions.get(session_id, {}).get("authenticated"):
                        await websocket.send_json({
                            "type": "error",
                            "code": "UNAUTHORIZED",
                            "message": "Join first: {type: 'join', display_name: 'Your Name'} or authenticate via ?token=",
                        })
                        continue

                    content = msg.get("content", "").strip()
                    if not content:
                        continue

                    sess = session_registry._sessions.get(session_id, {})
                    display_name = sess.get("display_name")
                    hp_id = sess.get("human_participant_id")

                    # Persist message with human identity
                    async with AsyncSessionLocal() as db:
                        new_msg = Message(
                            council_id=council_id,
                            agent_id=None,
                            role="human",
                            content=content,
                            mentions=[],
                            metadata_={
                                **msg.get("metadata", {}),
                                "display_name": display_name,
                                "council_role": sess.get("council_role", "participant"),
                            },
                        )
                        # Set human_participant_id if available (requires migration 003)
                        if hp_id:
                            try:
                                new_msg.human_participant_id = hp_id  # type: ignore[attr-defined]
                                new_msg.display_name = display_name  # type: ignore[attr-defined]
                            except Exception:
                                pass  # Column not yet migrated
                        db.add(new_msg)
                        await db.commit()
                        await db.refresh(new_msg)

                    if app_redis:
                        payload = {
                            "type": "message",
                            "data": {
                                "id": str(new_msg.id),
                                "council_id": str(council_id),
                                "agent_id": None,
                                "role": new_msg.role,
                                "content": new_msg.content,
                                "display_name": display_name,
                                "human_participant_id": hp_id,
                                "created_at": new_msg.created_at.isoformat(),
                            },
                        }
                        await app_redis.publish(channel, json.dumps(payload))

                elif msg_type == "typing":
                    # Broadcast typing indicator with human name
                    sess = session_registry._sessions.get(session_id, {})
                    if app_redis:
                        typing_payload = {
                            "type": "typing",
                            "session_id": session_id,
                            "display_name": sess.get("display_name"),
                            "is_human": True,
                        }
                        await app_redis.publish(channel, json.dumps(typing_payload))

        async def receive_from_redis():
            """Forward Redis pub/sub messages to this WebSocket client."""
            if not pubsub:
                return
            while True:
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=1.0,
                    )
                except asyncio.TimeoutError:
                    # Check if websocket is still open
                    if websocket.client_state == WebSocketState.DISCONNECTED:
                        return
                    continue
                except Exception:
                    return

                if message and message.get("type") == "message":
                    raw = message["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    if websocket.client_state == WebSocketState.CONNECTED:
                        try:
                            await websocket.send_text(raw)
                        except Exception:
                            return

        # Run both coroutines concurrently
        await asyncio.gather(
            receive_from_client(),
            receive_from_redis(),
            return_exceptions=True,
        )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WebSocket error for council %s: %s", council_id, exc)
    finally:
        session_registry.deregister(session_id)
        if pubsub:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception:
                pass
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()


async def _authenticate_ws_token(token: str) -> bool:
    """Check if a token is a valid API key."""
    if not token:
        return False
    async with AsyncSessionLocal() as db:
        from app.auth import _lookup_key  # noqa: PLC0415
        info = await _lookup_key(token, db)
        return info is not None


# ---------------------------------------------------------------------------
# List active sessions
# ---------------------------------------------------------------------------

@router.get("/api/sessions", response_model=dict, tags=["sessions"])
async def list_sessions(
    _key: dict = Depends(require_api_key),
):
    """List all active WebSocket sessions (in-memory, process-local)."""
    sessions = session_registry.list_all()
    return make_response(data=sessions, meta={"total": len(sessions)})


# ---------------------------------------------------------------------------
# API key management
# ---------------------------------------------------------------------------

@router.post(
    "/api/keys",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
    summary="Create API key",
    description="Creates a new API key. The full key is returned once — store it securely.",
)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    _key: Optional[dict] = Depends(optional_api_key),
):
    from app.auth import generate_api_key as gen_key  # noqa: PLC0415

    full_key, key_hash, key_prefix = gen_key()

    api_key = ApiKey(
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        permissions=body.permissions,
        expires_at=body.expires_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    out = ApiKeyCreated(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        permissions=api_key.permissions,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        api_key=full_key,
    )
    return make_response(
        data=out.model_dump(),
        meta={"note": "api_key shown once — store it securely"},
    )


@router.get("/api/keys", response_model=dict, tags=["auth"], summary="List API keys")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _key: dict = Depends(require_api_key),
):
    result = await db.execute(
        select(ApiKey).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    data = [
        ApiKeyOut.model_validate(k).model_dump()
        for k in keys
    ]
    return make_response(data=data, meta={"total": len(data)})
