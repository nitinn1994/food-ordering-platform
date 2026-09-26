# Getting Started

**Last updated:** 2026-09-26 (Phase 14, sub-phase 14.5)
**Status:** `apps/web`, all four of `packages/contracts/{common,ui-commands,
agent-intents,api-contracts}`, and `apps/commerce-api` are scaffolded and
working — Phase 1 (frontend foundation), Phase 2 (menu browsing: search, item
detail, loading/error states), Phase 3 (frontend cart simulation: full cart
CRUD, a `/cart` route, cross-route persistence), Phase 4 (frontend checkout
simulation: a `/checkout` route, customer-details form, review, and a
simulated order confirmation), Phase 5 (contract foundation: shared
primitives, envelopes, versioning, strict validation, and generated JSON
Schema for both `ui-commands` and `agent-intents`), Phase 6 (NestJS
commerce-api foundation: configuration, request validation against the
Phase 5 contract schemas, a structured error model, correlation and request
logging, URI versioning, and `GET /health`), Phase 7 (Menu domain: a new
`@contracts/api-contracts` package, an in-memory `MenuRepository`, and
`GET /v1/menu` / `GET /v1/menu/items/:itemId`), and Phase 8 (Cart domain:
`GET /v1/cart`, `POST /v1/cart/items`, `PATCH`/`DELETE
/v1/cart/items/:itemId`, backed by a version-checked `CartRepository` and
priced live from the Menu), Phase 9 (Order domain: `POST /v1/orders` and
`GET /v1/orders/:orderId`, an immutable snapshot of the cart, idempotent by
a required key) and Phase 10 (database persistence: PostgreSQL behind the
existing repository interfaces, migrations, a menu seed, and one
transaction for order placement — ADR-0017) are all complete. Nothing
calls the Commerce API yet — `apps/web` still uses its own fixture and
local cart. Phase 12 (Python AI service foundation: FastAPI, validated
configuration, commerce-api's error and correlation model, JSON logging,
`GET /health` and tested boundaries, with no AI behaviour, ADR-0019) is
complete too, so `apps/ai-service` is scaffolded and working. Phase 13
(LangGraph agent foundation: a two-node graph on a deterministic simulated
model, an agent service, and `POST /v1/agent/turns`, with no provider, tools,
intents or memory, ADR-0020) is complete. Phase 14 (AI tool calling: five
allowlisted Commerce API tools, one Commerce API client, and Pydantic models
generated from `api-contracts`, ADR-0021) is complete. The model is still
simulated and never calls a tool.

---

## Read this first

This file is the project's authoritative record of its own commands, per
`.claude/rules/validation.md`. That rule cuts both ways: a command listed here
must actually exist, and **a command that does not exist must not be listed
here just because it looks plausible.** Every command below has been run and
verified as of this update.

Whichever phase next scaffolds `apps/ai-service` must update this file in the
same change. A scaffolding phase that leaves this file stale has not finished.

## Current state

| | |
| --- | --- |
| Applications | `apps/web` — Next.js, TypeScript, working; since Phase 11 its menu, cart and orders come from `commerce-api` through a same-origin proxy (ADR-0018). `apps/commerce-api` — NestJS, TypeScript, working (Phase 6 foundation + Phase 7 read-only Menu domain + Phase 8 Cart domain + Phase 9 Order domain + Phase 10 PostgreSQL persistence). `apps/ai-service` — Python 3.12 + FastAPI + LangGraph, working (Phase 12 foundation + Phase 13 agent foundation: `POST /v1/agent/turns` on a simulated model + Phase 14 Commerce API tools and client + Phase 15 presentation tools returning UI commands and write tools validated as business intents; no model provider — the simulated keyword model calls commerce-api only for `add <item>`; outside the pnpm workspace — ADR-0002, ADR-0019, ADR-0020, ADR-0021, ADR-0022). Since Phase 15 `apps/web`'s chat calls ai-service through a same-origin proxy and applies its UI commands (ADR-0022). |
| Shared packages | `packages/contracts/common`, `ui-commands`, `agent-intents`, `api-contracts` — Zod schemas, all working, each with committed generated JSON Schema. `api-contracts` gained its first producer in Phase 7 (`commerce-api`'s Menu domain) and its first request schemas in Phase 8 (Cart). |
| Dependency manifests | Root `package.json` + `pnpm-workspace.yaml` (pnpm + Turborepo, ADR-0002); `apps/web/package.json`; `apps/commerce-api/package.json`; one `package.json` per `packages/contracts/*` package. `apps/ai-service/pyproject.toml` + committed `uv.lock` (uv; not a pnpm package — ADR-0019). |
| Build tooling | Turborepo (`turbo.json`), TypeScript (`tsconfig.base.json`), ESLint flat config (`eslint.config.mjs`, enforcing `apps/web`'s `agent-intents` import restriction — ADR-0012 — and `apps/commerce-api`'s `ui-commands`/`apps/web` import restriction — ADR-0013), Vitest per package. Each contracts package also has a `build` script (`scripts/emit-schema.ts`) that generates its committed JSON Schema; `packages/contracts/tools/` holds a small Node module hook those scripts use, and only they use. `apps/commerce-api`'s own `build` is `vite build` (SSR mode) — a different mechanism, since it produces a runnable service, not a JSON Schema artifact (ADR-0013). |
| CI | None. `apps/ai-service`'s checks are not part of `turbo run`: they are run separately (below). This is ADR-0002's residual risk, now real. |
| Git | Repository initialised; commits exist (this file is touched on every phase, this line just tracked reality late — see Phase 7's follow-up notes). |

## Prerequisites

Verified working with:

| Toolchain | Verified version | Pinned in |
| --------- | ----------------- | --------- |
| Node.js | v24.19.0 | `.nvmrc`, `package.json` `engines` (`>=20.9.0`) |
| pnpm | 12.3.4 | `package.json` `packageManager` |
| Python | 3.12.3 (system `python3.12`; uv installs 3.12 itself if it is missing) | `apps/ai-service/.python-version`, `pyproject.toml` `requires-python = ">=3.12,<3.13"` |
| uv | 0.12.19 | not pinned. Installed with the official installer (`curl -LsSf https://astral.sh/uv/install.sh \| sh`, into `~/.local/bin`). Needed only for `apps/ai-service`. |
| Docker (with Compose) | Docker Engine 29.7.2 (Docker Desktop), Compose v5.4.0 | not pinned — only needed for the local PostgreSQL (`db:up`), which `dev`, `start` and `test:db` require; `pnpm turbo run test` does not |

## Commands

Run from the repository root unless noted. All verified passing as of
2026-09-27 (Phase 15, sub-phase 15.5; the four `turbo` checks were run with
`--force`, so no result was a turbo cache replay). Phase 15 added no
dependency. Earlier, as of 2026-09-26 (Phase 11): Phase 11 added two
workspace dependencies to `apps/web` (`@contracts/api-contracts`,
`@contracts/common`) with `pnpm --filter web add` — no external package, and
`pnpm install` itself was not re-run from clean.

**Running `apps/web` against `commerce-api`** (Phase 11): start the database
and `commerce-api` as below, then `apps/web`. The browser calls `apps/web`'s
own `/api/commerce/v1/*`, which Next.js rewrites to `COMMERCE_API_URL`
(default `http://127.0.0.1:3001`; see `apps/web/.env.example`). Without a
running `commerce-api`, `apps/web` still starts, but the menu page shows its
error state and the cart cannot load. For `next build` + `next start`,
`COMMERCE_API_URL` must be set when **building** (the rewrite is fixed then)
and, outside development, when **starting** (Server Components refuse to
guess in production). Both `next dev` and `next start` bind to `127.0.0.1`
(`-H 127.0.0.1` in `apps/web/package.json`): the proxy makes the web app a
door to commerce-api, which is itself loopback-only.

**Running the chat against ai-service** (Phase 15): also start ai-service
(below). The browser calls `apps/web`'s own `/api/ai/v1/agent/turns`, which
Next.js rewrites to `AI_SERVICE_URL` (default `http://127.0.0.1:3002`; see
`apps/web/.env.example`). That is the only path forwarded: any other
`/api/ai/*` path is 404. Without ai-service, `apps/web` still works, and the
chat answers every message with a fixed error. For `next build`,
`AI_SERVICE_URL` must be set when **building**, like `COMMERCE_API_URL`.
Typing `add <item>` in the chat changes the shared cart through ai-service.

**First-time database setup** (once per machine, then after any new
migration): `pnpm --filter commerce-api db:up`, then `db:migrate`, then
`db:seed`. Copy `apps/commerce-api/.env.example` to `.env` first — `dev`,
`start` and the `db:*` scripts read `DATABASE_URL` from it.

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | `pnpm install` | Verified |
| Type check (all packages) | `pnpm turbo run typecheck` | Verified |
| Lint (all packages) | `pnpm turbo run lint` | Verified |
| Test (all packages) | `pnpm turbo run test` | Verified (Phase 15) — 939 tests (44 `common` + 69 `ui-commands` + 31 `agent-intents` + 114 `api-contracts` + 364 `web` + 317 `commerce-api`). Phase 15 added 36 `ui-commands` tests (the agent-turn contract) and web tests for the chat, the agent service, batch dispatch and the ai-service proxy. The previous figures in this row (815: 43 `common`, 277 `web`) were not updated after Phase 11, so a per-phase delta for those two packages is not recorded here. Phase 11 note: every deleted or rewritten web test is listed in `docs/features/phase-11-web-commerce-integration/`. `web` tests use a stubbed `fetch` and need no running API. Phase 10 note: Needs **no** database: `*.db.test.ts` files are excluded, and the HTTP e2e suites run on the in-memory test adapters. Every package except `commerce-api` is unchanged in count and outcome; `commerce-api` gained 38 tests (the 279 pre-existing ones still pass — some had wiring-only changes, listed in `docs/features/phase-10-database-persistence/plan.md`). |
| Test against PostgreSQL | `pnpm --filter commerce-api test:db` | Verified — 111 tests (migrations, seed, the three Postgres repositories, the transaction runner, order placement, and a full-stack HTTP suite) against the Compose database `commerce_test`. Resets that database's schema and migrates it first; refuses any database whose name does not end in `_test`. With no database reachable it **fails** with a message naming `db:up` — it never skips. |
| Start / stop the local database | `pnpm --filter commerce-api db:up` / `db:down` | Verified — `docker compose` with `infrastructure/docker/compose.yaml`: PostgreSQL 18, bound to 127.0.0.1:5432, databases `commerce` and `commerce_test`, data in the `commerce-pgdata` volume. `db:down` keeps the data; `docker compose -f infrastructure/docker/compose.yaml down -v` destroys it |
| Migrate the database | `pnpm --filter commerce-api db:migrate` / `db:migrate:down` | Verified — to latest / one step down, against `DATABASE_URL`; a second run is a no-op ("Already up to date." / "Nothing to revert.") |
| Seed the menu | `pnpm --filter commerce-api db:seed` | Verified — loads the 3 categories and 6 items of `menu.seed.ts`; idempotent, never deletes; refuses to run with `NODE_ENV=production` |
| Build (all packages) | `pnpm turbo run build` | Verified — needs no running `commerce-api`; `/` renders per request (dynamic), `/cart`, `/checkout` and `/_not-found` prerender as static shells (Phase 11); each contracts package's `build` regenerates its committed `schema/*.v1.json`; `commerce-api`'s `build` produces `dist/main.js`. Each contracts package's `build` prints a `no output files found` warning from turbo (its `outputs` key covers `dist/**`, not `schema/**`) — pre-existing since Phase 5, not a Phase 7, 8 or 9 regression. |
| Generate one contract package's JSON Schema | `pnpm --filter @contracts/<name> build` | Verified for `common`, `ui-commands`, `agent-intents`, `api-contracts` — run after any schema change, before committing |
| Run `apps/web` in development | `pnpm --filter web dev` | Verified — serves on http://localhost:3000 (bound to `127.0.0.1` only since Phase 11, so it is not reachable from other machines; `http://127.0.0.1:3000` always works); `/cart` and `/checkout` also live; reads everything commerce-related from `commerce-api` via `/api/commerce/v1/*`, which `src/middleware.ts` confines to `/v1` (Phase 11); the chat calls ai-service via `/api/ai/v1/agent/turns`, the only ai-service path it forwards (Phase 15) |
| Run `apps/commerce-api` in development | `pnpm --filter commerce-api dev` | Verified — needs the database (above) and refuses to start without it; serves on http://127.0.0.1:3001; `GET /health` → `200 {"status":"ok"}`; `GET /v1/menu` and `GET /v1/menu/items/:itemId` also live, the four `/v1/cart` routes (Phase 8), and `POST /v1/orders` / `GET /v1/orders/:orderId` (Phase 9) |
| Run `apps/commerce-api`'s built output | `pnpm --filter commerce-api build && pnpm --filter commerce-api start` | Verified — same `/health`, `/v1/menu*`, `/v1/cart*` and `/v1/orders*` responses, from `dist/main.js`; carts and orders survive a restart; with the database stopped, requests get 503 `SERVICE_UNAVAILABLE` and a fresh start exits 1 |

**Phase 11 closed the browser gap below for `apps/web`:** the Claude in
Chrome extension still did not connect, but the Chrome DevTools MCP did,
and a full live walk ran against `next start` + `commerce-api` dev +
PostgreSQL — menu, add, increase, decrease, remove, reload and API-restart
persistence, an unavailable line blocking checkout, a real order placed and
read back via `GET /v1/orders/:orderId`, and friendly errors plus recovery
with `commerce-api` stopped (recorded in the Phase 11 implementation
report). The paragraph below is the pre-Phase-11 record.

**Not verified this phase, same gap as Phases 3–6:** interactive browser
checks against `apps/web`. `NOT_APPLICABLE` for Phase 7 specifically — it
changed no UI (`apps/web` still reads its own fixture, not the new API) —
but the Chrome browser automation tool gap recorded since Phase 4 remains
open. `apps/commerce-api` has no UI to check with a browser tool; the Menu
routes were verified instead by `curl` against both `dev` and the built
`start` output, directly, for every response class in
[`docs/api/commerce-api.md`](../api/commerce-api.md) §6 and §11 (200 for
the menu and a found item, 200 with `available: false` for `gelato`, 404
`MENU_ITEM_NOT_FOUND` for an unknown item, 400 `INVALID_PAYLOAD` for a
malformed one) — not merely by the automated test suite. Phase 8's Cart
routes were verified the same way, against `dev` and `start`: an empty
cart, add, merge, absolute set, 422 `MENU_ITEM_UNAVAILABLE`, remove, 404
`CART_ITEM_NOT_FOUND` on a repeat remove, and 404 `ROUTE_NOT_FOUND` for the
deliberately absent `DELETE /v1/cart`. Phase 9's Order routes were verified
the same way, against `dev` and `start`: 422 `CART_EMPTY` on an empty cart,
201 placing an order, an empty cart afterwards, 200 reading it back, a
replay returning the same `orderId`, 409 `IDEMPOTENCY_KEY_REUSED`, 400 for a
caller-supplied `totalCents`, 404 `ROUTE_NOT_FOUND` for the deliberately
absent `GET /v1/orders`, and 404 `ORDER_NOT_FOUND` for the order after a
restart — plus a check that no customer detail appeared in the server log.
Phase 10 inverted that last check: against the built `start` output, on
PostgreSQL, a cart and an order both survived a restart; the order was
readable afterwards with an identical body, and a same-key replay returned
the same `orderId`. With the database stopped under a running server, every
route answered 503 `SERVICE_UNAVAILABLE` with a static body. A fresh start
with the database down exited 1 with `Database unreachable at startup (code
ECONNREFUSED).`. No log line contained the connection string or a customer
detail.

`packages/contracts/{common,ui-commands,agent-intents,api-contracts}` have
no `dev`/`start` command — they are libraries, not runnable services.
### `apps/ai-service` (Phases 12–15)

Run from `apps/ai-service/`. These commands are **not** part of
`pnpm turbo run …` (the service is outside the pnpm workspace, ADR-0002), so
run them separately. Test, lint, format, type check, regenerate, run and the
live check were re-verified on 2026-09-27 (Phase 15, sub-phase 15.5). Install
was last verified on 2026-09-26 (Phase 14); Phase 15 added no dependency.

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | `uv sync` (`uv sync --locked` proves `uv.lock` is current) | Verified. It also rebuilds from a deleted `.venv`. |
| Test | `uv run pytest` | Verified: 760 passed, 2 skipped (the live check below), up from 611 before Phase 15. Needs no `.env`, no API key, no commerce-api, no database and no network: commerce-api is a fake on httpx's `MockTransport`. No model provider is called: the agent runs on simulated and scripted models. |
| Lint | `uv run ruff check .` | Verified |
| Format check | `uv run ruff format --check .` | Verified |
| Type check | `uv run mypy` | Verified (strict, service and tests) |
| Run in development | `uv run python -m ai_service --reload` | Verified. Serves on http://127.0.0.1:3002 (loopback only). `GET /health` returns `200 {"status":"ok"}`. `/docs` and `/openapi.json` are served only when `APP_ENV=development` (the default). |
| Run | `uv run python -m ai_service` | Verified. No `.env` needed, since every setting has a default. An invalid value (for example `PORT=abc`) exits 1, naming the variable, not the value. So does switching LangSmith tracing on (`LANGSMITH_TRACING=true`, or any of the other tracing variables in `.env.example`). `POST /v1/agent/turns` with `{"message":"Hello"}` returns the simulated reply; `{"message":"show me the desserts"}` also returns a `uiCommands` batch (Phase 15). |
| Run with a `.env` | `uv run --env-file .env python -m ai_service` | Verified form. Copy `.env.example` first: uv refuses `--env-file` when the file is missing. |
| Regenerate contract models | `uv run python scripts/generate_contracts.py` | Verified: rewrites the three generated modules in `ai_service/contracts/`: `api_contracts.py` (from `api-contracts/schema/*.v1.json`), `ui_commands.py` (from `ui-commands/schema/agent-turn-*.v1.json`) and `agent_intents.py` (from `agent-intents/schema/agent-intent.v1.json`), with no diff when current. Run it after a contract's JSON Schema changes; `uv run pytest` fails on drift. |
| Live check against commerce-api | `AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 uv run pytest tests/test_live_commerce.py` | Verified (2 passed; re-run in Phase 15) against commerce-api started with `db:up`, `db:migrate`, `db:seed` and `dev`. Without the variable it is skipped. It adds, changes and removes one item in the shared cart (an item not already in it), leaves the rest of the cart as it was, and never places an order. |
| Build | — | `NOT_APPLICABLE`: an unpackaged application with no build step. |

### Running the three apps independently

None of the three needs the others in order to start:

| App | Start | Needs |
| --- | --- | --- |
| `apps/web` | `pnpm --filter web dev` | Nothing to start. Without commerce-api, the menu shows its error state. Without ai-service, the chat answers with a fixed error. |
| `apps/commerce-api` | `pnpm --filter commerce-api db:up`, then `pnpm --filter commerce-api dev` | PostgreSQL (first-time setup above) |
| `apps/ai-service` | `cd apps/ai-service && uv run python -m ai_service --reload` | Nothing to start. Its Commerce tools call commerce-api at `COMMERCE_API_URL` (default `http://127.0.0.1:3001`) only when a model calls one. The simulated model does so only for `add <item>`, and without commerce-api that turn explains the failure. There is no model provider yet. |

Since Phase 15 `apps/web`'s chat calls `apps/ai-service` (`POST
/v1/agent/turns`, through `/api/ai/v1/agent/turns`). `simulate.ts` is gone.

`NOT_CONFIGURED` means the project has no such check set up. It does not mean
passing, and it does not mean failing. See `.claude/rules/validation.md` for
the full status vocabulary.

One known warning, not a failure: `next build` reports "The Next.js plugin was
not detected in your ESLint configuration." This is expected — the root
ESLint config was kept deliberately minimal (no `next/core-web-vitals`
plugin) per `docs/features/phase-1-web-foundation/plan.md`.

## Repository layout

```text
apps/
  web/            Next.js frontend — scaffolded, working (Phase 1 + 2 + 3 + 4)
    src/app/                 layout.tsx (providers, SiteNav, CartAnnouncer),
                              page.tsx (menu, async Server Component),
                              loading.tsx, error.tsx, globals.css
    src/app/cart/             page.tsx (async Server Component), loading.tsx
    src/app/checkout/         page.tsx (async Server Component), loading.tsx
    src/components/menu/     CategoryFilter, MenuSearch, MenuList,
                              MenuItemCard, ItemDetailPanel
    src/components/cart/     CartPanel (compact menu-page summary),
                              CartList (full /cart view, checkout entry
                              link), CartLine, CartTotal, QuantityStepper,
                              CartAnnouncer
    src/components/checkout/ CheckoutFlow (step machine + guard),
                              EmptyCheckoutNotice, CustomerDetailsForm,
                              FormField, CheckoutReview, OrderSummary,
                              OrderConfirmation, CheckoutAnnouncer
    src/components/nav/      SiteNav (Menu / Cart (n), aria-current)
    src/components/chat/     ChatInput, ChatTranscript
    src/components/dev/      CommandLogPanel (development-only)
    src/lib/agent/           agentService.ts (the chat's ai-service turn)
    src/lib/commands/        dispatch.ts (single command + turn batch)
    src/lib/state/           uiStore.tsx (durable), cartStore.tsx (temporary
                              — lines + mutations only, no pricing; gained
                              CLEAR_CART in Phase 4 for a placed order)
    src/lib/cart/            pricing.ts (line/cart subtotals, item count,
                              quantity cap — pure functions)
    src/lib/checkout/        types.ts, validation.ts, orderId.ts, order.ts
                              (temporary — simulated order snapshot),
                              checkoutReducer.ts (step machine)
    src/lib/menu/            menuSource.ts (the one fixture-import point),
                              filter.ts (category + query, AND semantics)
    src/lib/fixtures/        menu.ts (temporary)
    src/lib/money.ts         integer-cents formatting
  ai-service/     Python service — scaffolded, working (Phase 12 foundation +
                   Phase 13 LangGraph agent + Phase 14 tools + Phase 15
                   UI commands; uv, FastAPI; outside the pnpm workspace —
                   ADR-0019, ADR-0020, ADR-0021, ADR-0022)
    ai_service/               __main__.py (validate config → logging →
                              uvicorn), main.py (create_app), config.py,
                              api/ (health, agent), agents/ (LangGraph state,
                              nodes, graph, prompt, service), tools/ (the
                              five-tool allowlist, the write-tool → intent
                              map, ToolService), ui_commands/ (the
                              presentation tools: UI commands, no I/O),
                              clients/
                              (the Commerce API client: the only httpx),
                              contracts/ (generated Pydantic, never edited),
                              llm/ (model boundary: simulated model), core/
                              (errors, logging, request_context,
                              request_limits), schemas/ (HTTP models)
    scripts/                  generate_contracts.py (JSON Schema → Pydantic)
    tests/                    pytest; fixtures_routes.py = test-only routes;
                              fakes.py = test-only chat models;
                              commerce_fakes.py = fake commerce-api;
                              test_boundaries.py = no DB/provider deps,
                              httpx confined to clients/, LangGraph/LangChain
                              confined to agents/ and llm/, layers kept apart,
                              ui_commands/ never reaching the Commerce client
  commerce-api/   NestJS service — scaffolded, working (Phase 6 foundation +
                   Phase 7 read-only Menu, Phase 8 Cart, Phase 9 Order)
    src/main.ts               bootstrap: parse env, fail-fast, build logger,
                               NestFactory.create, configureApp, listen
    src/configure-app.ts      every cross-cutting HTTP concern in one place
                               and one verified order — shared by main.ts
                               and every API test (versioning, request
                               context, content-type guard, body parser,
                               request logging, validation pipe, exception
                               filter, shutdown hooks)
    src/app.module.ts         wires ConfigModule + DatabaseModule +
                               HealthModule + MenuModule + CartModule +
                               OrderModule; no HTTP
                               middleware of its own
                               (see configure-app.ts)
    src/config/               env.schema.ts (Zod, fail-fast), config.module.ts
                               (APP_CONFIG, provided by main.ts's already-
                               validated config), test-config.ts (test-only)
    src/common/errors/        api-error-codes.ts, api.exception.ts,
                               all-exceptions.filter.ts — every thrown error
                               becomes exactly a @contracts/common
                               ContractError
    src/common/validation/    validation.ts — Standard Schema issues →
                               ContractError (INVALID_PAYLOAD /
                               UNSUPPORTED_CONTRACT_VERSION)
    src/common/http/          json-body.middleware.ts — JSON-only
                               content-type guard (415) + the 16kb body
                               limit's constant
    src/common/logging/       logger.ts (AppLogger: JSON logs carrying
                               requestId/correlationId automatically),
                               request-log.middleware.ts
    src/common/request-context/  AsyncLocalStorage-backed request/
                               correlation ids; X-Request-Id always
                               server-generated, X-Correlation-Id echoed if
                               valid else generated
    src/common/immutability/  deep-freeze.ts — the one recursive freeze every
                               repository (in-memory and Postgres) applies to
                               what it returns
    src/common/persistence/   transaction-runner.ts (abstract port),
                               in-memory-transaction-runner.ts (test adapter,
                               no atomicity) — Phase 10
    src/database/             Phase 10 — database-client.ts (pool, ambient
                               transaction, boot check), database.module.ts,
                               postgres-transaction-runner.ts,
                               database.schema.ts (table types),
                               persistence.errors.ts (driver error → code +
                               constraint only; 503 when unreachable),
                               migrations/ (0001_initial_schema.ts, index.ts),
                               migrator.ts, menu-seed.ts, cli/ (migrate.ts,
                               seed.ts)
    src/health/               health.module.ts, health.controller.ts (GET
                               /health, unversioned), health.service.ts
    test/                     app.e2e.test.ts, validation.e2e.test.ts,
                               menu.e2e.test.ts, cart.e2e.test.ts,
                               order.e2e.test.ts (real
                               HTTP via listen(0) +
                               fetch, no supertest; on the in-memory test
                               adapters via support/in-memory-persistence.ts),
                               persistence.e2e.db.test.ts (the same stack on
                               PostgreSQL), db-global-setup.ts,
                               support/test-database.ts,
                               fixtures/validation-fixture.controller.ts
                               (test-only, proves the pipeline against a
                               real @contracts/agent-intents schema)
    src/modules/menu/         the first domain module (Phase 7) —
                               menu.controller.ts, menu.service.ts,
                               menu.mapper.ts, menu.module.ts
      domain/                 menu.types.ts, menu.invariants.ts,
                               menu.errors.ts (MenuItemNotFoundError),
                               menu.repository.ts (abstract MenuRepository)
      infrastructure/         menu.seed.ts (temporary copy of the web
                               fixture, plus categoryId),
                               in-memory-menu.repository.ts (test adapter),
                               postgres-menu.repository.ts
    src/modules/cart/         the second domain module and the first with
                               writes (Phase 8) — cart.controller.ts,
                               cart.service.ts, cart.mapper.ts,
                               cart.module.ts, cart.contract-compat.test.ts
                               (every agent intent ↔ a Cart route)
      domain/                 cart.types.ts, cart.operations.ts (pure
                               add/set/remove/clear), cart.pricing.ts
                               (priceCart — live menu price),
                               cart.invariants.ts, cart.errors.ts, and three
                               abstract ports: cart.repository.ts,
                               cart-catalog.ts, cart-owner.resolver.ts
      infrastructure/         in-memory-cart.repository.ts (test adapter),
                               postgres-cart.repository.ts (optimistic
                               version check as a guarded UPDATE),
                               menu-catalog.adapter.ts
                               (→ MenuService.findItemById),
                               single-user-cart-owner.resolver.ts
    src/modules/order/        the third domain module (Phase 9) —
                               order.controller.ts, order.service.ts,
                               order.mapper.ts, order.module.ts
      domain/                 order.types.ts, order.create.ts (pure
                               createOrder — snapshot + totals —
                               and isSameOrderRequest), order.invariants.ts,
                               order.errors.ts, and four abstract ports:
                               order.repository.ts, checkout-cart.ts,
                               order-owner.resolver.ts, order-id.generator.ts
      infrastructure/         in-memory-order.repository.ts (test adapter),
                               postgres-order.repository.ts (unique id and
                               owner+key as constraints), cart-checkout.adapter.ts
                               (→ CartService.prepareCheckout /
                               completeCheckout), cart-owner.adapter.ts
                               (→ CartOwnerResolver), uuid-order-id.generator.ts
packages/
  contracts/
    common/         scaffolded, working (Phase 5) — shared primitives, no
                     consumer of its own: contractVersion, menu identifiers,
                     quantity, integer-cents money, correlation id,
                     idempotency key, ISO-8601 timestamp, structured error
    ui-commands/    scaffolded, working — what the screen should do (ai-service → web)
                     5 commands: ShowMenuCategory, HighlightItem, OpenCartPanel,
                     ShowItemDetail, SearchMenu — unchanged since Phase 2;
                     Phase 5 hardened all five (strict objects, bounded
                     SearchMenu.query) and added a batch envelope
    agent-intents/  scaffolded, working (Phase 5) — what should happen to
                     commerce (ai-service → commerce-api): AddItemToCart,
                     RemoveItemFromCart, SetCartItemQuantity; a single-intent
                     request envelope with an idempotency key
    api-contracts/  scaffolded, working (Phase 7) — request/response shapes
                     (commerce-api → everyone): menu.ts (Phase 7 —
                     menuResponseSchema / menuItemResponseSchema) and
                     cart.ts (Phase 8 — the first request schemas, plus
                     cartResponseSchema) and order.ts (Phase 9 —
                     createOrderRequestSchema, orderResponseSchema,
                     customerDetailsSchema)
    tools/          register-relative-ts.mjs, resolve-relative-ts.mjs — a
                     Node module hook used only by each package's own
                     `build` script (schema generation); not part of any
                     package's exports
infrastructure/
  docker/         compose.yaml — local-development PostgreSQL only (Phase 10),
                   postgres/init/01-create-test-database.sql
  database/  kubernetes/              empty; deliberately deferred
docs/
  architecture/  product/  api/  decisions/  development/
  api/contracts.md                         contract naming, worked examples,
                                            the declined-candidate register
  api/commerce-api.md                      HTTP conventions, error codes,
                                            headers, status table
  features/phase-1-web-foundation/         requirements.md, plan.md, test-plan.md
  features/phase-2-menu-browsing/          requirements.md, plan.md, test-plan.md
  features/phase-3-frontend-cart-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-4-frontend-checkout-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-5-contract-foundation/    requirements.md, plan.md, test-plan.md
  features/phase-6-commerce-api-foundation/  requirements.md, plan.md, test-plan.md
  features/phase-7-menu-domain/              requirements.md, plan.md, test-plan.md
  features/phase-8-cart-domain/              requirements.md, plan.md, test-plan.md
  features/phase-9-order-domain/             requirements.md, plan.md, test-plan.md
  features/phase-10-database-persistence/  requirements.md, plan.md, test-plan.md
.claude/          ForgeFlow — rules, commands, agents, skills, workflows
```

## Before writing any code

Read, in this order:

1. `CLAUDE.md` — the specification of record.
2. [`docs/architecture/system-architecture.md`](../architecture/system-architecture.md)
   — the component boundaries, and specifically §4, which is the part that is
   easy to break by accident.
3. [`docs/architecture/architecture-decisions.md`](../architecture/architecture-decisions.md)
   — what has been decided, and what is merely proposed. A `Proposed` ADR is
   not permission.
4. `.claude/rules/core.md` and `.claude/rules/scope-control.md`.

## Explicitly temporary code

None is left in `apps/web`. The last one,
`src/lib/commands/simulate.ts` (see
[`docs/product/food-ordering-frontend-mvp.md`](../product/food-ordering-frontend-mvp.md)
§7), was deleted in Phase 15, when the chat switched to real
`apps/ai-service` output (ADR-0022). Its phrases live on in ai-service's
simulated model, which is itself a stand-in until a model provider exists.

The other three — the fixture menu, the client-side cart and pricing, and
the simulated order (`order.ts`, `orderId.ts`) — were deleted in Phase 11,
when `apps/web` switched to `commerce-api` (ADR-0018; ADR-0011's violation
is closed). `src/lib/state/cartStore.tsx` remains, as a holder of the
backend's cart rather than a cart of its own. `src/test/fixtures/menu.ts`
is test data, not scaffolding.

## Next step

Phase 1 (sub-phases 1.1–1.4), Phase 2 (sub-phases 2.1–2.4), Phase 3
(sub-phases 3.1–3.5), Phase 4 (sub-phases 4.1–4.5), Phase 5 (sub-phases
5.1–5.4), Phase 6 (sub-phases 6.1–6.5), Phase 7 (sub-phases 7.1–7.4), and
Phase 8 (sub-phases 8.1–8.5), Phase 9 (sub-phases 9.1–9.5), Phase 10
(sub-phases 10.1–10.5) and Phase 11 (sub-phases 11.1–11.5) are
all implemented: workspace foundation, the `ui-commands` contracts package
(5 commands, unchanged since Phase 2), the menu UI with search and item
detail, real loading/error states via an async `getMenu()` seam, a complete
frontend-only cart (add/remove/increase/decrease, subtotals, item count, a
`/cart` route with cross-route persistence), the validated command pipeline
with its adversarial rejection path, a frontend-only checkout simulation
(`/checkout`: customer-details form, review, a simulated order confirmation,
and clearing the cart on success) that knowingly and temporarily violates
the order-state authority model — recorded in ADR-0011, not hidden — a
contract foundation: shared primitives (`@contracts/common`), a hardened and
enveloped `ui-commands`, and `@contracts/agent-intents` with three cart
intents, all with committed, freshness-tested JSON Schema (ADR-0012), a
NestJS commerce-api foundation: a Vite + SWC toolchain running the contract
packages' raw-TypeScript source unmodified, Zod-validated configuration,
request validation against the Phase 5 contract schemas (Nest's built-in
Standard Schema pipe), a structured error model (`@contracts/common`'s own
`ContractError`, nothing else), request correlation and JSON logging, URI
versioning, and `GET /health` (ADR-0013), and now a read-only Menu domain:
a new `@contracts/api-contracts` package, an in-memory `MenuRepository`
behind an abstract interface, `GET /v1/menu` and
`GET /v1/menu/items/:itemId`, and a shared `DomainError` base for turning a
domain module's own error into an HTTP response (ADR-0014), and now a Cart
domain: server-resolved single-owner identity, live menu pricing, an
in-memory repository with an optimistic version check, and the four
`/v1/cart` routes that execute the three adopted intents (ADR-0015), and
an Order domain: immutable snapshots of the priced cart, idempotent creation
by a required key, and `POST /v1/orders` / `GET /v1/orders/:orderId`
(ADR-0016), and now PostgreSQL persistence behind all three repository
interfaces, with reversible migrations, an idempotent menu seed, and cart
consumption plus order storage in one database transaction (ADR-0017), and
now `apps/web` on commerce-api: a same-origin proxy, one validating API
client, a cart provider that holds only the backend's cart, and checkout
placing real, idempotent orders (ADR-0018).

Payment, authentication, and order status changes are not planned yet.
Phase 12 (sub-phases 12.1–12.4) built the `apps/ai-service` foundation
(ADR-0019), with no AI behaviour. Phase 13 added LangGraph orchestration
on top of it (ADR-0020): a linear two-node graph, a simulated model behind
LangChain's `BaseChatModel`, and `POST /v1/agent/turns`. Phase 14 added the
Commerce API client, five tools and a bounded tool loop (ADR-0021), and built
the Pydantic codegen for `api-contracts`. The next phases are AI → UI
commands (Phase 15) and a real model provider (provider configuration and
`SecretStr` keys, only under `ai_service/llm/`). An idempotency key for
cart adds is the recorded prerequisite for the latter.

Start planning any of them with `/forge`, which will route it to `/plan`.
