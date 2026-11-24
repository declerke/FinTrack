from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_TEST_HOSTS = {"localhost", "127.0.0.1", "::1"}


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://fintrack:local-only-change-me@localhost:5432/fintrack"
    test_database_url: str | None = None
    jwt_secret_key: str = Field(
        default="local-development-only-replace-this-secret-before-hosting",
        min_length=32,
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    demo_username: str | None = None
    demo_password: str | None = None

    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


def get_settings() -> Settings:
    return Settings()


def validate_test_database_url(raw_url: str) -> URL:
    try:
        url = make_url(raw_url)
    except (TypeError, ValueError) as exc:
        raise ValueError("TEST_DATABASE_URL must be a valid local PostgreSQL URL") from exc

    if url.drivername != "postgresql+psycopg":
        raise ValueError("TEST_DATABASE_URL must use the psycopg PostgreSQL driver")
    if url.database != "fintrack_test":
        raise ValueError("TEST_DATABASE_URL must target the dedicated fintrack_test database")
    if (url.host or "").lower() not in ALLOWED_TEST_HOSTS:
        raise ValueError("TEST_DATABASE_URL must target a loopback host")
    return url
