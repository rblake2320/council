"""
API Key management router.

POST /api/keys        — create a new user API key (no auth — bootstrap)
GET  /api/keys        — list keys (name + prefix only, no hash)
DELETE /api/keys/{id} — revoke a key
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_api_key, optional_api_key
from app.db import get_db
from app.models.council import ApiKey

router = APIRouter(prefix="/api/keys", tags=["keys"])


# ── Schemas ────────────────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str
    expires_days: Optional[int] = None


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: str
    last_used_at: Optional[str] = None
    expires_at: Optional[str] = None


class ApiKeyCreated(ApiKeyOut):
    key: str  # shown once


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    _caller: Optional[dict] = Depends(optional_api_key),
):
    """Create a new API key. The full key is returned once — store it immediately."""
    full_key, key_hash, key_prefix = generate_api_key()

    expires_at = None
    if payload.expires_days:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_days)

    row = ApiKey(
        name=payload.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return {
        "data": {
            "id": str(row.id),
            "name": row.name,
            "key_prefix": row.key_prefix,
            "key": full_key,
            "created_at": row.created_at.isoformat(),
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        },
        "meta": {"note": "key shown once — store it securely"},
    }


@router.get("")
async def list_keys(
    db: AsyncSession = Depends(get_db),
    _caller: Optional[dict] = Depends(optional_api_key),
):
    """List API keys (name + prefix only — hash never returned)."""
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    rows = result.scalars().all()
    keys = [
        {
            "id": str(r.id),
            "name": r.name,
            "key_prefix": r.key_prefix,
            "created_at": r.created_at.isoformat(),
            "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        }
        for r in rows
    ]
    return {"data": keys, "meta": {"count": len(keys)}}


@router.delete("/{key_id}", status_code=204)
async def delete_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    _caller: Optional[dict] = Depends(optional_api_key),
):
    """Revoke (delete) an API key by ID."""
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    await db.delete(row)
    await db.commit()
