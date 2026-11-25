from datetime import UTC, datetime, timedelta
from decimal import Decimal

import jwt
import pytest
from conftest import create_portfolio, register_and_login
from pydantic import ValidationError

from app import config


def database_url_validator():
    validator = getattr(config, "validate_test_database_url", None)
    assert callable(validator), "test database URL guard is missing"
    return validator


def test_test_database_guard_rejects_application_and_non_postgresql_urls(monkeypatch) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://tester:secret@localhost:5432/fintrack",
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")
    validator = database_url_validator()

    with pytest.raises(ValueError):
        validator("postgresql+psycopg://tester:secret@localhost:5432/fintrack")
    with pytest.raises(ValueError):
        validator("sqlite:///fintrack_test.db")

    url = validator("postgresql+psycopg://tester:secret@localhost:5433/fintrack_test")
    assert url.database == "fintrack_test"


def test_register_login_hashes_password_and_returns_public_fields(client, session_factory) -> None:
    password = "analyst-password-123"
    registration = client.post(
        "/api/auth/register", json={"username": "NewAnalyst", "password": password}
    )

    assert registration.status_code == 201
    assert set(registration.json()) == {"id", "username"}
    assert registration.json()["username"] == "newanalyst"

    from app.models import Analyst

    with session_factory() as session:
        analyst = session.get(Analyst, registration.json()["id"])
        assert analyst is not None
        assert analyst.password_hash != password
        assert analyst.password_hash.startswith("$argon2id$")

    successful_login = client.post(
        "/api/auth/login", json={"username": "newanalyst", "password": password}
    )
    rejected_login = client.post(
        "/api/auth/login", json={"username": "newanalyst", "password": "wrong-password"}
    )
    assert successful_login.status_code == 200
    assert successful_login.json()["token_type"] == "bearer"
    assert rejected_login.status_code == 401
    assert rejected_login.json()["error"]["code"] == "invalid_credentials"


def test_login_token_uses_one_hour_hs256_lifetime(client) -> None:
    registration = client.post(
        "/api/auth/register",
        json={"username": "token-owner", "password": "analyst-password-123"},
    )
    response = client.post(
        "/api/auth/login",
        json={"username": "token-owner", "password": "analyst-password-123"},
    )
    assert registration.status_code == 201
    assert response.status_code == 200

    token = response.json()["access_token"]
    header = jwt.get_unverified_header(token)
    claims = jwt.decode(
        token,
        config.get_settings().jwt_secret_key,
        algorithms=["HS256"],
    )
    assert header["alg"] == "HS256"
    assert claims["exp"] - claims["iat"] == 3600

def test_duplicate_registration_and_protected_endpoint_errors_are_normalized(client) -> None:
    headers = register_and_login(client)
    duplicate = client.post(
        "/api/auth/register",
        json={"username": "ANALYST-ONE", "password": "another-password-123"},
    )
    missing_token = client.get("/api/portfolios")
    invalid_token = client.get("/api/portfolios", headers={"Authorization": "Bearer invalid-token"})

    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "username_taken"
    assert missing_token.status_code == invalid_token.status_code == 401
    assert missing_token.json()["error"]["code"] == "unauthorized"
    assert set(headers) == {"Authorization"}


def test_expired_token_is_rejected(client, monkeypatch: pytest.MonkeyPatch) -> None:
    register_and_login(client)
    secret = config.get_settings().jwt_secret_key
    expired_token = jwt.encode(
        {"sub": "1", "exp": datetime.now(UTC) - timedelta(seconds=1)},
        secret,
        algorithm="HS256",
    )

    response = client.get("/api/portfolios", headers={"Authorization": f"Bearer {expired_token}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_owner_can_create_read_update_and_delete_kes_and_usd_portfolios(client) -> None:
    headers = register_and_login(client)
    kes = create_portfolio(client, headers)
    usd = create_portfolio(
        client, headers, name="Global", client_name="Example Holdings", base_currency="USD"
    )

    listing = client.get("/api/portfolios", headers=headers)
    detail = client.get(f"/api/portfolios/{kes['id']}", headers=headers)
    updated = client.put(
        f"/api/portfolios/{kes['id']}",
        headers=headers,
        json={"name": "Long Term", "client_name": "Fictional Client", "base_currency": "KES"},
    )
    deleted = client.delete(f"/api/portfolios/{usd['id']}", headers=headers)

    assert listing.status_code == 200
    assert {item["base_currency"] for item in listing.json()} == {"KES", "USD"}
    assert detail.json()["created_at"]
    assert updated.status_code == 200
    assert updated.json()["name"] == "Long Term"
    assert deleted.status_code == 204
    assert client.get(f"/api/portfolios/{usd['id']}", headers=headers).status_code == 404


def test_portfolio_owner_isolation_and_unsupported_currency(client) -> None:
    owner_headers = register_and_login(client, username="owner-one")
    foreign_headers = register_and_login(client, username="owner-two")
    portfolio = create_portfolio(client, owner_headers)
    invalid_currency = client.post(
        "/api/portfolios",
        headers=foreign_headers,
        json={"name": "Unsupported", "client_name": "Example", "base_currency": "XYZ"},
    )

    assert client.get("/api/portfolios", headers=foreign_headers).json() == []
    assert (
        client.get(f"/api/portfolios/{portfolio['id']}", headers=foreign_headers).status_code == 404
    )
    assert (
        client.put(
            f"/api/portfolios/{portfolio['id']}",
            headers=foreign_headers,
            json={"name": "Wrong Owner", "client_name": "Example", "base_currency": "USD"},
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/portfolios/{portfolio['id']}", headers=foreign_headers).status_code
        == 404
    )
    assert invalid_currency.status_code == 422
    assert invalid_currency.json()["error"]["code"] == "validation_error"


def test_currency_cannot_change_after_a_trade(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    trade = client.post(
        f"/api/portfolios/{portfolio['id']}/transactions",
        headers=headers,
        json={
            "instrument": "SCOM",
            "type": "BUY",
            "quantity": "2",
            "unit_price": "100",
            "trade_date": "2026-01-01",
        },
    )

    attempted_update = client.put(
        f"/api/portfolios/{portfolio['id']}",
        headers=headers,
        json={
            "name": "Changed name",
            "client_name": "Changed client",
            "base_currency": "USD",
        },
    )
    current = client.get(f"/api/portfolios/{portfolio['id']}", headers=headers)

    assert trade.status_code == 201
    assert attempted_update.status_code == 409
    assert attempted_update.json()["error"]["code"] == "portfolio_currency_locked"
    assert current.json()["base_currency"] == "KES"
    assert current.json()["name"] == portfolio["name"]


def test_deleting_portfolio_cascades_to_its_trades(client, session_factory) -> None:
    from app.models import Transaction

    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    trade = client.post(
        f"/api/portfolios/{portfolio['id']}/transactions",
        headers=headers,
        json={
            "instrument": "SCOM",
            "type": "BUY",
            "quantity": "2",
            "unit_price": "100",
            "trade_date": "2026-01-01",
        },
    )

    deleted = client.delete(f"/api/portfolios/{portfolio['id']}", headers=headers)
    with session_factory() as session:
        remaining_trades = session.query(Transaction).count()

    assert trade.status_code == 201
    assert deleted.status_code == 204
    assert remaining_trades == 0


def test_transaction_schema_requires_decimal_strings_and_six_places() -> None:
    schema_type = getattr(
        __import__("app.schemas", fromlist=["TransactionCreate"]), "TransactionCreate", None
    )
    assert schema_type is not None, "transaction request schema is missing"
    valid_payload = {
        "instrument": "scom",
        "type": "BUY",
        "quantity": "1.250000",
        "unit_price": "100.000000",
        "trade_date": "2026-01-01",
    }

    payload = schema_type.model_validate(valid_payload)

    assert payload.instrument == "SCOM"
    assert payload.quantity == Decimal("1.25")
    with pytest.raises(ValidationError):
        schema_type.model_validate({**valid_payload, "quantity": "1.0000001"})
    with pytest.raises(ValidationError):
        schema_type.model_validate({**valid_payload, "unit_price": 100.0})


def test_password_verification_rejects_an_unrecognized_stored_hash() -> None:
    from app.auth import verify_password

    assert verify_password("analyst-password-123", "not-a-password-hash") is False
