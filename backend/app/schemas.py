from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorContent(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorContent


COMMON_ERROR_RESPONSES = {
    401: {"model": ErrorEnvelope, "description": "Authentication is required or invalid."},
    404: {"model": ErrorEnvelope, "description": "The requested resource was not found."},
    422: {"model": ErrorEnvelope, "description": "Request validation failed."},
}
CONFLICT_RESPONSE = {
    "model": ErrorEnvelope,
    "description": "The requested change conflicts with the existing ledger state.",
}


BaseCurrency = Literal["KES", "USD"]
TradeType = Literal["BUY", "SELL"]


def _decimal_string(value: object) -> Decimal:
    if not isinstance(value, str):
        raise ValueError("must be provided as a decimal string")
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("must be a valid decimal string") from exc


PositiveAmount = Annotated[
    Decimal,
    BeforeValidator(_decimal_string),
    Field(gt=0, max_digits=18, decimal_places=6),
]
Username = Annotated[str, StringConstraints(min_length=3, max_length=64, pattern=r"^[a-z0-9_.-]+$")]
PortfolioName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
ClientName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Instrument = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=16, pattern=r"^[A-Za-z0-9][A-Za-z0-9.-]*$"
    ),
]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(RequestModel):
    username: Username
    password: Annotated[str, StringConstraints(min_length=10, max_length=128)]

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class AnalystPublic(BaseModel):
    id: int
    username: str


class AccessToken(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class PortfolioInput(RequestModel):
    name: PortfolioName
    client_name: ClientName
    base_currency: BaseCurrency


class PortfolioCreate(PortfolioInput):
    pass


class PortfolioUpdate(PortfolioInput):
    pass


class PortfolioResponse(BaseModel):
    id: int
    name: str
    client_name: str
    base_currency: BaseCurrency
    created_at: datetime


class TransactionCreate(RequestModel):
    instrument: Instrument
    type: TradeType
    quantity: PositiveAmount
    unit_price: PositiveAmount
    trade_date: date

    @field_validator("instrument")
    @classmethod
    def normalize_instrument(cls, value: str) -> str:
        return value.strip().upper()


class TransactionResponse(BaseModel):
    id: int
    portfolio_id: int
    instrument: str
    type: TradeType
    quantity: str
    unit_price: str
    trade_date: date
    created_at: datetime


class PositionSummary(BaseModel):
    instrument: str
    net_quantity: str
    average_cost: str
    total_invested: str
    valuation_price: str
    total_value: str


class PortfolioSummary(BaseModel):
    portfolio_id: int
    base_currency: BaseCurrency
    positions: list[PositionSummary]
    total_invested: str
    total_value: str
