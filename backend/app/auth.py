"""
API key authentication for external AI agents and human clients.

Keys are stored hashed (bcrypt) in council.api_keys.
Format: ck_<32 random hex chars>
The full key is shown ONCE on creation; after that only the ck_XXXX prefix
is stored so operators can identify which key is which.

Usage:
    # Hard require (write endpoints)
    key_info = await require_api_key(request, db)

    # Soft require (read endpoints still work unauthenticated)
    key_info = await optional_api_key(request, db)
"""
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db


# ---------------------------------------------------------------------------
# Key generation
# ---------------------------------------------------------------------------

def generate_api_key() -> tuple[str, str, str]:
    """
    Returns (full_key, key_hash, key_prefix).
    full_key is shown to the caller exactly once.
    key_hash is stored in the database.
    key_prefix is the human-readable identifier (e.g. 'ck_a3f1').
    """
    raw = secrets.token_hex(32)
    full_key = f"{settings.api_key_prefix}{raw}"
    key_hash = _hash_key(full_key)
    key_prefix = full_key[:12]          # e.g. ck_a3f1b2c9
    return full_key, key_hash, key_prefix


def _hash_key(key: str) -> str:
    """SHA-256 hash — fast for lookup, good enough for API keys stored server-side."""
    return hashlib.sha256(key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Database lookup
# ---------------------------------------------------------------------------

async def _lookup_key(key: str, db: AsyncSession) -> Optional[dict]:
    """Return the api_keys row if the key is valid and not expired, else None."""
    # Import here to avoid circular imports at module load time
    from app.models.council import ApiKey  # noqa: PLC0415

    key_hash = _hash_key(key)
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    # Check expiry
    if row.expires_at and row.expires_at < datetime.now(timezone.utc):
        return None

    # Update last_used_at without loading full object again
    await db.execute(
        update(ApiKey)
        .where(ApiKey.id == row.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )

    return {
        "id": str(row.id),
        "name": row.name,
        "permissions": row.permissions,
        "key_prefix": row.key_prefix,
    }


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def _extract_key(request: Request) -> Optional[str]:
    """Read key from X-Council-Key header or ?token= query param."""
    header_key = request.headers.get("X-Council-Key")
    if header_key:
        return header_key
    return request.query_params.get("token")


async def require_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dependency for endpoints that require authentication.
    Raises 401 if key is missing or invalid.
    """
    key = _extract_key(request)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "MISSING_API_KEY",
                "message": "Provide your API key in the X-Council-Key header or ?token= query param.",
            },
            headers={"WWW-Authenticate": "ApiKey"},
        )

    info = await _lookup_key(key, db)
    if not info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_API_KEY",
                "message": "The provided API key is invalid or has expired.",
            },
            headers={"WWW-Authenticate": "ApiKey"},
        )

    return info


async def optional_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[dict]:
    """
    Dependency for endpoints where auth is optional.
    Returns None for unauthenticated requests — caller decides what to expose.
    """
    key = _extract_key(request)
    if not key:
        return None
    return await _lookup_key(key, db)


def check_permission(key_info: Optional[dict], permission: str) -> bool:
    """Return True if the key has the named permission."""
    if key_info is None:
        return False
    return bool(key_info.get("permissions", {}).get(permission, False))
