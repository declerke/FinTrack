from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_analyst
from app.db import atomic_session, get_session
from app.errors import ApiError
from app.models import Analyst, Portfolio, Transaction
from app.schemas import (
    COMMON_ERROR_RESPONSES,
    CONFLICT_RESPONSE,
    PortfolioCreate,
    PortfolioResponse,
    PortfolioUpdate,
)

router = APIRouter(
    prefix="/api/portfolios", tags=["portfolios"], responses=COMMON_ERROR_RESPONSES
)


def _portfolio_response(portfolio: Portfolio) -> PortfolioResponse:
    return PortfolioResponse(
        id=portfolio.id,
        name=portfolio.name,
        client_name=portfolio.client_name,
        base_currency=portfolio.base_currency,
        created_at=portfolio.created_at,
    )


def _owned_portfolio(session: Session, portfolio_id: int, analyst_id: int) -> Portfolio:
    portfolio = session.scalar(
        select(Portfolio).where(
            Portfolio.id == portfolio_id,
            Portfolio.analyst_id == analyst_id,
        )
    )
    if portfolio is None:
        raise ApiError(404, "not_found", "Portfolio not found")
    return portfolio


@router.get("", response_model=list[PortfolioResponse])
def list_portfolios(
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> list[PortfolioResponse]:
    portfolios = session.scalars(
        select(Portfolio)
        .where(Portfolio.analyst_id == analyst.id)
        .order_by(Portfolio.created_at, Portfolio.id)
    ).all()
    return [_portfolio_response(portfolio) for portfolio in portfolios]


@router.post("", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    payload: PortfolioCreate,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> PortfolioResponse:
    with atomic_session(session):
        portfolio = Portfolio(
            analyst_id=analyst.id,
            name=payload.name,
            client_name=payload.client_name,
            base_currency=payload.base_currency,
        )
        session.add(portfolio)
        session.flush()
        return _portfolio_response(portfolio)


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> PortfolioResponse:
    return _portfolio_response(_owned_portfolio(session, portfolio_id, analyst.id))


@router.put(
    "/{portfolio_id}",
    response_model=PortfolioResponse,
    responses={409: CONFLICT_RESPONSE},
)
def update_portfolio(
    portfolio_id: int,
    payload: PortfolioUpdate,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> PortfolioResponse:
    with atomic_session(session):
        portfolio = session.scalar(
            select(Portfolio)
            .where(Portfolio.id == portfolio_id, Portfolio.analyst_id == analyst.id)
            .with_for_update()
        )
        if portfolio is None:
            raise ApiError(404, "not_found", "Portfolio not found")
        has_transactions = session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.portfolio_id == portfolio.id)
        )
        if has_transactions and payload.base_currency != portfolio.base_currency:
            raise ApiError(
                409,
                "portfolio_currency_locked",
                "Base currency cannot change after the first trade",
            )
        portfolio.name = payload.name
        portfolio.client_name = payload.client_name
        portfolio.base_currency = payload.base_currency
        session.flush()
        return _portfolio_response(portfolio)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session),
    analyst: Analyst = Depends(get_current_analyst),
) -> Response:
    with atomic_session(session):
        portfolio = session.scalar(
            select(Portfolio)
            .where(Portfolio.id == portfolio_id, Portfolio.analyst_id == analyst.id)
            .with_for_update()
        )
        if portfolio is None:
            raise ApiError(404, "not_found", "Portfolio not found")
        session.delete(portfolio)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
