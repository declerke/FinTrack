# 📊 FinTrack: Ledger-Based Portfolio Tracker

**FinTrack by Finnet Technologies** is an original portfolio ledger for investment analysts. It records fictional trades and derives open positions, moving weighted-average cost, and estimated value from the transaction history. It does not provide investment advice or live market prices.

---

## 🎯 Project Goal

Give an analyst a verifiable workflow from sign-in through portfolio setup, trade entry, and a holdings summary. Each portfolio is owned by one analyst and uses one base currency. The browser displays totals returned by the API; it does not calculate holdings.

---

## 🧬 System Architecture

1. **React and Vite SPA** provides registration, sign-in, portfolio management, trade entry, holdings, and transaction history.
2. **FastAPI JSON API** validates requests, authenticates analysts with one-hour HS256 bearer tokens, and scopes every business query to the signed-in owner.
3. **PostgreSQL** stores analysts, portfolios, and an ordered trade ledger. SQLAlchemy and Alembic manage persistence and schema changes.
4. **Decimal ledger service** replays trades by trade date, creation time, and stable ID, then returns decimal-string holdings and portfolio totals.

---

## 🛠️ Technical Stack

| Layer | Tool | Purpose |
|:--|:--|:--|
| Frontend | React 19, TypeScript 5.9, Vite 8 | Responsive analyst workspace |
| Routing and requests | React Router 7, browser `fetch` | Deep links and API calls |
| Backend | Python 3.12, FastAPI, Pydantic 2 | API, input validation, and OpenAPI |
| Persistence | PostgreSQL 16, SQLAlchemy 2, Alembic | Owner-scoped records, migrations, and row locking |
| Authentication | PyJWT HS256, pwdlib Argon2id | Expiring tokens and password hashing |
| Verification | pytest, HTTPX, Ruff, Vitest, React Testing Library, ESLint | API, ledger, UI, lint, and build checks |

---

## 📊 Results and Verification

- Backend: 36 tests passed against the isolated local `fintrack_test` database.
- Frontend: 12 tests passed across 5 files; ESLint and the production TypeScript/Vite build passed.
- `docs/openapi.json` matches the current FastAPI schema.
- Local browser review covered portfolio CRUD, trade entry, oversell recovery with retained form values, exact large-decimal display, sorting, filtering, and 375-pixel layout.
- The clean-checkout setup time has not been measured. The under-ten-minute assessment target remains unverified.
- No load or performance benchmark has been run.

---

## 📂 Project Structure

```text
backend/                  FastAPI API, SQLAlchemy models, Alembic migration, tests
docs/openapi.json         Exported API schema
docs/screenshots/         Browser-captured desktop and mobile evidence
frontend/                 React, TypeScript, Vite app and tests
compose.yaml              Local PostgreSQL and isolated test database services
.env.example              Placeholder-only local configuration
```

---

## ⚙️ Installation and Setup

### Prerequisites

- Python 3.12 and `uv`
- Node.js 22.23.5, recorded in `frontend/.nvmrc`
- Docker Desktop with Docker Compose for local PostgreSQL 16

From the repository root, create a private environment file and replace the local placeholders with private values. Set `JWT_SECRET_KEY` to an unpredictable value of at least 32 characters and set a private `DEMO_PASSWORD`. Do not commit `.env`. The app has no built-in signing key and refuses to start when `JWT_SECRET_KEY` is missing or too short.

```powershell
Copy-Item .env.example .env
# Edit .env before starting services.
docker compose up -d db test-db
```

Start the API in one terminal:

```powershell
Set-Location backend
uv sync --locked
uv run --locked alembic upgrade head
uv run --locked python -m app.seed
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the web app in a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Swagger UI is available at `http://localhost:8000/docs`; the OpenAPI JSON is at `http://localhost:8000/openapi.json`. The fictional local demo login is the `DEMO_USERNAME` and `DEMO_PASSWORD` configured in `.env`.

Stop the databases with `docker compose down`. The named local database volume remains on disk for the next run.

---

## 🧾 API Routes

| Method | Route | Purpose |
|:--|:--|:--|
| POST | `/api/auth/register` | Create an analyst account |
| POST | `/api/auth/login` | Return a one-hour HS256 bearer token |
| GET, POST | `/api/portfolios` | List or create the signed-in analyst's portfolios |
| GET, PUT, DELETE | `/api/portfolios/{id}` | Read, update, or delete an owned portfolio |
| GET, POST | `/api/portfolios/{id}/transactions` | Read or record trades in an owned portfolio |
| DELETE | `/api/transactions/{id}` | Delete an owned trade and recalculate the ledger |
| GET | `/api/portfolios/{id}/summary` | Return server-calculated totals, positions, and allocation data |

API errors use `{"error":{"code":"...","message":"..."}}`. Validation failures return 422, ledger conflicts return 409, and missing or foreign-owned resources return 404. The browser keeps its bearer token in memory, so refreshing requires signing in again. The login flow returns to a protected detail URL requested before sign-in.

The committed schema snapshot is `docs/openapi.json`. From `backend/`, check it with:

```powershell
uv run --locked python export_openapi.py --check
```

---

## 🧮 Accounting Assumptions and Trade-offs

- Unit and monetary inputs are positive finite decimal values stored as `NUMERIC(18,6)` and serialized as decimal strings.
- BUY trades update moving weighted-average cost. SELL trades reduce open units and cost basis at that average cost. An oversell or backdated edit that invalidates a later sale returns a conflict and rolls back.
- Estimated value uses each instrument's latest recorded trade price multiplied by open units. It is not a live market valuation.
- A portfolio has one base currency, KES or USD. FX conversion, fees, taxes, realized gains, and market-data feeds are outside this assessment scope.
- A successful sign-in lasts one hour in memory. Refreshing the page requires another sign-in; refresh-token infrastructure and extra analyst roles are omitted.

---

## ✅ Checks

Backend checks use the separate PostgreSQL test service on port 5433. The test fixture clears that database, so do not point `TEST_DATABASE_URL` at data you need. Run these commands after configuring `.env` as above:

```powershell
Set-Location backend
uv run --locked ruff check .
$env:TEST_DATABASE_URL = "postgresql+psycopg://fintrack:change-me-locally@localhost:5433/fintrack_test"
uv run --locked pytest
Remove-Item Env:TEST_DATABASE_URL
```

The example test connection matches `.env.example`; update it if you change the local PostgreSQL user or password. Frontend checks run from `frontend/`:

```powershell
npm run lint
npm test -- --run
npm run build
```

---

## 🖼️ Screenshots

Desktop portfolio list:

![FinTrack portfolio list on desktop](docs/screenshots/desktop-portfolios.png)

Desktop portfolio ledger:

![FinTrack portfolio detail on desktop](docs/screenshots/desktop-portfolio-detail.png)

375-pixel mobile portfolio ledger:

![FinTrack portfolio detail at 375 pixels](docs/screenshots/mobile-portfolio-detail-375.png)

---

## 🚀 Deployment Status and Next Steps

This is a local review candidate. No public frontend, API, or hosted database has been deployed, and no evaluator-facing URLs are available. A hosting provider with persistent PostgreSQL and at least 14 days of verified retention has not been selected.

Before submission, select and verify the host and retention window, provision PostgreSQL, configure private API variables (`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, and the fictional demo account), run the Alembic migration and seed, then set the frontend's public `VITE_API_BASE_URL`. Smoke-test Swagger access, authenticated business routes, exact-origin CORS, sign-in, a disposable trade, reload, and persistence from a clean browser. Record the final frontend/API/Swagger URLs, service owner, retention end time, and clean-checkout setup duration after measurement.

---

## 🎓 Skills Demonstrated

- API design, request validation, bearer authentication, and owner-scoped authorization.
- PostgreSQL schema migrations, idempotent sample data, Decimal accounting, rollback, and concurrent ledger writes.
- Responsive React interface with keyboard access, request feedback, accessible tables, and client-side sorting/filtering.
- Backend and frontend regression testing, linting, OpenAPI export, and reproducible local setup.

---

## 🤖 AI Assistance

OpenAI Codex assisted with planning, implementation, and verification. Ian owns the assessment decisions, independent review, and final submission.
