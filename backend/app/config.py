from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path

# Load .env file BEFORE pydantic reads env vars, so .env takes priority over stale system env vars
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ[k.strip()] = v.strip()


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:%3FBooker78%21@localhost:5432/postgres"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # LLM providers
    ollama_url: str = "http://localhost:11434"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # Search providers (for agent tool: web_search)
    # Priority: Tavily > Brave > DuckDuckGo (free fallback, no key needed)
    tavily_api_key: str = ""          # https://tavily.com — best quality
    brave_search_api_key: str = ""    # https://api.search.brave.com

    # Model defaults
    default_model: str = "gemma3:latest"
    synthesis_model: str = "claude-sonnet-4-6"

    # Security
    secret_key: str = "council-dev-secret-change-in-production"
    api_key_prefix: str = "ck_"

    # Debate engine
    debate_max_rounds: int = 10
    debate_context_messages: int = 20   # messages loaded per agent prompt
    debate_parallel_timeout: int = 120  # seconds per round

    # Rate limiting
    rate_limit_per_minute: int = 60

    # App
    app_version: str = "1.0.0"
    environment: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
