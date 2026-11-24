# FinTrack

FinTrack is a portfolio ledger for investment analysts. It records trades and derives open positions, weighted-average cost basis, and estimated value from the transaction history. All demo data is fictional. It does not provide investment advice or live market prices.

> **Candidate status:** source candidate for independent review. No hosted app/API is available yet.

## What it does

- Register and sign in to a personal analyst account.
- Create, edit, and delete KES or USD portfolios, with server-side ownership checks.
- Record BUY and SELL trades with decimal-safe validation and rollback on ledger conflicts.
- View server-calculated holdings, allocation bars, and a transaction table with symbol/type filters and sorting.
- Review pending, success, empty, and error states; destructive changes require confirmation.

## Architecture

    Analyst --> React and Vite SPA --> FastAPI JSON API --> PostgreSQL
                                           |
                                           +--> Decimal ledger replay --> holdings summary

The browser calls the FastAPI API. PostgreSQL stores analysts, portfolios, and ordered transactions. One backend service replays the ledger and returns holdings and totals; the browser does not calculate financial totals.

## Ledger rules

- Monetary and unit values use positive finite decimal inputs, stored as NUMERIC(18,6) and serialized as decimal strings.
- Trades are replayed by trade date, creation time, then ID.
- BUY trades update moving weighted-average cost. SELL trades reduce open units and basis at that average cost. A sale that exceeds available units, including after a backdated change, returns a conflict and rolls back.
- Estimated value uses each instrument's latest recorded trade price multiplied by open units.
- The ledger excludes FX conversion, fees, taxes, realized gains, and market-data feeds. Prices are estimates from recorded trades.

## Local setup (Windows PowerShell)

### Prerequisites

- Python 3.12 and uv
- Node.js 22.23.5, recorded in frontend/.nvmrc
- Docker Desktop with Docker Compose for the local PostgreSQL 16 databases

From the repository root, create a private environment file and replace the local placeholders with private values. Use an unpredictable JWT_SECRET_KEY and DEMO_PASSWORD; do not commit .env.

    Copy-Item .env.example .env
    # Edit .env before starting services.
    docker compose up -d db test-db

Start the API in one terminal:

    Set-Location backend
    uv sync --locked
    uv run --locked alembic upgrade head
    uv run --locked python -m app.seed
    uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000

Start the web app in a second terminal:

    Set-Location frontend
    npm ci
    npm run dev

Open http://localhost:5173. The API serves Swagger UI at http://localhost:8000/docs and OpenAPI JSON at http://localhost:8000/openapi.json. The fictional local demo login is the DEMO_USERNAME and DEMO_PASSWORD you set in .env.

Stop the databases with docker compose down. The named local database volume remains on disk so the next run can reuse it.

## API routes

| Method | Route | Purpose |
|:--|:--|:--|
| POST | /api/auth/register | Create an analyst account |
| POST | /api/auth/login | Return a one-hour HS256 bearer token |
| GET, POST | /api/portfolios | List or create the signed-in analyst's portfolios |
| GET, PUT, DELETE | /api/portfolios/{id} | Read, update, or delete an owned portfolio |
| GET, POST | /api/portfolios/{id}/transactions | Read or record trades in an owned portfolio |
| DELETE | /api/transactions/{id} | Delete an owned trade and recalculate the ledger |
| GET | /api/portfolios/{id}/summary | Return server-calculated totals, positions, and allocation data |

API errors use the shared shape {"error":{"code":"...","message":"..."}}. Validation failures return 422, ledger conflicts return 409, and missing or foreign-owned resources return 404. The browser keeps its bearer token in memory, so refreshing the page requires signing in again. The login flow returns to a protected detail URL requested before sign-in.

## Checks

Backend checks use the separate PostgreSQL test service on port 5433. The test database is cleared by the test fixture, so do not point TEST_DATABASE_URL at a database containing data you need.

    Set-Location backend
    uv run --locked ruff check .
    $env:TEST_DATABASE_URL = "postgresql+psycopg://fintrack:change-me-locally@localhost:5433/fintrack_test"
    uv run --locked pytest
    Remove-Item Env:TEST_DATABASE_URL

The connection string above matches the placeholder in .env.example; if you change the local PostgreSQL password, update it here too. Frontend checks run from frontend:

    npm run lint
    npm test -- --run
    npm run build

The committed schema snapshot is backend/docs/openapi.json. Check that it matches the current API with:

    Set-Location backend
    uv run --locked python export_openapi.py --check

## Screenshots

Desktop portfolio list:

![FinTrack portfolio list on desktop](docs/screenshots/desktop-portfolios.png)

Desktop portfolio ledger:

![FinTrack portfolio detail on desktop](docs/screenshots/desktop-portfolio-detail.png)

375-pixel mobile portfolio ledger:

![FinTrack portfolio detail at 375 pixels](docs/screenshots/mobile-portfolio-detail-375.png)

## Project layout

    backend/                  FastAPI API, SQLAlchemy models, migration, tests
    backend/docs/openapi.json  Exported API schema
    frontend/                 React, TypeScript, Vite app and tests
    docs/screenshots/          Browser-captured desktop and mobile evidence
    compose.yaml               Local PostgreSQL and isolated test databases
    .env.example               Placeholder-only local configuration

## AI assistance

OpenAI Codex assisted with planning, implementation, and verification. Ian owns the assessment decisions, independent review, and final submission.
