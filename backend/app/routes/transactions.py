from decimal import ROUND_HALF_UP, Decimal, localcontext

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_analyst
from app.db import atomic_session, get_session
from app.errors import ApiError
from app.holdings import LedgerConflict, LedgerEntry, calculate_holdings
from app.models import Analyst, Portfolio, Transaction
from app.schemas import (
    COMMON_ERROR_RESPONSES,
    CONFLICT_RESPONSE,
    PortfolioSummary,
    PositionSummary,
    TransactionCreate,
    TransactionResponse,
)

router = APIRouter(
    tags=["transactions and summaries"], responses=COMMON_ERROR_RESPONSES
)
CENT = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def _owned_portfolio(
    session: Session, portfolio_id: int, analyst_id: int, *, lock: bool = False
) -> Portfolio:
    statement = select(Portfolio).where(
        Portfolio.id == portfolio_id,
        Portfolio.analyst_id == analyst_id,
    )
    if lock:
        statement = statement.with_for_update()
    portfolio = session.scalar(statement)
    if portfolio is None:
        raise ApiError(404, "not_found", "Portfolio not found")
    return portfolio


def _rows(session: Session, portfolio_id: int) -> list[Transaction]:
    return list(
        session.scalars(
            select(Transaction)
            .where(Transaction.portfolio_id == portfolio_id)
            .order_by(
                Transaction.trade_date,
                Transaction.created_at,
                Transaction.id,
            )
        ).all()
    )


def _entries(rows: list[Transaction]) -> list[LedgerEntry]:
    return [
        LedgerEntry(
            id=row.id,
            instrument=row.instrument,
            type=row.type,
            quantity=row.quantity,
            unit_price=row.unit_price,
            trade_date=row.trade_date,
            created_at=row.created_at,
        )
        for row in rows
    ]


def _transaction_response(row: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=row.id,
        portfolio_id=row.portfolio_id,
        instrument=row.instrument,
        type=row.type,
        quantity=f"{row.quantity:.6f}",
        unit_price=f"{row.unit_price:.6f}",
        trade_date=row.trade_date,
        created_at=row.created_at,
    )


def _fixed(value: Decimal, places: Decimal) -> str:
    return str(value.quantize(places, rounding=ROUND_HALF_UP))


def _summary(session: Session, portfolio: Portfolio) -> PortfolioSummary:
    positions = calculate_holdings(_entries(_rows(session, portfolio.id)))
    with localcontext() as context:
        context.prec = 50
        total_invested = sum(
            (position.total_invested for position in positions.values()), Decimal("0")
        )
        total_value = sum((position.total_value for position in positions.values()), Decimal("0"))
    position_rows = [
        PositionSummary(
            instrument=position.instrument,
            net_quantity=_fixed(position.net_quantity, SIX_PLACES),
            average_cost=_fixed(position.average_cost, SIX_PLACES),
            total_invested=_fixed(position.total_invested, CENT),
            valuation_price=_fixed(position.valuation_price, SIX_PLACES),
            total_value=_fixed(position.total_value, CENT),
        )
        for position in positions.values()
    ]
    return PortfolioSummary(
        portfolio_id=portfolio.id,
        base_currency=portfolio.base_currency,
        positions=position_rows,
        total_invested=_fixed(total_invested, CENT),
        total_value=_fixed(total_value, CENT),
    )


@router.get("/api/portfolios/{portfolio_id}/transactions", response_model=list[TransactionResponse])
def list_transactions(
    portfolio_id: int,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> list[TransactionResponse]:
    _owned_portfolio(session, portfolio_id, analyst.id)
    return [_transaction_response(row) for row in _rows(session, portfolio_id)]


@router.post(
    "/api/portfolios/{portfolio_id}/transactions",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: CONFLICT_RESPONSE},
)
def create_transaction(
    portfolio_id: int,
    payload: TransactionCreate,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> TransactionResponse:
    try:
        with atomic_session(session):
            portfolio = _owned_portfolio(session, portfolio_id, analyst.id, lock=True)
            transaction = Transaction(
                portfolio_id=portfolio.id,
                instrument=payload.instrument,
                type=payload.type,
                quantity=payload.quantity,
                unit_price=payload.unit_price,
                trade_date=payload.trade_date,
            )
            session.add(transaction)
            session.flush()
            calculate_holdings(_entries(_rows(session, portfolio.id)))
            session.refresh(transaction)
            response = _transaction_response(transaction)
    except LedgerConflict as exc:
        raise ApiError(409, "ledger_conflict", str(exc)) from exc
    return response


@router.delete(
    "/api/transactions/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: CONFLICT_RESPONSE},
)
def delete_transaction(
    transaction_id: int,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> Response:
    try:
        with atomic_session(session):
            transaction = session.scalar(
                select(Transaction)
                .join(Portfolio, Portfolio.id == Transaction.portfolio_id)
                .where(
                    Transaction.id == transaction_id,
                    Portfolio.analyst_id == analyst.id,
                )
            )
            if transaction is None:
                raise ApiError(404, "not_found", "Transaction not found")
            portfolio_id = transaction.portfolio_id
            _owned_portfolio(session, portfolio_id, analyst.id, lock=True)
            transaction = session.scalar(
                select(Transaction).where(
                    Transaction.id == transaction_id,
                    Transaction.portfolio_id == portfolio_id,
                )
            )
            if transaction is None:
                raise ApiError(404, "not_found", "Transaction not found")
            session.delete(transaction)
            session.flush()
            calculate_holdings(_entries(_rows(session, portfolio_id)))
    except LedgerConflict as exc:
        raise ApiError(409, "ledger_conflict", str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/portfolios/{portfolio_id}/summary", response_model=PortfolioSummary)
def get_summary(
    portfolio_id: int,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> PortfolioSummary:
    portfolio = _owned_portfolio(session, portfolio_id, analyst.id)
    return _summary(session, portfolio)
