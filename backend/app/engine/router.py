"""
ModelRouter — resolves model name → provider and dispatches generation.

Routing rules:
- claude-*          → Anthropic
- gpt-*             → OpenAI
- nvidia-* / nim-*  → NVIDIA NIM (OpenAI-compatible)
- everything else   → Ollama (local)

Fallback chain: requested model → settings.default_model via Ollama → error
"""
import logging
from typing import AsyncGenerator

from app.config import settings
from app.engine.providers.anthropic import AnthropicProvider
from app.engine.providers.ollama import OllamaProvider
from app.engine.providers.openai_provider import OpenAIProvider

logger = logging.getLogger(__name__)

# Singletons — one client per provider
_ollama = OllamaProvider()
_anthropic = AnthropicProvider()
_openai = OpenAIProvider()
_nvidia = OpenAIProvider(
    api_key=settings.nvidia_api_key,
    base_url=settings.nvidia_base_url,
    provider_name="nvidia-nim",
)


def resolve_provider(model: str) -> str:
    """
    Return a string tag identifying the provider for the given model name.
    """
    m = model.lower()
    if m.startswith("claude-"):
        return "anthropic"
    if m.startswith("gpt-"):
        return "openai"
    if m.startswith("nvidia-") or m.startswith("nim-") or m.startswith("meta/") or m.startswith("mistralai/"):
        return "nvidia"
    return "ollama"


class ModelRouter:

    async def generate(
        self,
        messages: list[dict],
        model: str,
        config: dict | None = None,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """
        Route generation to the correct provider.

        Falls back to Ollama default model if the preferred model fails.
        Always an async generator — callers iterate over tokens.
        """
        if config is None:
            config = {}

        provider_tag = resolve_provider(model)

        async def _try_generate(mdl: str, tag: str) -> AsyncGenerator[str, None]:
            if tag == "anthropic":
                async for chunk in _anthropic.generate(messages, mdl, config):
                    yield chunk
            elif tag == "openai":
                async for chunk in _openai.generate(messages, mdl, config):
                    yield chunk
            elif tag == "nvidia":
                async for chunk in _nvidia.generate(messages, mdl, config):
                    yield chunk
            else:
                async for chunk in _ollama.generate(messages, mdl, config):
                    yield chunk

        try:
            async for chunk in _try_generate(model, provider_tag):
                yield chunk
        except Exception as primary_exc:
            logger.warning(
                "Primary model %s (%s) failed: %s — falling back to %s",
                model, provider_tag, primary_exc, settings.default_model,
            )
            fallback = settings.default_model
            if fallback == model:
                raise  # prevent infinite loop if default already failed
            try:
                async for chunk in _ollama.generate(messages, fallback, config):
                    yield chunk
            except Exception as fallback_exc:
                logger.error("Fallback model %s also failed: %s", fallback, fallback_exc)
                raise RuntimeError(
                    f"All models failed. Primary: {primary_exc}. Fallback: {fallback_exc}"
                ) from fallback_exc

    async def health_check_all(self) -> dict[str, bool]:
        """Return health status for every provider."""
        return {
            "ollama": await _ollama.health_check(),
            "anthropic": await _anthropic.health_check(),
            "openai": await _openai.health_check(),
            "nvidia": bool(settings.nvidia_api_key),  # NIM: just key presence check
        }


    async def generate_full_text(
        self,
        messages: list[dict],
        model: str,
        config: dict | None = None,
    ) -> str:
        """Convenience wrapper — collects all streamed chunks into a single string."""
        chunks: list[str] = []
        async for chunk in self.generate(messages=messages, model=model, config=config):
            chunks.append(chunk)
        return "".join(chunks)


# Module-level singleton
model_router = ModelRouter()
