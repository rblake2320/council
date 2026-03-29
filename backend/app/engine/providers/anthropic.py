"""
Anthropic provider — uses the official anthropic SDK with streaming.

Supported models: claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001
(and any future claude-* models).
"""
import logging
from typing import AsyncGenerator

from app.config import settings
from app.engine.providers.base import BaseProvider

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseProvider):

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.anthropic_api_key
        self._client = None

    def _get_client(self):
        """Lazy-init the Anthropic async client."""
        if self._client is None:
            try:
                import anthropic  # noqa: PLC0415
                self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
            except ImportError as exc:
                raise RuntimeError(
                    "anthropic package is not installed. Run: pip install anthropic"
                ) from exc
        return self._client

    async def generate(
        self,
        messages: list[dict],
        model: str,
        config: dict,
    ) -> AsyncGenerator[str, None]:
        """Stream completion from Anthropic via the messages API."""
        client = self._get_client()

        # Separate system prompt from messages list (Anthropic API convention)
        system_content = None
        filtered_messages = []
        for msg in messages:
            if msg["role"] == "system":
                # Anthropic takes system as a top-level param, not in messages list
                system_content = msg["content"]
            else:
                filtered_messages.append(msg)

        # Ensure messages alternate correctly (required by Anthropic)
        # If first message is not from "user", prepend a stub
        if filtered_messages and filtered_messages[0]["role"] != "user":
            filtered_messages.insert(0, {"role": "user", "content": "(Begin)"})

        kwargs = {
            "model": model,
            "messages": filtered_messages,
            "max_tokens": config.get("max_tokens", 1024),
        }
        if system_content:
            kwargs["system"] = system_content
        if "temperature" in config:
            kwargs["temperature"] = config["temperature"]

        try:
            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as exc:
            logger.error("Anthropic generation error for model %s: %s", model, exc)
            raise

    async def health_check(self) -> bool:
        """
        Anthropic has no public health endpoint.
        We verify by checking that the API key is set.
        """
        if not self._api_key:
            return False
        # Attempt a minimal API call
        try:
            client = self._get_client()
            # List models is a lightweight call
            await client.models.list()
            return True
        except Exception as exc:
            logger.warning("Anthropic health check failed: %s", exc)
            return False
