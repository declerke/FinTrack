import pytest
from pydantic import ValidationError
from sqlalchemy.engine import URL

from app.config import Settings


def test_test_database_fixture_uses_password_safe_url(test_database_url) -> None:
    assert isinstance(test_database_url, URL)
    assert "***" in repr(test_database_url)


def test_jwt_signing_secret_is_required(monkeypatch) -> None:
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_jwt_signing_secret_rejects_values_shorter_than_32_characters(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET_KEY", "a" * 31)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

def test_jwt_signing_secret_rejects_known_development_placeholder(monkeypatch) -> None:
    monkeypatch.setenv(
        "JWT_SECRET_KEY",
        "local-development-only-replace-this-secret-before-hosting",
    )
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
