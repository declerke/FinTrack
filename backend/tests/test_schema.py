from sqlalchemy import Numeric

TRADE_REQUEST_EXAMPLE = {
    "instrument": "SCOM",
    "type": "BUY",
    "quantity": "12.5",
    "unit_price": "101.25",
    "trade_date": "2026-01-02",
}


def test_database_models_define_the_three_contract_tables() -> None:
    from app.db import Base
    from app.models import Analyst, Portfolio, Transaction

    assert set(Base.metadata.tables) == {"analysts", "portfolios", "transactions"}
    assert Analyst.__tablename__ == "analysts"
    assert Portfolio.__tablename__ == "portfolios"
    assert Transaction.__tablename__ == "transactions"


def test_transaction_amounts_use_numeric_eighteen_six() -> None:
    from app.models import Transaction

    assert isinstance(Transaction.__table__.c.quantity.type, Numeric)
    assert isinstance(Transaction.__table__.c.unit_price.type, Numeric)
    assert (
        Transaction.__table__.c.quantity.type.precision,
        Transaction.__table__.c.quantity.type.scale,
    ) == (18, 6)
    assert (
        Transaction.__table__.c.unit_price.type.precision,
        Transaction.__table__.c.unit_price.type.scale,
    ) == (18, 6)


def test_transaction_portfolio_foreign_key_cascades_on_delete() -> None:
    from app.models import Transaction

    foreign_key = next(iter(Transaction.__table__.c.portfolio_id.foreign_keys))
    assert foreign_key.ondelete == "CASCADE"


def test_openapi_documents_the_shared_error_envelope() -> None:
    from app.main import app

    schema = app.openapi()
    expected_responses = {
        ("/api/auth/register", "post", "409"),
        ("/api/auth/login", "post", "401"),
        ("/api/portfolios", "get", "401"),
        ("/api/portfolios/{portfolio_id}/transactions", "post", "409"),
        ("/api/portfolios/{portfolio_id}/summary", "get", "422"),
    }

    for path, method, status_code in expected_responses:
        response = schema["paths"][path][method]["responses"][status_code]
        response_schema = response["content"]["application/json"]["schema"]
        assert response_schema["$ref"] == "#/components/schemas/ErrorEnvelope"


def test_openapi_documents_trade_amounts_as_decimal_strings() -> None:
    from app.main import app

    schema = app.openapi()
    properties = schema["components"]["schemas"]["TransactionCreate"]["properties"]

    for field_name in ("quantity", "unit_price"):
        field_schema = properties[field_name]
        assert field_schema.get("type") == "string"
        assert "anyOf" not in field_schema


def test_openapi_documents_a_valid_trade_request_example() -> None:
    from app.main import app

    schema = app.openapi()
    request_examples = schema["paths"][
        "/api/portfolios/{portfolio_id}/transactions"
    ]["post"]["requestBody"]["content"]["application/json"]["examples"]

    assert request_examples["valid_trade"]["value"] == TRADE_REQUEST_EXAMPLE


def test_documented_trade_request_example_passes_schema_validation() -> None:
    from datetime import date
    from decimal import Decimal

    from app.schemas import TransactionCreate

    trade = TransactionCreate.model_validate(TRADE_REQUEST_EXAMPLE)

    assert trade.model_dump() == {
        "instrument": "SCOM",
        "type": "BUY",
        "quantity": Decimal("12.5"),
        "unit_price": Decimal("101.25"),
        "trade_date": date(2026, 1, 2),
    }
