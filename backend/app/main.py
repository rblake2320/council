"""
Council — Collaborative AI Agent Platform v1.0.1
FastAPI application entry point.

Mounts:
- /api/agents     — agent management
- /api/councils   — council management, debate control, SSE
- /ws/councils/*  — WebSocket real-time sessions
- /api/sessions   — session list
- /api/keys       — API key management
- /api/health     — health check
- /docs           — Swagger UI
- /redoc          — ReDoc
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import agents, councils, sessions, notifications, keys
from app.utils import make_response

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:  connect Redis, run Alembic migrations
    Shutdown: close Redis connection
    """
    # Redis
    logger.info("Connecting to Redis at %s", settings.redis_url)
    app.state.redis = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    try:
        await app.state.redis.ping()
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning("Redis not available: %s — WebSocket/SSE broadcast will not work", exc)
        app.state.redis = None

    # Alembic migrations — skip at runtime (run `alembic upgrade head` manually before start)
    logger.info("Skipping runtime migrations — run 'alembic upgrade head' separately if needed")

    yield

    # Shutdown
    if app.state.redis:
        await app.state.redis.aclose()
        logger.info("Redis connection closed")


def _run_migrations() -> None:
    """Run Alembic migrations synchronously at startup."""
    from alembic import command  # noqa: PLC0415
    from alembic.config import Config  # noqa: PLC0415
    import os  # noqa: PLC0415

    # alembic.ini is one level up from app/
    alembic_cfg_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    if not os.path.exists(alembic_cfg_path):
        logger.warning("alembic.ini not found at %s — skipping migrations", alembic_cfg_path)
        return
    alembic_cfg = Config(alembic_cfg_path)
    command.upgrade(alembic_cfg, "head")


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Council API",
    description=(
        "Collaborative AI Agent Platform — multi-agent debate engine with "
        "real-time WebSocket and SSE support. "
        "AI-agent friendly: structured responses, machine-readable error codes, "
        "stable UUIDs, and full API key authentication via X-Council-Key header."
    ),
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    contact={
        "name": "Council Platform",
        "url": "https://github.com/your-org/council",
    },
    license_info={
        "name": "Private",
    },
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "*",  # API clients (AI agents, curl, Postman) — restrict in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Request-ID"],
)


# ---------------------------------------------------------------------------
# Request ID + timing middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def request_id_and_timing(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    start = time.perf_counter()

    response = await call_next(request)

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)

    # Stub rate-limit headers (replace with real implementation when Redis bucket is added)
    response.headers["X-RateLimit-Limit"] = str(settings.rate_limit_per_minute)
    response.headers["X-RateLimit-Remaining"] = str(settings.rate_limit_per_minute)

    return response


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    logger.error("Unhandled exception [%s] %s %s: %s", request_id, request.method, request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Check server logs.",
                "request_id": request_id,
            }
        },
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    # If it's an HTTPException with a detail dict (our custom 404s), pass it through
    from fastapi import HTTPException as _HTTPException  # noqa: PLC0415
    if isinstance(exc, _HTTPException) and isinstance(exc.detail, dict):
        return JSONResponse(status_code=404, content={"error": exc.detail})
    # Otherwise it's a routing miss (route doesn't exist)
    return JSONResponse(
        status_code=404,
        content={
            "error": {
                "code": "NOT_FOUND",
                "message": f"Route {request.method} {request.url.path} not found.",
            }
        },
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(agents.router)
app.include_router(councils.router)
app.include_router(sessions.router)
app.include_router(notifications.router)
app.include_router(keys.router)


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

@app.get(
    "/api/health",
    tags=["system"],
    summary="Health check",
    description="Returns system health. Suitable for load balancer probes and monitoring.",
)
async def health_check(request: Request):
    from sqlalchemy import text  # noqa: PLC0415
    from app.db import AsyncSessionLocal  # noqa: PLC0415
    from app.engine.providers.ollama import OllamaProvider  # noqa: PLC0415
    import httpx  # noqa: PLC0415

    health: dict[str, Any] = {
        "status": "ok",
        "db": "unknown",
        "redis": "unknown",
        "ollama": "unknown",
        "agents_count": 0,
        "councils_count": 0,
        "environment": settings.environment,
        "version": settings.app_version,
    }

    # DB check
    try:
        async with AsyncSessionLocal() as db:
            from app.models.agent import Agent  # noqa: PLC0415
            from app.models.council import Council  # noqa: PLC0415
            from sqlalchemy import func, select  # noqa: PLC0415

            agents_r = await db.execute(select(func.count()).select_from(Agent))
            health["agents_count"] = agents_r.scalar_one() or 0

            councils_r = await db.execute(select(func.count()).select_from(Council))
            health["councils_count"] = councils_r.scalar_one() or 0

            health["db"] = "ok"
    except Exception as exc:
        health["db"] = f"error: {exc}"
        health["status"] = "degraded"

    # Redis check
    try:
        redis = getattr(request.app.state, "redis", None)
        if redis:
            await redis.ping()
            health["redis"] = "ok"
        else:
            health["redis"] = "not_configured"
    except Exception as exc:
        health["redis"] = f"error: {exc}"
        health["status"] = "degraded"

    # Ollama check
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                health["ollama"] = f"ok ({len(models)} models)"
            else:
                health["ollama"] = f"error: HTTP {resp.status_code}"
    except Exception as exc:
        health["ollama"] = f"error: {exc}"

    http_status = 200 if health["status"] == "ok" else 207
    return JSONResponse(content=make_response(data=health), status_code=http_status)


# ---------------------------------------------------------------------------
# Root redirect
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse(content={
        "service": "Council API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/health",
    })


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    import uvicorn  # noqa: PLC0415
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8600,
        reload=settings.environment == "development",
        log_level="info",
    )


if __name__ == "__main__":
    main()
