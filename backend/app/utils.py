"""
Shared utilities for consistent API responses, error handling, and helpers.

Every API response uses:
{
    "data": ...,
    "meta": {
        "request_id": "...",
        "timestamp": "...",
        "version": "1.0.0",
        ...extra_meta
    }
}
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException, status

from app.config import settings


def make_response(
    data: Any,
    meta: Optional[dict] = None,
    status_code: int = 200,
) -> dict:
    """
    Wrap any data payload in the standard Council API envelope.
    """
    base_meta = {
        "request_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": settings.app_version,
    }
    if meta:
        base_meta.update(meta)

    return {
        "data": data,
        "meta": base_meta,
    }


def not_found(resource: str, resource_id: Any) -> HTTPException:
    """Return a standardised 404 exception."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "code": f"{resource.upper()}_NOT_FOUND",
            "message": f"{resource} with id '{resource_id}' was not found.",
        },
    )


def bad_request(code: str, message: str) -> HTTPException:
    """Return a standardised 400 exception."""
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": message},
    )


def conflict(code: str, message: str) -> HTTPException:
    """Return a standardised 409 exception."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": code, "message": message},
    )
