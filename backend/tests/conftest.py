import os
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker
from starlette.testclient import TestClient


def require_test_database_url() -> str:
    raw_url = os.getenv("TEST_DATABASE_URL")
    if raw_url:
        return raw_url

    message = "requires isolated PostgreSQL TEST_DATABASE_URL"
    if os.getenv("FINTRACK_REQUIRE_TEST_DATABASE") == "1":
        pytest.fail(f"{message}; CI requires database-backed tests", pytrace=False)
    pytest.skip(message)


@pytest.fixture
def test_database_url() -> URL:
    from app.config import validate_test_database_url

    return validate_test_database_url(require_test_database_url())


@pytest.fixture
def db_engine(test_database_url: URL) -> Iterator[Any]:
    from app import models  # noqa: F401
    from app.db import Base

    schema_name = f"test_{uuid4().hex}"
    test_host = (test_database_url.host or "").casefold()
    test_host_address = "127.0.0.1" if test_host == "localhost" else test_host
    test_database_port = test_database_url.port
    if test_database_port is None:
        raise ValueError("TEST_DATABASE_URL must specify an explicit port")
    bootstrap_engine = create_engine(
        test_database_url,
        pool_pre_ping=True,
        connect_args={"hostaddr": test_host_address, "port": test_database_port},
    )
    schema_created = False
    schema_engine: Any | None = None
    try:
        with bootstrap_engine.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema_name}"')
        schema_created = True

        schema_engine = create_engine(
            test_database_url,
            pool_pre_ping=True,
            connect_args={
                "hostaddr": test_host_address,
                "options": f"-c search_path={schema_name}",
                "port": test_database_port,
            },
        )
        Base.metadata.create_all(schema_engine)
        yield schema_engine
    finally:
        try:
            if schema_engine is not None:
                schema_engine.dispose()
        finally:
            try:
                if schema_created:
                    with bootstrap_engine.begin() as connection:
                        connection.exec_driver_sql(f'DROP SCHEMA "{schema_name}" CASCADE')
            finally:
                bootstrap_engine.dispose()


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
