# Requirements — Phase 10: Database Integration & Persistence

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the
full plan including OD1–OD16 and a recommendation on each; the recommendations
are therefore the decisions)
**Risk:** HIGH
**Path:** Full

## Problem

Every piece of commerce state in `apps/commerce-api` lives in process memory.
That covers the menu (`InMemoryMenuRepository` over `MENU_SEED`), carts
(`InMemoryCartRepository`, a `Map`) and orders (`InMemoryOrderRepository`,
two `Map`s). All of it is lost on restart. `system-architecture.md` §8 gap 1
says "the database is unchosen". ADR-0004 simulated persistence behind
repository ports so that adding a database "changes one implementation, not
the domain layer". It also recorded a risk: an in-memory store makes
transactional semantics look easier than they are.

ADR-0016 and the Phase 9 review (finding #7) turned that risk into a hard
requirement for this phase. Consuming the cart and storing the order are two
writes. A database adapter **must** make them one transaction, or a failure
between them clears the cart and creates no order.

## Goal

PostgreSQL sits behind the existing `MenuRepository`, `CartRepository` and
`OrderRepository` ports. The schema comes from reviewed, reversible
migrations. The menu is seeded from the existing seed data. Placing an order
consumes the cart and stores the order in one database transaction. HTTP
behaviour is otherwise unchanged. All state survives a restart. Only
`apps/commerce-api` can reach the database.

## Risk assessment (Full Path)

- **Classification:** HIGH, set by three dimensions.
  - Data: first schema, migrations, and durable personal data.
  - Infrastructure: a new runtime dependency and a local database container.
  - Scope: a new persistence layer across all three domains, plus a new
    transaction boundary.
- **Blast radius:** every `commerce-api` route except `GET /health`. If
  persistence is wrong, menu reads, cart writes and order placement all fail
  or diverge. No consumer is wired yet (`apps/web` still uses its own
  simulation, and `ai-service` does not exist), so nothing outside
  `commerce-api` is affected.
- **Reversibility:** good at the code level. The in-memory adapters stay in
  the tree, so reverting the three module bindings restores Phase 9
  behaviour. Schema changes are reversible through `down` migrations in
  development. There is no production data, so there is nothing to lose
  beyond a developer's local volume.
- **Detection:**
  - Repository tests and migration tests run against a real Postgres.
  - A full-stack DB-backed e2e suite checks the same flows.
  - A failure-injection test proves the order transaction rolls back.
  - Boot fails fast when the database is unreachable.

## In scope

- PostgreSQL as the database, pending OD1. Accessed through Kysely over
  `pg`, pending OD2.
- A database module: configuration, connection pool, lifecycle, a boot-time
  connectivity check, and an ambient-transaction mechanism.
- A `TransactionRunner` port, with a Postgres implementation and an in-memory
  pass-through.
- An initial schema migration: menu, carts, orders, with keys, constraints
  and indexes. Also a migration runner (up and down) and an idempotent menu
  seed command.
- `PostgresMenuRepository`, `PostgresCartRepository` and
  `PostgresOrderRepository`, each implementing its existing port unchanged.
- The order-placement transaction: cart consumption and order storage are
  atomic.
- Mapping database errors to sanitized internal errors, plus one additive
  503 code for "database unavailable".
- A local development database via Docker Compose (Postgres only), with a
  separate test database.
- A DB-backed test suite: migrations, seed, repositories, transactions, and
  a full-stack e2e. It uses its own script and fails loudly when the database
  is absent.
- Keeping the existing DB-free test suite green. The in-memory adapters stay
  as test doubles.
- An ESLint boundary that keeps domain code free of database imports.
- Documentation: ADR-0017 and ADR-0004's status, `system-architecture.md`,
  `commerce-api.md`, `getting-started.md`, the `commerce-api` README, the
  product doc's persistence notes, and `.env.example`.

## Out of scope

Everything the brief excludes:

- frontend → backend integration, Python AI, LangChain/LangGraph, OpenAI,
  RAG, voice, MCP;
- payments, authentication, authorization, customer accounts,
  notifications, delivery tracking;
- Redis, Kafka, RabbitMQ, microservices, Kubernetes, production deployment,
  cloud, CI/CD, a production observability stack.

This phase also does **not** do the following:

- Change any wire contract (`@contracts/*`), route, or request/response
  shape. The one exception is the additive 503 error code (OD9).
- Change any business rule from Phases 7–9: pricing, availability,
  idempotency, the version check, or snapshot semantics.
- Add a menu write API or menu administration.
- Add a readiness endpoint (OD15), order listing, or order-status
  transitions.
- Add a data-retention policy, backups, a least-privilege role split, TLS to
  the database, or secret management. All are recorded as deferred.
- Add idempotency to `POST /v1/cart/items` (§8 gap 3 stays open).
- Add distributed locking or distributed transactions.
- Add a runtime in-memory/Postgres switch (OD3).

## Acceptance criteria

- [x] **AC1** — `pnpm --filter commerce-api db:migrate` applies the initial
  migration to an empty database. The migration test then asserts every
  table, column type, nullability, primary key, foreign key, unique
  constraint, check constraint and index listed in `plan.md` §5.
- [x] **AC2** — Migrations are reversible and repeatable. Migrating up,
  then all the way down, leaves no application tables. Migrating up again
  gives the same schema. Running `db:migrate` twice is a no-op the second
  time. All of this is asserted by the migration test.
- [x] **AC3** — `pnpm --filter commerce-api db:seed` loads exactly
  `MENU_SEED`: 3 categories and 6 items in display order, with `gelato`
  unavailable. Running it twice leaves the same rows, with no duplicates.
  Asserted by the seed test.
- [x] **AC4** — With the database bound, `GET /v1/menu` and
  `GET /v1/menu/items/:itemId` return responses identical to the Phase 9
  in-memory responses for the seeded menu. The DB e2e compares against the
  same expectations the in-memory e2e uses.
- [x] **AC5** — `PostgresCartRepository` meets the `CartRepository`
  contract:
  - `findByOwner` returns `undefined` for an unknown owner;
  - line order, quantities and timestamps round-trip;
  - version 1 inserts;
  - version N+1 updates only when version N is stored;
  - any other version throws `CartVersionConflictError` and stores nothing;
  - of two concurrent saves at the same version, exactly one succeeds.
- [x] **AC6** — `PostgresOrderRepository` meets the `OrderRepository`
  contract:
  - create and read round-trip every field, including an absent email,
    which stays absent;
  - reads are owner-scoped;
  - a duplicate id or a duplicate (owner, idempotencyKey) throws
    `OrderAlreadyExistsError` and stores nothing.
- [x] **AC7** — Order placement is atomic. If storing the order fails after
  the cart was consumed, the transaction rolls back: the cart keeps its lines
  and version, and no order row exists. Proven against the real database by
  failure injection.
- [x] **AC8** — Concurrency holds on the real database:
  - two concurrent placements from one cart version produce exactly one
    order;
  - the other gets 409 `CART_CONFLICT` and nothing is ordered;
  - a cart edit that commits between pricing and consumption also gives 409.
- [x] **AC9** — Order snapshots stay historical. After an order is placed,
  change that item's price and name in `menu_items`. `GET /v1/orders/:id`
  is unchanged. `GET /v1/cart` for a new cart holding the item shows the new
  price and name. (This closes the Phase 9 review LOW #1 gap end-to-end.)
- [x] **AC10** — Consistency rules from Phases 8 and 9 are unchanged on the
  database:
  - a cart line whose item is made unavailable is flagged `available: false`
    and still counted;
  - a line whose item row is deleted is omitted from the priced cart;
  - placing an order containing either kind of line is 422
    `MENU_ITEM_UNAVAILABLE`.
- [x] **AC11** — State survives a restart. Build, start, add to the cart,
  place an order, restart, and the order is still readable by id. A
  same-key replay after the restart returns the original order. Checked by
  the DB e2e (a new app instance on the same database) and by a manual
  `start` + `curl` walk.
- [x] **AC12** — No raw database error reaches a client or a log line with
  row data:
  - a connectivity failure is 503 `SERVICE_UNAVAILABLE` with a static
    message;
  - any other database failure is 500 `INTERNAL_ERROR`;
  - the logged error carries operation, SQLSTATE and constraint name only,
    never `detail`, parameters, or customer data.
  Asserted by unit tests on the mapper and one DB e2e.
- [x] **AC13** — Configuration:
  - `DATABASE_URL` is required and validated;
  - an invalid or missing value exits non-zero, naming the field and never
    the value;
  - boot fails fast when the database is unreachable;
  - no real credential is committed, and `.env.example` holds only the
    documented local-dev value that matches the Compose file.
- [x] **AC14** — Layering holds:
  - `modules/*/domain/**`, the services, controllers and mappers import
    nothing from `kysely`, `pg`, or `src/database/`;
  - ESLint enforces this, and a temporary violating import was shown to
    fail lint, then removed;
  - the only Phase 9 service change is `OrderService` depending on the
    abstract `TransactionRunner`.
- [x] **AC15** — The existing DB-free suite (`pnpm turbo run test`) still
  passes without a database. Pre-existing tests change only in wiring:
  module bindings, the e2e harness override, and one added constructor
  argument. No behavioural assertion is weakened, and each change is listed
  in the implementation report.
- [x] **AC16** — The DB suite (`pnpm --filter commerce-api test:db`) passes
  against the Compose database. With no database reachable it **fails** with
  a message naming the fix. It never skips or passes.
- [x] **AC17** — No component other than `commerce-api` has a database
  dependency, connection string, or credential. `apps/web` and
  `packages/contracts` are unchanged (`git diff --stat` is empty for them).
- [x] **AC18** — Full validation (lint, typecheck, test, build) plus
  `test:db` and a built `start` + `curl` walk against the database are run
  and recorded. The docs listed in `plan.md` §27 are updated. ADR-0017 is
  recorded, and ADR-0004's status is updated.

Verified 2026-09-25. Evidence for each AC is in `plan.md` §34 (the status
line under each sub-phase) and in the 10.1–10.5 implementation reports.

## Open questions

The decisions OD1–OD16 are in `plan.md` §33, each with a recommendation. The
ones that most change the work:

- **OD1 / OD2:** PostgreSQL + Kysely, rather than MongoDB, or Prisma,
  Drizzle or TypeORM.
- **OD3:** Postgres is the only runtime binding. In-memory adapters stay as
  test doubles only, with no runtime switch.
- **OD10 / OD12:** a separate `test:db` suite against a Compose database.
  The existing e2e suite stays DB-free.
- **OD11:** the Compose file goes in `infrastructure/docker/`, the directory
  reserved for it.
