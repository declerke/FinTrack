import os
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_TEST_HOSTS = {"localhost", "127.0.0.1", "::1"}
RESERVED_PREVIEW_DATABASE_PORT = 55432
TEST_DATABASE_NAME = "fintrack_test"
DESTINATION_QUERY_PARAMETERS = {
    "database",
    "dbname",
    "host",
    "hostaddr",
    "load_balance_hosts",
    "port",
    "service",
    "servicefile",
    "target_session_attrs",
}


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://fintrack:local-only-change-me@localhost:5432/fintrack"
    test_database_url: str | None = None
    jwt_secret_key: str = Field(min_length=32)
    cors_origins: list[str] = ["http://localhost:5173"]
    demo_username: str | None = None
    demo_password: str | None = None

    @field_validator("jwt_secret_key")
    @classmethod
    def reject_known_signing_key_placeholders(cls, value: str) -> str:
        if value.casefold().startswith(("local-development-only-", "replace-with-")):
            raise ValueError("JWT_SECRET_KEY must be a private random value")
        return value

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
    if url.port is None:
        raise ValueError("TEST_DATABASE_URL must specify an explicit port")
    if url.query:
        raise ValueError("TEST_DATABASE_URL must not include query parameters")
    if url.database != TEST_DATABASE_NAME:
        raise ValueError("TEST_DATABASE_URL must target the dedicated fintrack_test database")
    if (url.host or "").lower() not in ALLOWED_TEST_HOSTS:
        raise ValueError("TEST_DATABASE_URL must target a loopback host")
    if url.port == RESERVED_PREVIEW_DATABASE_PORT:
        raise ValueError("TEST_DATABASE_URL must not use reserved preview port 55432")

    try:
        application_url = make_url(get_settings().database_url)
    except (TypeError, ValueError) as exc:
        raise ValueError("DATABASE_URL must be a valid application database URL") from exc

    if not application_url.host or not application_url.database:
        raise ValueError("DATABASE_URL must specify its host and database")
    if application_url.database.casefold() == TEST_DATABASE_NAME:
        raise ValueError("The fintrack_test catalog is reserved for tests")
    if os.getenv("PGSERVICE") or os.getenv("PGSERVICEFILE"):
        raise ValueError("PGSERVICE routing is not allowed during test database validation")

    destination_overrides = DESTINATION_QUERY_PARAMETERS.intersection(
        key.casefold() for key in application_url.query
    )
    if destination_overrides or "," in (application_url.host or ""):
        raise ValueError("DATABASE_URL contains options that can override its destination")
    return url
