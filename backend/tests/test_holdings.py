from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app import holdings


def entry(
    trade_id: int,
    action: str,
    quantity: str,
    unit_price: str,
    trade_date: str,
    created_at: str,
    instrument: str = "SCOM",
) -> object:
    entry_type = getattr(holdings, "LedgerEntry", None)
    assert entry_type is not None, "LedgerEntry input type is missing"
    return entry_type(
        id=trade_id,
        instrument=instrument,
        type=action,
        quantity=Decimal(quantity),
        unit_price=Decimal(unit_price),
        trade_date=date.fromisoformat(trade_date),
        created_at=datetime.fromisoformat(created_at).replace(tzinfo=UTC),
    )


def calculate(entries: list[object]) -> dict[str, object]:
    calculator = getattr(holdings, "calculate_holdings", None)
    assert callable(calculator), "calculate_holdings is missing"
    return calculator(entries)


def ledger_conflict() -> type[Exception]:
    error_type = getattr(holdings, "LedgerConflict", None)
    assert error_type is not None, "LedgerConflict is missing"
    return error_type


def test_moving_average_sale_matches_worked_ledger() -> None:
    positions = calculate(
        [
            entry(1, "BUY", "100", "100", "2026-01-01", "2026-01-01T10:00:00"),
            entry(2, "BUY", "50", "120", "2026-01-02", "2026-01-02T10:00:00"),
            entry(3, "SELL", "40", "130", "2026-01-03", "2026-01-03T10:00:00"),
        ]
    )

    position = positions["SCOM"]
    assert position.net_quantity == Decimal("110")
    assert position.total_invested.quantize(Decimal("0.01")) == Decimal("11733.33")
    assert position.valuation_price == Decimal("130")
    assert position.total_value == Decimal("14300")


def test_empty_ledger_has_no_open_positions() -> None:
    assert calculate([]) == {}


def test_symbols_are_calculated_independently() -> None:
    positions = calculate(
        [
            entry(1, "BUY", "2", "100", "2026-01-01", "2026-01-01T10:00:00", "SCOM"),
            entry(2, "BUY", "3", "50", "2026-01-01", "2026-01-01T10:00:01", "EQTY"),
        ]
    )

    assert positions["SCOM"].total_invested == Decimal("200")
    assert positions["EQTY"].total_invested == Decimal("150")
    assert positions["EQTY"].net_quantity == Decimal("3")


def test_same_day_trades_use_creation_time_then_stable_id() -> None:
    positions = calculate(
        [
            entry(3, "SELL", "5", "130", "2026-01-01", "2026-01-01T10:00:00"),
            entry(2, "BUY", "5", "120", "2026-01-01", "2026-01-01T10:00:00"),
            entry(1, "BUY", "10", "100", "2026-01-01", "2026-01-01T10:00:00"),
        ]
    )

    position = positions["SCOM"]
    assert position.net_quantity == Decimal("10")
    assert position.total_invested.quantize(Decimal("0.01")) == Decimal("1066.67")
    assert position.valuation_price == Decimal("130")


def test_full_exit_then_reentry_starts_a_new_cost_basis() -> None:
    positions = calculate(
        [
            entry(1, "BUY", "10", "100", "2026-01-01", "2026-01-01T10:00:00"),
            entry(2, "SELL", "10", "120", "2026-01-02", "2026-01-02T10:00:00"),
            entry(3, "BUY", "2", "50", "2026-01-03", "2026-01-03T10:00:00"),
        ]
    )

    position = positions["SCOM"]
    assert position.net_quantity == Decimal("2")
    assert position.average_cost == Decimal("50")
    assert position.total_invested == Decimal("100")


def test_backdated_sale_is_checked_against_later_sales() -> None:
    with pytest.raises(ledger_conflict()):
        calculate(
            [
                entry(1, "BUY", "10", "100", "2026-01-01", "2026-01-01T10:00:00"),
                entry(2, "SELL", "10", "120", "2026-01-02", "2026-01-02T10:00:00"),
                entry(3, "SELL", "1", "90", "2026-01-01", "2026-01-03T10:00:00"),
            ]
        )


def test_oversell_is_rejected() -> None:
    with pytest.raises(ledger_conflict()):
        calculate(
            [
                entry(1, "BUY", "4", "100", "2026-01-01", "2026-01-01T10:00:00"),
                entry(2, "SELL", "5", "110", "2026-01-02", "2026-01-02T10:00:00"),
            ]
        )
