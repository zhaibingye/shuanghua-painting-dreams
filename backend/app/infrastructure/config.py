from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SHUANGHUA_",
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )

    environment: str = Field(default="development", validation_alias="SHUANGHUA_ENV")
    host: str = "127.0.0.1"
    port: int = Field(
        default=3001,
        ge=1,
        le=65535,
        validation_alias=AliasChoices("PORT", "SHUANGHUA_PORT"),
    )
    workers: int = Field(
        default=2,
        ge=1,
        validation_alias=AliasChoices("WEB_CONCURRENCY", "SHUANGHUA_WORKERS"),
    )
    forwarded_allow_ips: str = "127.0.0.1"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    image_read_timeout_seconds: float = 600.0
    video_create_timeout_seconds: float = 120.0
    video_status_timeout_seconds: float = 60.0
    connect_timeout_seconds: float = 15.0
    pool_timeout_seconds: float = 30.0
    max_redirects: int = 3
    max_json_response_bytes: int = 256 * 1024 * 1024
    max_image_input_bytes: int = 50 * 1024 * 1024
    max_connections: int = 100
    max_keepalive_connections: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
