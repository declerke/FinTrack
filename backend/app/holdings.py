from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, localcontext
from typing import Literal


class LedgerValidationError(ValueError):
    pass


class LedgerConflict(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class LedgerEntry:
    id: int
    instrument: str
    type: Literal["BUY", "SELL"]
    quantity: Decimal
    unit_price: Decimal
    trade_date: date
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Position:
    instrument: str
    net_quantity: Decimal
    average_cost: Decimal
    total_invested: Decimal
    valuation_price: Decimal
    total_value: Decimal


def _normalise_created_at(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _validate_amount(value: Decimal, label: str) -> None:
    if not isinstance(value, Decimal) or not value.is_finite() or value <= 0:
        raise LedgerValidationError(f"{label} must be a finite positive decimal")

    sign, digits, exponent = value.as_tuple()
    integer_digits = max(value.adjusted() + 1, 0)
    fractional_digits = max(-exponent, 0)
    if integer_digits > 12 or fractional_digits > 6 or len(digits) > 18:
        raise LedgerValidationError(f"{label} exceeds NUMERIC(18,6) precision")


def calculate_holdings(entries: Iterable[LedgerEntry]) -> dict[str, Position]:
    ordered_entries = sorted(
        entries,
        key=lambda item: (item.trade_date, _normalise_created_at(item.created_at), item.id),
    )
    balances: dict[str, dict[str, Decimal]] = {}

    with localcontext() as context:
        context.prec = 50
        for entry in ordered_entries:
            instrument = entry.instrument.strip().upper()
            if not instrument:
                raise LedgerValidationError("instrument is required")
            if entry.type not in ("BUY", "SELL"):
                raise LedgerValidationError("transaction type must be BUY or SELL")
            _validate_amount(entry.quantity, "quantity")
            _validate_amount(entry.unit_price, "unit_price")

            balance = balances.setdefault(
                instrument,
                {
                    "quantity": Decimal("0"),
                    "basis": Decimal("0"),
                    "valuation_price": Decimal("0"),
                },
            )
            current_quantity = balance["quantity"]
            current_basis = balance["basis"]

            if entry.type == "BUY":
                balance["quantity"] = current_quantity + entry.quantity
                balance["basis"] = current_basis + entry.quantity * entry.unit_price
            else:
                if entry.quantity > current_quantity:
                    raise LedgerConflict(f"sale exceeds available units for {instrument}")
                if entry.quantity == current_quantity:
                    balance["quantity"] = Decimal("0")
                    balance["basis"] = Decimal("0")
                else:
                    average_cost = current_basis / current_quantity
                    balance["quantity"] = current_quantity - entry.quantity
                    balance["basis"] = current_basis - average_cost * entry.quantity

            balance["valuation_price"] = entry.unit_price

        positions: dict[str, Position] = {}
        for instrument, balance in sorted(balances.items()):
            quantity = balance["quantity"]
            if quantity == 0:
                continue
            basis = balance["basis"]
            valuation_price = balance["valuation_price"]
            positions[instrument] = Position(
                instrument=instrument,
                net_quantity=quantity,
                average_cost=basis / quantity,
                total_invested=basis,
                valuation_price=valuation_price,
                total_value=quantity * valuation_price,
            )

    return positions
