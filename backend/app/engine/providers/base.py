"""
Abstract base class for all LLM providers.
All providers must implement generate() as an async generator (supports streaming)
and health_check() to verify connectivity.
"""
from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseProvider(ABC):

    @abstractmethod
    async def generate(
        self,
        messages: list[dict],
        model: str,
        config: dict,
    ) -> AsyncGenerator[str, None]:
        """
        Stream completion tokens.

        Yields individual text chunks as they arrive from the provider.
        Callers can collect all chunks or forward them directly to SSE/WebSocket.

        Args:
            messages: OpenAI-style message list [{role, content}, ...]
            model: model identifier (provider-specific)
            config: extra kwargs passed through to provider (temperature, max_tokens, etc.)
        """
        # Must be an async generator — subclasses use `yield`
        raise NotImplementedError
        yield  # make this a generator function for type-checkers

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the provider is reachable and operational."""
        raise NotImplementedError

    async def generate_full(
        self,
        messages: list[dict],
        model: str,
        config: dict,
    ) -> str:
        """
        Convenience wrapper — collects all streamed chunks into a single string.
        Use this when you don't need streaming.
        """
        chunks: list[str] = []
        async for chunk in self.generate(messages, model, config):
            chunks.append(chunk)
        return "".join(chunks)
