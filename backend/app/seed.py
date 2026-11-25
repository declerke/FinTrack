from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import get_settings
from app.db import SessionLocal
from app.models import Analyst, Portfolio, Transaction


def seed_demo_data(session: Session, *, username: str, password: str) -> None:
    normalized_username = username.strip().lower()
    if not normalized_username or not password:
        raise ValueError("Demo username and password are required")
    with session.begin():
        analyst = session.scalar(select(Analyst).where(Analyst.username == normalized_username))
        if analyst is None:
            analyst = Analyst(
                username=normalized_username,
                password_hash=hash_password(password),
            )
            session.add(analyst)
            session.flush()

        samples = (
            (
                "Retirement",
                "Fictional Client A",
                "KES",
                (
                    ("SCOM", "BUY", "100", "100", date(2026, 1, 5)),
                    ("SCOM", "BUY", "50", "120", date(2026, 1, 12)),
                    ("SCOM", "SELL", "40", "130", date(2026, 2, 3)),
                ),
            ),
            (
                "Global Growth",
                "Fictional Client B",
                "USD",
                (
                    ("EQTY", "BUY", "20", "25", date(2026, 1, 8)),
                    ("EQTY", "BUY", "10", "27.5", date(2026, 2, 7)),
                ),
            ),
        )
        for name, client_name, currency, trades in samples:
            portfolio = session.scalar(
                select(Portfolio).where(
                    Portfolio.analyst_id == analyst.id,
                    Portfolio.name == name,
                )
            )
            if portfolio is None:
                portfolio = Portfolio(
                    analyst_id=analyst.id,
                    name=name,
                    client_name=client_name,
                    base_currency=currency,
                )
                session.add(portfolio)
                session.flush()
            existing = session.scalar(
                select(Transaction.id).where(Transaction.portfolio_id == portfolio.id).limit(1)
            )
            if existing is None:
                session.add_all(
                    [
                        Transaction(
                            portfolio_id=portfolio.id,
                            instrument=instrument,
                            type=action,
                            quantity=quantity,
                            unit_price=price,
                            trade_date=trade_date,
                        )
                        for instrument, action, quantity, price, trade_date in trades
                    ]
                )


def main() -> None:
    settings = get_settings()
    if not settings.demo_username or not settings.demo_password:
        raise SystemExit("Set DEMO_USERNAME and DEMO_PASSWORD before running the demo seed")
    with SessionLocal() as session:
        seed_demo_data(
            session,
            username=settings.demo_username,
            password=settings.demo_password,
        )


if __name__ == "__main__":
    main()
