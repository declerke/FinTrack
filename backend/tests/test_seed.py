def test_seed_is_idempotent_and_creates_a_worked_demo_ledger(client, session_factory) -> None:
    from sqlalchemy import select

    from app.holdings import LedgerEntry, calculate_holdings
    from app.models import Analyst, Portfolio, Transaction
    from app.seed import seed_demo_data

    for _ in range(2):
        with session_factory() as session:
            seed_demo_data(session, username="demo-analyst", password="demo-password-123")

    with session_factory() as session:
        analyst = session.scalar(select(Analyst).where(Analyst.username == "demo-analyst"))
        assert analyst is not None
        portfolios = list(
            session.scalars(select(Portfolio).where(Portfolio.analyst_id == analyst.id))
        )
        trades = list(
            session.scalars(
                select(Transaction).join(Portfolio).where(Portfolio.analyst_id == analyst.id)
            )
        )

    assert len(portfolios) == 2
    assert len(trades) == 5
    assert len({trade.id for trade in trades}) == 5
    scom_ledger = [
        LedgerEntry(
            id=trade.id,
            instrument=trade.instrument,
            type=trade.type,
            quantity=trade.quantity,
            unit_price=trade.unit_price,
            trade_date=trade.trade_date,
            created_at=trade.created_at,
        )
        for trade in trades
        if trade.instrument == "SCOM"
    ]
    position = calculate_holdings(scom_ledger)["SCOM"]
    assert position.net_quantity == 110
    assert position.total_invested.quantize(__import__("decimal").Decimal("0.01")) == __import__(
        "decimal"
    ).Decimal("11733.33")
