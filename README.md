# 📊 FinTrack: Ledger-Based Portfolio Tracker

**FinTrack by Finnet Technologies** is a portfolio tracker for investment analysts. Record buys and sells in KES or USD and see how each trade changes open holdings, remaining cost and estimated portfolio value.

[Open the live demo](https://fintrack-portfolio-ledger.vercel.app) · [Explore the API in Swagger](https://fintrack-api-bs43.onrender.com/docs) · [Download the OpenAPI schema](https://fintrack-api-bs43.onrender.com/openapi.json)

**Release status:** These public URLs refer to a separately deployed release. The [QA branch](https://github.com/declerke/FinTrack/tree/qa/fintrack-release-verification) contains post-deadline review changes, including dark mode and additional request-state regressions. Those changes have not been deployed and are not part of the version submitted for Finnet's assessment.

Sign in as `demo` with the password in the submission email. Open **Retirement** to inspect the sample SCOM ledger. To try your own trades, create a separate portfolio. The data is fictional. After an idle period, allow about a minute for the API to wake.

## 🎯 Project Goal

I built FinTrack to give an analyst a verifiable path from account creation through portfolio setup, trade entry, and a holdings summary. Each portfolio has one owner and one base currency. The API owns accounting calculations; the browser presents the returned values and lets the analyst inspect the underlying ledger.

## 🧬 System Architecture

1. **React SPA** handles account access, portfolio management, trade entry, holdings, and transaction history.
2. **FastAPI** authenticates analysts, validates requests, applies owner-scoped access, and exposes JSON and OpenAPI.
3. **PostgreSQL** stores analysts, portfolios, and ordered trades; SQLAlchemy and Alembic manage persistence and schema changes.
4. **Decimal ledger service** replays trades in deterministic order and returns positions, portfolio totals, and allocation percentages.

```mermaid
flowchart LR
    Analyst[Analyst] --> SPA[React and TypeScript SPA]
    SPA -->|HTTPS JSON and bearer token| API[FastAPI]
    API --> Auth[Authentication and owner-scoped routes]
    API --> Ledger[Decimal ledger replay]
    Auth --> DB[(PostgreSQL)]
    Ledger --> DB
    Ledger --> Summary[Holdings and allocation summary]
    Summary --> API
```

## 🛠️ Technical Stack

| Layer | Tool | Version | Purpose |
|:--|:--|:--|:--|
| **Frontend** | React | 19.3.1 | Analyst workspace |
| **Frontend** | TypeScript | 5.9.3 | Typed UI and API contracts |
| **Frontend** | Vite | 8.3.8 | Local development and production bundling |
| **Routing** | React Router | 7.18.6 | Protected pages and deep links |
| **Runtime** | Node.js / npm | 22.23.5 / 11.17.0 | Locked frontend install and scripts |
| **Backend** | Python | 3.12 (3.12.14 measured) | API runtime |
| **Backend** | FastAPI / Pydantic | 0.165.0 / 2.14.4 | HTTP API and input validation |
| **Persistence** | PostgreSQL | 16 (Alpine image) | Relational storage and row locking |
| **Persistence** | SQLAlchemy / Alembic | 2.1.9 / 1.20.1 | Data access and migrations |
| **Authentication** | PyJWT / pwdlib | 2.15.1 / 0.4.2 | HS256 tokens and Argon2id password hashes |
| **Verification** | pytest / Ruff | 8.4.2 / 0.17.6 | Backend tests and lint |
| **Verification** | Vitest / React Testing Library | 5.1.1 / 16.3.3 | Frontend tests |
| **Verification** | ESLint / TypeScript | 10.15.0 / 5.9.3 | Frontend lint and type checking |

Frontend versions are from `frontend/package-lock.json`; Python package versions are from `backend/uv.lock`.

## 📊 Performance & Results

- Current QA branch verification: **55 frontend tests across 9 files** and **4 Chromium browser journeys** passed. ESLint and the production TypeScript/Vite build passed (35 modules; 297.57 kB JavaScript, 91.59 kB gzip; 20.75 kB CSS). The frontend suite includes late login/register responses, an old-token 401, stale ledger refresh, cross-portfolio focus, failed refresh notices, and active-editor deletion.
- Backend verification: **71 tests passed** against disposable PostgreSQL 16 on `127.0.0.1:55833/fintrack_test`; the application URL was pinned to unreachable `127.0.0.1:55839`. The direct guard regression passed and uses spies to prove an application-database collision is refused before engine creation or DDL. Ruff and the OpenAPI export check passed. No destructive test used reserved preview port 55432.
- Four automated Chromium journeys passed: keyboard operation and final-trade focus, 375px light layout, 375px dark layout, and manually selected theme persistence. The keyboard journey stubs the native confirmation response; physical Enter/Escape behavior inside the browser's native dialog is still pending Ian's manual check.
- Theme state tests cover system preference, system changes before an explicit choice, manual selection, and persistence across navigation and reload. Contrast was measured on representative production-preview text in both themes; all sampled pairs exceeded 4.5:1 (minimum sampled ratio 5.29:1 in light mode and 6.41:1 in dark mode).
- Retained A8 measurements: the earlier dark browser run used a 375px viewport with a stable 15px scrollbar gutter, leaving a 360px document client width; the earlier light capture used a 390px browser window and a 375px document client width. Neither had horizontal overflow with 100-character portfolio and client names. In the new headless production-preview capture, both 375px light and dark list/detail layouts measured viewport/client/document/body widths of **375/375/375/375px** and had no horizontal overflow. The distinct browser scrollbar conditions are recorded; the older A8 measurements remain unchanged.
- **Setup timing, 25 Nov:** the full README setup took about **7 minutes** from the first setup step to authenticated Retirement holdings. The worktree, `.venv`, `node_modules`, application database and test database were fresh; npm/uv caches were warm and PostgreSQL 16 Alpine had already been pulled.
- **Setup timing, 26 Nov warm rerun after adding Compose `--wait`: 28.666 seconds.** The continuous timer began by copying `.env.example` and populating it from the private local configuration, then ended when an authenticated browser showed Retirement's SCOM holding. A fresh worktree, `.venv`, `node_modules`, and app/test databases were used with warm npm/uv caches and the pre-existing Docker image. Stages: environment setup 0.17s; Compose healthchecks 6.63s; `uv sync --locked` 1.25s; migration and seed 7.05s; API to OpenAPI 200 2.52s; `npm ci` 7.02s; Vite to HTTP 200 0.68s; browser login and holdings 3.26s. This verifies the healthcheck wait and full warm path; elapsed time can vary with local scheduling.
- The earlier **10m10s warm result** on 26 Nov (03:02:22–03:12:32 EAT) remains recorded: it missed the ten-minute target by 10 seconds. That run also used fresh app/test databases and dependencies with warm npm/uv caches and a pre-pulled image. The improved documented healthcheck step was followed by the 28.666-second warm rerun above.
- **Cold-dependency setup retest, 26 Nov:** **109.495 seconds** (07:44:48.979–07:46:38.474 EAT) from the first `.env` step through authenticated Retirement holdings, using separate empty npm and uv caches, a fresh worktree, `.venv`, `node_modules`, and databases, and pinned Node 22.23.5. Active timed stages: `.env` 0.00s; Compose healthchecks 6.66s; `uv sync --locked` 3.46s; migration and seed 6.61s; API to OpenAPI 200 11.04s; `npm ci` 7.82s; Vite to HTTP 200 11.06s; browser login and holdings 2.16s. These stages total 48.81s; the remaining 60.69s in the continuous 109.495-second wall clock is setup orchestration and handoff time. The PostgreSQL 16 Alpine image was already present (`sha256:f2f98726820d0342055351c6e9d36e705f5bfffb3dd53ff556325114b08afb6d`, created 18 Nov); Playwright Chromium cache was shared and warm. This was a cold dependency-cache run, not a cold Docker-image or browser-cache run.
- `docs/openapi.json` matches the FastAPI schema; the trade quantity and unit price are decimal-string inputs with a valid request example. No load or market-performance benchmark has been run.

## 📸 Application Screenshots

The screenshots show fictional local sample data from an isolated browser review. They do not represent a hosted demo or live market prices.

**Desktop portfolio list.** Fictional portfolio cards show portfolio names, client names, creation dates, currencies, and list actions.

![FinTrack portfolio list on desktop](docs/screenshots/desktop-portfolios.png)

**Desktop portfolio detail.** Holdings and the valuation assumption appear above trade entry and transaction history.

![FinTrack portfolio detail on desktop](docs/screenshots/desktop-portfolio-detail.png)

**375px document-width mobile portfolio detail.** Captured at 390px browser width with a stable 15px scrollbar gutter. Both 100-character names wrap and the trade form stays within the viewport.

![FinTrack portfolio detail at 375 pixels](docs/screenshots/mobile-portfolio-detail-375.png)

**Dark mode sign-in.** The keyboard-focused theme control is visible before sign-in.

![FinTrack dark mode on sign-in](docs/screenshots/dark-login-desktop.png)

**Dark mode portfolio detail.** Retirement holdings, allocation, trade form and transaction table use the same navy and green brand colors.

![FinTrack dark mode portfolio detail](docs/screenshots/dark-portfolio-detail-desktop.png)

**Dark mode at a 375px browser viewport (360px captured content after the scrollbar gutter).** Both 100-character names wrap, and the empty holdings and transaction states remain within the viewport.

![FinTrack dark mode with long names at 375 pixels](docs/screenshots/dark-long-name-detail-375.png)

### QA branch mobile screenshots — 26 November 2026

These local production-preview screenshots use fixture-only API responses with 100-character portfolio and client names. Both list and detail layouts are shown at a 375px browser viewport in each theme.

**Light theme portfolio list (375 × 1290).**

![FinTrack light theme portfolio list at a 375px viewport](docs/screenshots/qa-375-light-portfolios.png)

**Light theme portfolio detail (375 × 2367).**

![FinTrack light theme portfolio detail at a 375px viewport](docs/screenshots/qa-375-light-detail.png)

**Dark theme portfolio list (375 × 1290).**

![FinTrack dark theme portfolio list at a 375px viewport](docs/screenshots/qa-375-dark-portfolios.png)

**Dark theme portfolio detail (375 × 2367).**

![FinTrack dark theme portfolio detail at a 375px viewport](docs/screenshots/qa-375-dark-detail.png)

## 📈 Domain Coverage

| Domain item | FinTrack behavior |
|:--|:--|
| Instruments | Fictional sample trades use NSE symbols such as SCOM, EQTY, and KCB; no market feed is connected. |
| Base currencies | Each portfolio uses KES or USD; portfolios are not converted between currencies. |
| Trade types | BUY adds units and cost basis; SELL reduces open units and basis. |
| Ledger ordering | Trades replay by trade date, creation time, and stable transaction ID. |
| Valuation | Estimated value uses the latest recorded trade price times open units. |
| Allocation | Percentages use unrounded Decimal position values before display rounding. |

## 🧠 Key Design Decisions

- **Server-owned accounting:** I keep accounting and allocation calculations in the API so the browser cannot drift from ledger rules.
- **Numeric precision:** I use Decimal inputs and database numeric columns for financial values, and serialize monetary values as decimal strings.
- **Trade integrity:** I lock the owned portfolio while validating and writing trade changes; the transaction rolls back when a later trade becomes invalid.
- **Async route state:** I scope detail results to the current portfolio route and request generation so stale responses cannot replace newer visible state.
- **Visual hierarchy:** I use a navy header, a restrained green brand mark and action color, neutral Buy/Sell labels, destructive red for delete actions, visible focus styles, and a holdings-first detail layout. Green and red financial change colors are reserved for signed amounts.
- **Authentication:** I keep session tokens in memory. A page reload requires sign-in again; refresh-token storage and additional analyst roles are outside the assessment scope.

## 📂 Project Structure

```text
.
├── .github/                  # GitHub automation
│   └── workflows/ci.yml      # Locked frontend and backend checks
├── backend/                 # FastAPI service and ledger domain
│   ├── app/                  # FastAPI routes, authentication, models, and ledger service
│   ├── migrations/           # Alembic schema revisions
│   ├── tests/                # API, database-safety, and accounting tests
│   ├── pyproject.toml        # Python requirements and tool configuration
│   └── uv.lock               # Locked Python dependency versions
├── docs/                    # API schema and visual evidence
│   ├── openapi.json          # Exported API schema
│   └── screenshots/          # Desktop and mobile browser evidence
├── frontend/                # React analyst workspace
│   ├── src/                  # React pages, components, API client, and tests
│   ├── package.json          # Frontend scripts and dependency ranges
│   ├── package-lock.json     # Locked JavaScript dependency versions
│   └── .nvmrc                # Node.js version
├── compose.yaml              # Local application and disposable test databases
├── .env.example              # Placeholder-only local configuration
├── .gitignore                # Excludes local secrets and projectsummary.md
└── README.md                 # Project documentation
```

`projectsummary.md` is a local, gitignored working note and is not part of the public repository.

## ⚙️ Setup and Local URLs

### Prerequisites

- Python 3.12 and `uv` 0.12.x or compatible locked-dependency support.
- Node.js 22.23.5 and npm 11.x (`frontend/.nvmrc` records Node).
- Docker Desktop with Docker Compose and PostgreSQL 16 images for local database provisioning.
- The example uses loopback-only database ports 55532 and 55533, API port 8002, and Vite port 5175. Keep the app and test database ports distinct, choose unused local ports if these are occupied, and never use the reserved preview database port 55432 for tests.

### Start a local review environment

1. From the repository root, copy `.env.example` to `.env`, then replace the local placeholders. Keep the database URLs aligned with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `FINTRACK_APP_DB_PORT`, and `FINTRACK_TEST_DB_PORT` used by Compose. Set `JWT_SECRET_KEY` to a private unpredictable value of at least 32 characters and set a private fictional `DEMO_PASSWORD`. Do not commit `.env`.
2. Start the application database and isolated test database in a dedicated Compose project. This example uses `fintrack-review-local`; choose another unique name if it already exists:

   ```powershell
   docker compose --project-name fintrack-review-local up -d --wait db test-db
   ```

   Compose waits for both PostgreSQL healthchecks before the migration step.

3. Install backend dependencies, apply migrations, seed the fictional account, and start the API:

   ```powershell
   Set-Location backend
   uv sync --locked
   uv run --locked alembic upgrade head
   uv run --locked python -m app.seed
   uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8002
   ```

4. In a second terminal at the repository root, install the locked frontend dependencies and start Vite:

   ```powershell
   Set-Location frontend
   npm ci
   $env:VITE_API_BASE_URL = 'http://127.0.0.1:8002'
   npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
   ```

5. Sign in with the fictional `DEMO_USERNAME` and `DEMO_PASSWORD` configured in the private `.env` file.

| Local service | URL |
|:--|:--|
| Frontend | http://127.0.0.1:5175 |
| API | http://127.0.0.1:8002 |
| Swagger UI | http://127.0.0.1:8002/docs |
| OpenAPI JSON | http://127.0.0.1:8002/openapi.json |

### Hosted deployment

| Service | Public URL | Hosting configuration |
|:--|:--|:--|
| Frontend | [FinTrack](https://fintrack-portfolio-ledger.vercel.app) | Vercel Hobby; Vite project root `frontend`; `npm ci`, `npm run build`, output `dist`; `frontend/vercel.json` routes deep links to the app shell. |
| API | [FastAPI](https://fintrack-api-bs43.onrender.com) | Render Free web service in Virginia; Python 3.12; root `backend`; `uv sync --locked --no-dev`; start with `uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT`. |
| API docs | [Swagger UI](https://fintrack-api-bs43.onrender.com/docs) | Public OpenAPI documentation. |
| Database | Neon PostgreSQL | Free project in AWS us-east-1; TLS required; pooled URL for runtime and direct URL for Alembic. |

The production Vercel variable `VITE_API_BASE_URL` is the API origin without `/api`. Render's `CORS_ORIGINS` is a JSON array containing the exact Vercel origin. `DATABASE_URL`, `JWT_SECRET_KEY`, `DEMO_USERNAME`, and `DEMO_PASSWORD` are configured in the Render service settings. Never put their values in this repository or a browser bundle.

Render Free web services spin down after 15 minutes without incoming traffic and can take about a minute to start again. The free tier is intended for hobby projects and previews; its monthly usage limits and restart behavior apply. See [Render Free service limits](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby), and [Neon pricing](https://neon.com/pricing).

For a new deployment, configure the environment variables in the providers first. Apply `uv run --no-sync alembic upgrade head` and `uv run --no-sync python -m app.seed` once against the Neon database using its direct TLS connection URL. Keep the runtime URL pooled. Set `VITE_API_BASE_URL` in Vercel Production and rebuild after changing it. The seed is idempotent. Never point pytest at the hosted database.

### Run checks

Frontend checks, from `frontend/`:

```powershell
npm.cmd ci
npm.cmd test -- --run
npm.cmd run lint
npm.cmd run build
```

To run the browser regressions, install Playwright's Chromium browser and run the fixture-backed suite from `frontend/`:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Backend checks use the separate disposable test database exposed by Compose on port 55533. The PowerShell snippet reads the DSN from root `.env`, so it uses the same configured credentials. From `backend/`:

```powershell
uv sync --locked
$validatedTestDatabaseUrl = (& uv run --locked python -c "from app.config import get_settings; print(get_settings().test_database_url or '')").Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($validatedTestDatabaseUrl)) {
  throw "Could not read TEST_DATABASE_URL with the application settings parser."
}
$previousDatabaseUrl = $env:DATABASE_URL
$previousTestDatabaseUrl = $env:TEST_DATABASE_URL
$previousRequireTestDatabase = $env:FINTRACK_REQUIRE_TEST_DATABASE
try {
  $env:TEST_DATABASE_URL = $validatedTestDatabaseUrl
  $env:FINTRACK_REQUIRE_TEST_DATABASE = '1'
  uv run --locked pytest -q tests/test_config.py::test_test_database_fixture_uses_password_safe_url
  if ($LASTEXITCODE -ne 0) { throw "Configured test database failed its safety preflight." }
  uv run --locked pytest -q tests/test_database_isolation.py::test_rejected_application_database_never_reaches_engine_or_ddl
  if ($LASTEXITCODE -ne 0) { throw "Application database collision guard failed." }
  & {
    $env:DATABASE_URL = "postgresql+psycopg://fintrack:unused@127.0.0.1:55439/fintrack-blocked"
    $env:TEST_DATABASE_URL = $validatedTestDatabaseUrl
    uv run --locked pytest -ra
  }
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed." }
}
finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $previousDatabaseUrl }
  if ($null -eq $previousTestDatabaseUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:TEST_DATABASE_URL = $previousTestDatabaseUrl }
  if ($null -eq $previousRequireTestDatabase) { Remove-Item Env:FINTRACK_REQUIRE_TEST_DATABASE -ErrorAction SilentlyContinue } else { $env:FINTRACK_REQUIRE_TEST_DATABASE = $previousRequireTestDatabase }
}
uv run --locked ruff check .
if ($LASTEXITCODE -ne 0) { throw "Ruff reported backend lint errors." }
uv run --locked python export_openapi.py --check
```

The safety guard compares `TEST_DATABASE_URL` with the effective application DSN before creating an engine or issuing DDL; each database test owns a UUID-specific schema. The preflight reads `TEST_DATABASE_URL` through FinTrack’s Pydantic settings and dotenv parser, preserves a caller-supplied `DATABASE_URL`, and proves the collision guard refuses an unsafe destination before engine creation or DDL. Test DSNs require an explicit port and reject all query parameters; application DSNs reject query options that can override host, port, database, or service routing. An application DSN must include its host and database, and the `fintrack_test` catalog name is reserved for test fixtures regardless of application host or port. The guard refuses `PGSERVICE`/`PGSERVICEFILE` routing. Both test engine connections pin network address and port to the validated loopback test DSN, so inherited `PGHOSTADDR` or `PGPORT` cannot redirect schema operations. The validator rejects reserved preview port 55432. This README’s Compose project maps the disposable service to 55533; if changing the Compose mapping, configure the loopback `fintrack_test` DSN to that disposable service. Only after preflight does the backend test run pin its application URL to unreachable port 55439. The PowerShell `finally` block restores the caller’s prior environment. `FINTRACK_REQUIRE_TEST_DATABASE=1` turns a missing test URL into a failure; GitHub Actions sets it, while ordinary local runs may skip database tests and show the reason with `pytest -ra`. Never use a demo or hosted database as `TEST_DATABASE_URL`. The example DSNs use `127.0.0.1` to match Compose’s loopback-only bindings and avoid slow IPv6 `localhost` resolution on some Windows setups.

## 🧾 Domain Implementation Details

### API routes

#### Try the live API in Swagger

1. Open [Swagger UI](https://fintrack-api-bs43.onrender.com/docs). Expand **POST /api/auth/login**, select **Try it out**, enter the demo credentials supplied in the submission email, and select **Execute**.
2. Copy the returned `access_token`. Select **Authorize**, paste the token into **HTTPBearer**, then select **Authorize** and **Close**. Swagger adds the bearer prefix automatically.
3. Execute **GET /api/portfolios** and copy the numeric ID of the Retirement portfolio. Use it in **GET /api/portfolios/{portfolio_id}/transactions** to see its ledger and **GET /api/portfolios/{portfolio_id}/summary** to inspect open units, cost, estimated value and allocation.
4. To test writes, create a separate portfolio with **POST /api/portfolios**. Under **POST /api/portfolios/{portfolio_id}/transactions**, try this fictional trade against the new ID:

   ```json
   {"instrument":"SCOM","type":"BUY","quantity":"10","unit_price":"100.00","trade_date":"2026-11-25"}
   ```

   A successful create returns **201**. Read the summary again: the position has 10 units, a cost basis of 1,000.00 and an estimated value of 1,000.00 in the portfolio currency. A sale of 11 units returns **409** and leaves the ledger unchanged. Delete only the portfolio created for this walkthrough. A successful deletion returns **204**.

The [machine-readable OpenAPI contract](https://fintrack-api-bs43.onrender.com/openapi.json) covers 11 operations across seven paths. The committed snapshot is [docs/openapi.json](docs/openapi.json). Business endpoints require a valid token; an unauthenticated request returns **401**.

| Method | Route | Purpose |
|:--|:--|:--|
| POST | `/api/auth/register` | Create an analyst account |
| POST | `/api/auth/login` | Return a one-hour HS256 bearer token |
| GET, POST | `/api/portfolios` | List or create the signed-in analyst's portfolios |
| GET, PUT, DELETE | `/api/portfolios/{portfolio_id}` | Read, update, or delete an owned portfolio |
| GET, POST | `/api/portfolios/{portfolio_id}/transactions` | Read or record trades in an owned portfolio |
| DELETE | `/api/transactions/{transaction_id}` | Delete an owned trade and recalculate the ledger |
| GET | `/api/portfolios/{portfolio_id}/summary` | Return server-calculated totals, holdings, and allocations |

API errors use `{"error":{"code":"...","message":"..."}}`. Validation failures return 422, ledger conflicts return 409, and missing or foreign-owned resources return 404. Trade writes validate positive finite decimal values; the database stores numeric values and the API accepts decimal strings.

### Accounting assumptions and limits

- BUY trades update moving weighted-average cost. SELL trades reduce open units and basis at that average cost.
- An oversell or a backdated change that invalidates a later sale returns a conflict and rolls back the write.
- Estimated value is based on the latest recorded trade price, not a live quote. FX conversion, fees, taxes, realized gains, and market feeds are outside the current scope.
- Each portfolio has one base currency, KES or USD. Values are not added across currencies.
- After page refresh, an analyst signs in again because bearer tokens are held in memory.

### Next steps

GitHub Actions runs the locked backend and frontend checks on pull requests and pushes to `main` and the QA verification branch. This branch-only follow-up is not deployed; the README records its setup measurement and cache conditions separately from the public release.

## 🎓 Skills Demonstrated

- **API design:** Typed request validation, bearer authentication, and owner-scoped authorization.
- **Data engineering:** PostgreSQL migrations, isolated test schemas, Decimal accounting, rollback, and concurrent ledger writes.
- **Frontend engineering:** Responsive React development, accessible labels and focus behavior, route-aware async state, and genuine client-side sorting/filtering.
- **Delivery quality:** Regression testing, linting, OpenAPI export, production bundling, and evidence-backed documentation.

AI tool used during development: OpenAI Codex.
