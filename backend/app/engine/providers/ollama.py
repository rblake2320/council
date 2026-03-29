"""
Ollama provider — streams tokens via POST /api/chat.

Ollama is the default local inference backend. All models not matching
claude-* or gpt-* patterns are routed here.
"""
import json
import logging
from typing import AsyncGenerator

import httpx

from app.config import settings
from app.engine.providers.base import BaseProvider

logger = logging.getLogger(__name__)


class OllamaProvider(BaseProvider):

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.ollama_url).rstrip("/")
        # Shared async client — reused across requests (connection pooling)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=5.0),
            )
        return self._client

    async def generate(
        self,
        messages: list[dict],
        model: str,
        config: dict,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion from Ollama."""
        client = await self._get_client()

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": config.get("temperature", 0.7),
                "num_predict": config.get("max_tokens", 1024),
            },
        }

        try:
            async with client.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content

                    if data.get("done"):
                        break

        except httpx.HTTPStatusError as exc:
            logger.error("Ollama HTTP error %s for model %s: %s", exc.response.status_code, model, exc)
            raise
        except httpx.RequestError as exc:
            logger.error("Ollama connection error for model %s: %s", model, exc)
            raise

    async def health_check(self) -> bool:
        """Check Ollama is running by listing available models."""
        try:
            client = await self._get_client()
            resp = await client.get("/api/tags", timeout=5.0)
            resp.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("Ollama health check failed: %s", exc)
            return False

    async def list_models(self) -> list[str]:
        """Return names of all locally available Ollama models."""
        try:
            client = await self._get_client()
            resp = await client.get("/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
