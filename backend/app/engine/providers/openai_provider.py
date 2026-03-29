"""
OpenAI provider — handles both OpenAI (gpt-* models) and NVIDIA NIM
(same OpenAI-compatible API at a different base_url).

Routing decision (made by ModelRouter, not here):
- gpt-*            → OpenAI API at api.openai.com
- nvidia-* / nim-* → NVIDIA NIM at integrate.api.nvidia.com/v1
"""
import logging
from typing import AsyncGenerator

from app.config import settings
from app.engine.providers.base import BaseProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseProvider):
    """
    Wraps the openai SDK async client.
    Pass base_url and api_key to point at NVIDIA NIM or any other
    OpenAI-compatible endpoint.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        provider_name: str = "openai",
    ) -> None:
        self._api_key = api_key or settings.openai_api_key
        self._base_url = base_url
        self._provider_name = provider_name
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import openai  # noqa: PLC0415
                kwargs = {"api_key": self._api_key}
                if self._base_url:
                    kwargs["base_url"] = self._base_url
                self._client = openai.AsyncOpenAI(**kwargs)
            except ImportError as exc:
                raise RuntimeError(
                    "openai package is not installed. Run: pip install openai"
                ) from exc
        return self._client

    async def generate(
        self,
        messages: list[dict],
        model: str,
        config: dict,
    ) -> AsyncGenerator[str, None]:
        """Stream completion from OpenAI or NVIDIA NIM."""
        client = self._get_client()

        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                max_tokens=config.get("max_tokens", 1024),
                temperature=config.get("temperature", 0.7),
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content

        except Exception as exc:
            logger.error(
                "%s generation error for model %s: %s",
                self._provider_name, model, exc,
            )
            raise

    async def health_check(self) -> bool:
        """Verify connectivity by listing available models."""
        if not self._api_key:
            return False
        try:
            client = self._get_client()
            await client.models.list()
            return True
        except Exception as exc:
            logger.warning("%s health check failed: %s", self._provider_name, exc)
            return False
