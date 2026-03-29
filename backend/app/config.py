from pydantic_settings import BaseSettings
from functools import lru_cache


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
