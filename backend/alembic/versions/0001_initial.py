"""Initial analyst, portfolio, and transaction schema."""

import sqlalchemy as sa

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("username", name="uq_analysts_username"),
    )
    op.create_table(
        "portfolios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("analyst_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("client_name", sa.String(length=100), nullable=False),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("base_currency IN ('KES', 'USD')", name="ck_portfolios_currency"),
        sa.ForeignKeyConstraint(["analyst_id"], ["analysts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_portfolios_analyst_id", "portfolios", ["analyst_id"])
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("instrument", sa.String(length=16), nullable=False),
        sa.Column("type", sa.String(length=4), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("type IN ('BUY', 'SELL')", name="ck_transactions_type"),
        sa.CheckConstraint("quantity > 0", name="ck_transactions_quantity_positive"),
        sa.CheckConstraint("unit_price > 0", name="ck_transactions_price_positive"),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_transactions_portfolio_ledger_order",
        "transactions",
        ["portfolio_id", "trade_date", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_portfolio_ledger_order", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_portfolios_analyst_id", table_name="portfolios")
    op.drop_table("portfolios")
    op.drop_table("analysts")
