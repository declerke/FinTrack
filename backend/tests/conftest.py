import os
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker
from starlette.testclient import TestClient


@pytest.fixture
def test_database_url() -> URL:
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("requires isolated PostgreSQL TEST_DATABASE_URL")

    from app.config import validate_test_database_url

    return validate_test_database_url(raw_url)


@pytest.fixture
def db_engine(test_database_url: URL) -> Iterator[Any]:
    from app import models  # noqa: F401
    from app.db import Base

    engine = create_engine(test_database_url, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def session_factory(db_engine: Any) -> sessionmaker[Session]:
    return sessionmaker(bind=db_engine, expire_on_commit=False)


@pytest.fixture
def client(
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    monkeypatch.setenv("JWT_SECRET_KEY", "fintrack-test-key-that-is-long-enough-for-hs256")
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:5173"]')

    from app.db import get_session
    from app.main import create_app

    app = create_app()

    def override_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def register_and_login(
    client: TestClient,
    username: str = "analyst-one",
    password: str = "analyst-password-123",
) -> dict[str, str]:
    registration = client.post(
        "/api/auth/register", json={"username": username, "password": password}
    )
    assert registration.status_code == 201
    login = client.post("/api/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def create_portfolio(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str = "Retirement",
    client_name: str = "Fictional Client",
    base_currency: str = "KES",
) -> dict[str, Any]:
    response = client.post(
        "/api/portfolios",
        headers=headers,
        json={"name": name, "client_name": client_name, "base_currency": base_currency},
    )
    assert response.status_code == 201
    return response.json()
