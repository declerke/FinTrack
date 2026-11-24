from concurrent.futures import ThreadPoolExecutor

from conftest import create_portfolio, register_and_login


def post_trade(client, headers, portfolio_id, *, action, quantity, price, trade_date):
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions",
        headers=headers,
        json={
            "instrument": "SCOM",
            "type": action,
            "quantity": quantity,
            "unit_price": price,
            "trade_date": trade_date,
        },
    )


def test_worked_ledger_is_returned_as_decimal_strings(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)

    for action, quantity, price, day in (
        ("BUY", "100", "100", "2026-01-01"),
        ("BUY", "50", "120", "2026-01-02"),
        ("SELL", "40", "130", "2026-01-03"),
    ):
        response = post_trade(
            client,
            headers,
            portfolio["id"],
            action=action,
            quantity=quantity,
            price=price,
            trade_date=day,
        )
        assert response.status_code == 201

    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)
    position = summary.json()["positions"][0]

    assert summary.status_code == 200
    assert position["instrument"] == "SCOM"
    assert position["net_quantity"] == "110.000000"
    assert position["average_cost"] == "106.666667"
    assert position["total_invested"] == "11733.33"
    assert position["valuation_price"] == "130.000000"
    assert position["total_value"] == "14300.00"
    assert summary.json()["total_invested"] == "11733.33"
    assert summary.json()["total_value"] == "14300.00"


def test_invalid_trade_and_oversell_leave_history_unchanged(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    created = post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="4",
        price="100",
        trade_date="2026-01-01",
    )
    invalid = post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="0",
        price="100",
        trade_date="2026-01-02",
    )
    oversell = post_trade(
        client,
        headers,
        portfolio["id"],
        action="SELL",
        quantity="5",
        price="110",
        trade_date="2026-01-02",
    )
    history = client.get(f"/api/portfolios/{portfolio['id']}/transactions", headers=headers)
    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)

    assert created.status_code == 201
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"
    assert oversell.status_code == 409
    assert oversell.json()["error"]["code"] == "ledger_conflict"
    assert len(history.json()) == 1
    assert summary.json()["positions"][0]["net_quantity"] == "4.000000"


def test_backdated_trade_and_invalidating_delete_roll_back(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    first_buy = post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="10",
        price="100",
        trade_date="2026-01-01",
    )
    post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="5",
        price="120",
        trade_date="2026-01-02",
    )
    post_trade(
        client,
        headers,
        portfolio["id"],
        action="SELL",
        quantity="10",
        price="130",
        trade_date="2026-01-03",
    )
    # This date precedes the first buy; replaying the complete history must reject it.
    backdated = post_trade(
        client,
        headers,
        portfolio["id"],
        action="SELL",
        quantity="1",
        price="90",
        trade_date="2025-12-31",
    )
    deleted = client.delete(f"/api/transactions/{first_buy.json()['id']}", headers=headers)
    history = client.get(f"/api/portfolios/{portfolio['id']}/transactions", headers=headers)

    assert backdated.status_code == 409
    assert deleted.status_code == 409
    assert len(history.json()) == 3


def test_foreign_trade_and_summary_are_hidden(client) -> None:
    owner_headers = register_and_login(client, username="trade-owner")
    other_headers = register_and_login(client, username="trade-other")
    portfolio = create_portfolio(client, owner_headers)
    trade = post_trade(
        client,
        owner_headers,
        portfolio["id"],
        action="BUY",
        quantity="2",
        price="100",
        trade_date="2026-01-01",
    )

    assert (
        client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=other_headers).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/portfolios/{portfolio['id']}/transactions", headers=other_headers
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/transactions/{trade.json()['id']}", headers=other_headers).status_code
        == 404
    )


def test_trade_delete_returns_empty_204_and_empty_summary(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    trade = post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="2",
        price="100",
        trade_date="2026-01-01",
    )

    deleted = client.delete(f"/api/transactions/{trade.json()['id']}", headers=headers)
    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert summary.json()["positions"] == []
    assert summary.json()["total_invested"] == "0.00"


def test_concurrent_sells_allow_only_one_affordable_write(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="10",
        price="100",
        trade_date="2026-01-01",
    )

    def sell():
        return post_trade(
            client,
            headers,
            portfolio["id"],
            action="SELL",
            quantity="6",
            price="110",
            trade_date="2026-01-02",
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = sorted(executor.map(lambda _: sell(), range(2)))

    history = client.get(f"/api/portfolios/{portfolio['id']}/transactions", headers=headers)
    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)

    assert statuses == [201, 409]
    assert len(history.json()) == 2
    assert summary.json()["positions"][0]["net_quantity"] == "4.000000"
    assert summary.json()["total_invested"] == "400.00"


def test_summary_serializes_totals_beyond_default_decimal_precision(
    client, session_factory
) -> None:
    from datetime import date
    from decimal import Decimal

    from app.models import Transaction

    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    quantity_and_price = Decimal("999999999999.999999")
    with session_factory() as session:
        session.add_all(
            Transaction(
                portfolio_id=portfolio["id"],
                instrument=f"SYM{position_number:04d}",
                type="BUY",
                quantity=quantity_and_price,
                unit_price=quantity_and_price,
                trade_date=date(2026, 1, 1),
            )
            for position_number in range(1000)
        )
        session.commit()

    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)

    assert summary.status_code == 200
    assert summary.json()["total_value"] == "999999999999999998000000000.00"
    assert len(summary.json()["positions"]) == 1000


def test_fixed_serializes_values_beyond_default_decimal_precision() -> None:
    from decimal import Decimal

    from app.routes.transactions import CENT, _fixed

    large_total = Decimal("999999999999999998000000000.000000001")
    assert _fixed(large_total, CENT) == "999999999999999998000000000.00"


def test_summary_rounds_half_cent_values_up(client) -> None:
    headers = register_and_login(client)
    portfolio = create_portfolio(client, headers)
    trade = post_trade(
        client,
        headers,
        portfolio["id"],
        action="BUY",
        quantity="1",
        price="1.005",
        trade_date="2026-01-01",
    )
    summary = client.get(f"/api/portfolios/{portfolio['id']}/summary", headers=headers)

    assert trade.status_code == 201
    assert summary.json()["total_invested"] == "1.01"
    assert summary.json()["total_value"] == "1.01"
