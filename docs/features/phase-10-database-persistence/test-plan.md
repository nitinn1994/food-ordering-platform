# Test Plan — Phase 10: Database Integration & Persistence

There are two suites:

- **DB-free** (`pnpm turbo run test`): runs anywhere, is unchanged in
  spirit, and includes all pre-existing tests.
- **DB** (`pnpm --filter commerce-api test:db`): runs against the Compose
  Postgres `commerce_test` database. Its files are named `*.db.test.ts`.
  They run serially, and the global setup resets the schema and migrates.

The DB suite **fails** when the database is unreachable. It never skips.

## What will be tested

| AC | How it is verified | Suite | Type |
| --- | --- | --- | --- |
| AC1 | `migrations.db.test.ts`: after migrating to latest, query `information_schema.columns`, `pg_constraint` and `pg_indexes`, and assert every table, column type and nullability, PK, FK, unique, check and index in plan §5 | DB | automated |
| AC2 | `migrations.db.test.ts`: up → down to zero (no app tables) → up (same schema snapshot); a second `migrateToLatest` reports no migrations run | DB | automated |
| AC3 | `menu-seed.db.test.ts`: seed, then assert exact rows and positions equal `MENU_SEED` and `gelato.available = false`; seed again, same rows and counts | DB | automated |
| AC4 | `persistence.e2e.db.test.ts`: `GET /v1/menu` and `/v1/menu/items/:id` bodies equal the expectations in `test/menu.e2e.test.ts` | DB | automated |
| AC5 | `postgres-cart.repository.db.test.ts`: contract cases, plus `Promise.all` of two saves at the same version → exactly one fulfilled, one `CartVersionConflictError`, stored version +1 | DB | automated |
| AC6 | `postgres-order.repository.db.test.ts`: round-trip (with and without email), owner scoping, duplicate id / (owner, key) → `OrderAlreadyExistsError`, and no orphan `order_lines` | DB | automated |
| AC7 | `persistence.e2e.db.test.ts` + `postgres-transaction-runner.db.test.ts`: `OrderIdGenerator` is overridden to reuse an existing order id, so `create` fails after `consume`. Result: 500, and the cart's lines and version are unchanged, with one order row total. **Mutation check:** the test fails with `run` removed from `OrderService`, recorded in 10.4 | DB | automated + recorded mutation |
| AC8 | e2e: two parallel `POST /v1/orders` → one 201 and one 409 `CART_CONFLICT`, with one order row. Deterministic variant: a second connection holds `SELECT … FOR UPDATE` on the `carts` row while a placement starts, then commits a version bump → 409 | DB | automated |
| AC9 | e2e: place an order; `UPDATE menu_items SET price_cents, name`; `GET /v1/orders/:id` is unchanged; add the item to the cart again, and `GET /v1/cart` shows the new values | DB | automated |
| AC10 | e2e: set `available = false` → the cart line is flagged and counted, and the order is 422 `MENU_ITEM_UNAVAILABLE`; delete a `menu_items` row → the line is omitted from the cart, and the order is 422 | DB | automated |
| AC11 | e2e: close the app, build a new one on the same database → the order is readable, a same-key replay returns the same `orderId`, and the cart state persists. Also manual check 6 below | DB + manual | automated + manual |
| AC12 | `persistence.errors.test.ts`: each SQLSTATE class maps as in plan §14; the resulting message and serialized error contain no `detail`, parameters or customer values. e2e: pool against an unreachable port → 503 `SERVICE_UNAVAILABLE`, static body | DB-free + DB | automated |
| AC13 | `env.schema.test.ts`: missing or invalid `DATABASE_URL` and an out-of-range `DATABASE_POOL_MAX` are rejected, naming the field and never the value. e2e: boot against an unreachable URL rejects. Manual: `grep` shows no credential other than the documented dev value | DB-free + DB + manual | automated + manual |
| AC14 | `pnpm turbo run lint` passes. Record a temporary import of `kysely` in `cart/domain/`, and of `apps/web` in commerce-api (the pre-existing ban), each failing lint, then removed. Plus `grep` for `kysely`, `pg` and `database/` under `modules/*/domain`, services, controllers and mappers | DB-free | automated + recorded manual |
| AC15 | `pnpm turbo run test` with **no database running**. The diff of pre-existing test files is reviewed: wiring-only, listed in the implementation report | DB-free | automated + review |
| AC16 | `pnpm --filter commerce-api test:db` passes with `db:up`. With `db:down`, it fails with the actionable message (output recorded) | DB | automated + recorded manual |
| AC17 | `git diff --stat -- apps/web packages/contracts` is empty; `grep` shows `DATABASE_URL`, `kysely` and `pg` appear only under `apps/commerce-api`, `infrastructure/docker` and docs | — | manual |
| AC18 | Full validation table below, plus the manual walk; docs and ADR review | all | manual |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| Error mapping | AC12 | `src/database/persistence.errors.test.ts` (new) |
| Env additions | AC13 | `src/config/env.schema.test.ts` (modified: additive cases) |
| Migrations up/down/idempotent + schema assertions | AC1, AC2 | `src/database/migrations.db.test.ts` (new) |
| Transaction runner commit/rollback/nesting | AC7 (unit of) | `src/database/postgres-transaction-runner.db.test.ts` (new) |
| Menu seed | AC3 | `src/database/menu-seed.db.test.ts` (new) |
| Postgres Menu repository | AC4 (repository level) | `src/modules/menu/infrastructure/postgres-menu.repository.db.test.ts` (new) |
| Postgres Cart repository | AC5 | `src/modules/cart/infrastructure/postgres-cart.repository.db.test.ts` (new) |
| Postgres Order repository | AC6 | `src/modules/order/infrastructure/postgres-order.repository.db.test.ts` (new) |
| Full-stack persistence e2e | AC4, AC7–AC12 | `test/persistence.e2e.db.test.ts` (new) |
| `OrderService` runs consume + create inside `run`; failure propagates | AC7 (service level) | `src/modules/order/order.service.test.ts` (modified: constructor argument + 1 test) |
| Module bindings → `Postgres*`, `TransactionRunner` | AC14 | `src/modules/{menu,cart,order}/*.module.test.ts`, `src/app.module.test.ts` (modified: binding assertions and imports) |
| DB-free HTTP e2e | AC15 | `test/{app,menu,cart,order,validation}.e2e.test.ts` (modified: `buildApp` applies `test/support/in-memory-persistence.ts`) |

Every pre-existing test not listed here stays byte-for-byte unchanged.
No pre-existing assertion is removed or weakened.

## Validation commands

Only commands the project declares. The rows marked *new* become declared in
sub-phase 10.1, and are `NOT_CONFIGURED` until then.

| Check | Command | Expected |
| --- | --- | --- |
| format | — | NOT_CONFIGURED |
| lint | `pnpm turbo run lint` | PASS |
| types | `pnpm turbo run typecheck` | PASS |
| test (DB-free) | `pnpm turbo run test` | PASS, with no database running; the 674 pre-existing tests unchanged in outcome, plus new ones |
| build | `pnpm turbo run build` | PASS (the pre-existing turbo "no output files" warning for contracts is known) |
| database up | `pnpm --filter commerce-api db:up` *(new)* | container healthy |
| migrate / seed | `pnpm --filter commerce-api db:migrate` / `db:seed` *(new)* | PASS; idempotent on re-run |
| test (DB) | `pnpm --filter commerce-api test:db` *(new)* | PASS |
| CI | — | NOT_CONFIGURED (no `.github/`) |

Between sub-phases the runs are targeted (`pnpm --filter commerce-api test`,
`pnpm --filter commerce-api test:db`) and reported as targeted. The full set
runs before `/review`. If the Docker daemon is unavailable, every DB row is
reported as blocked, not `PASS` or `SKIPPED` (Risk R1).

## Manual checks

Against `pnpm --filter commerce-api build && pnpm --filter commerce-api start`
(http://127.0.0.1:3001), after `db:up`, `db:migrate` and `db:seed`:

1. `GET /v1/menu` → 3 categories, 6 items; `gelato` unavailable.
2. `POST /v1/cart/items {tiramisu ×2}` → 201; `GET /v1/cart` shows it.
3. **Restart** the server; `GET /v1/cart` still shows `tiramisu ×2`.
4. `POST /v1/orders` with a key and customer → 201; `GET /v1/cart` is
   empty.
5. `psql` (or `docker compose exec postgres psql`): `SELECT` from `orders`
   and `order_lines` shows the snapshot. `carts.version` was bumped and the
   row kept.
6. **Restart**; `GET /v1/orders/<id>` → the same body. Repeating step 4's
   POST gives the same `orderId` (replay across a restart; Phase 9's
   "restart → 404" is intentionally inverted).
7. The same key with a different name → 409 `IDEMPOTENCY_KEY_REUSED`.
8. `db:down` with the server running → `GET /v1/menu` → 503
   `SERVICE_UNAVAILABLE`, static body; the server log line contains no URL
   and no row data.
9. Start the server with the database down → the process exits non-zero with
   a sanitized message.
10. `git status` shows no `.env`; `grep -r "commerce:commerce"` matches only
    `compose.yaml`, `.env.example` and docs.

## Not covered

- **Production concerns:** TLS to the database, role separation, secret
  management, backups and PITR, connection-pool tuning under load, and
  production migration rollback policy. All are deferred by scope.
- **Migrations against a populated older schema.** There is only one
  migration, so there is nothing to upgrade from yet.
- **Menu changes over HTTP.** There is no menu write API. Menu-change cases
  are driven by SQL in tests.
- **Multi-owner isolation beyond repository-level owner scoping.** The
  system is single-user until authentication.
- **The `ai-service` boundary.** The service does not exist. §4.1 is checked
  by `grep` and review only; there is no mechanical enforcement (§8 gap 2
  stays open).
- **Any consumer (`apps/web`, `ai-service`).** None is wired, by design.
