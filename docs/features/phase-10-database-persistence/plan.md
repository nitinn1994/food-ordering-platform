# Plan — Phase 10: Database Integration & Persistence

**Approval Status:** APPROVED (2026-09-25, OD1–OD16 as recommended)

Labels:

- **[EXISTING]** — an inherited decision, with its source.
- **[PROPOSED]** — this plan's design.
- **[ODn]** — a decision in §33 that needs approval.
- **[DEFERRED]** — deliberately not done.

### Findings from inspection that correct or sharpen the brief

1. **No database was ever chosen.**
   - `system-architecture.md` §2 lists the database as "TBD (simulated in
     early phases)", and §8 gap 1 says "the database is unchosen".
   - `phase-0-discovery.md` §6 mentions "the swap to Postgres/Prisma later",
     but only as a rationale aside. It is not an ADR, and it was never
     accepted.
   - So the choice is evaluated here (§3–§4, OD1). It is not inherited.
2. **The transaction requirement already exists.**
   - ADR-0016 says "a database adapter must make cart consumption and order
     storage one transaction".
   - Phase 9 `review-report.md` finding #7 says to carry that "into the
     database phase's plan as a hard requirement".
   - This is AC7.
3. **The two writes cross module boundaries.**
   - The cart is consumed by `CartService.completeCheckout` →
     `CartRepository.save` (Cart module).
   - The order is stored by `OrderRepository.create` (Order module).
   - Order reaches Cart only through its `CheckoutCart` port.
   - A transaction therefore cannot live inside one repository. It needs a
     boundary both repositories can join without either port changing (§12,
     OD4).
4. **The cart port already specifies its SQL.** `CartRepository.save`
   describes itself as "`UPDATE … WHERE version = :expected` (or an insert
   that fails on an existing row)" (ADR-0015 §4). `OrderRepository.create`
   describes "unique constraints on `id` and `(owner_id,
   idempotency_key)`". The Postgres adapters implement exactly those
   contracts. The ports do not change.
5. **Menu is read-only, and nothing writes it.**
   - There is no menu write API.
   - The "product changed" consistency cases (§13) can only arise through
     the seed command or direct SQL. They were unreachable over HTTP in
     Phases 8 and 9.
   - With a database they become testable at repository/e2e level by
     updating rows directly. They stay unreachable through the API.
6. **Cart lines must not be foreign-keyed to menu items.** Phase 8/9
   semantics depend on a stored line surviving its item leaving the menu:
   `priceCart` drops it, and `createOrder` counts it in `unpricedLineCount`
   and refuses to place the order. The FK options each break this:
   - `ON DELETE CASCADE` would silently delete the line, so the order would
     succeed *without* it. That violates ADR-0016's "never silently left
     out".
   - `RESTRICT` would invent a new business rule: an item in any cart could
     not be removed.
   So there is no FK (OD6).
7. **Phase 9 has no separate validation, final-review or completion-summary
   files.** It has `requirements.md`, `plan.md`, `test-plan.md` and
   `review-report.md` (verdict APPROVE; no BLOCKER, HIGH or MEDIUM
   findings; security PASS, data PASS). The recorded baseline is 674 tests,
   279 of them in `commerce-api` (`getting-started.md`). The suite was not
   re-run during planning.
8. **The toolchain was flagged in advance.** ADR-0013 says: "Whether
   `vite build`'s inlining strategy continues to work cleanly … once a real
   database client is added as a dependency, is not yet known."
   `vite.config.ts` externalizes every non-`@contracts/*` package, so
   `kysely` and `pg` should load from `node_modules` at runtime. This is
   unverified until 10.5 (build + start).
9. **Docker is installed, but the daemon was not running when this plan
   was inspected.** The installed versions are Docker 29.8.1 and Compose
   v5.4.0; the Docker Desktop socket was absent. No local Postgres binary
   is installed. The DB test suite needs the daemon at implementation time
   (Risk R1).
10. **`@nestjs/*` is at v12 and Node is v24.19.0.** Nothing in this plan
    depends on a Nest-specific persistence package.

---

## 1. Objective

Put PostgreSQL behind the existing repository ports, so that commerce state
is durable and order placement is atomic. The controller → service → domain
→ port layering from ADR-0013 §8 stays intact:

```text
Controller → Application Service → Domain (pure)
                    │
                    ▼
          Repository port (abstract class, unchanged)
            ├── InMemory*Repository   (kept: unit/service tests, DB-free e2e)
            └── Postgres*Repository   (new: runtime binding)
                    │
                    ▼
               PostgreSQL  ← reachable only from apps/commerce-api
```

## 2. Existing persistence architecture [EXISTING, verified by reading]

| Port | Methods | Adapter today | Contract notes |
| --- | --- | --- | --- |
| `MenuRepository` | `listCategories()`, `findItemById(id)` | `InMemoryMenuRepository`: `MENU_SEED`, cloned, invariant-checked at construction, deep-frozen | Categories nested with items, in display order; `undefined` for "not found" |
| `CartRepository` | `findByOwner(owner)`, `save(cart)` | `InMemoryCartRepository`: `Map<owner, Cart>`, cloned in and out, frozen | Whole-aggregate; `save` accepts only `stored.version === cart.version - 1` (0 when absent), otherwise `CartVersionConflictError` |
| `OrderRepository` | `create(order)`, `findById(owner, id)`, `findByIdempotencyKey(owner, key)` | `InMemoryOrderRepository`: two `Map`s | Insert-only; duplicate id or (owner, key) → `OrderAlreadyExistsError` (plain `Error` → 500); owner-scoped reads |

These ports are abstract classes and double as Nest DI tokens. Each is bound
in its own module with `{ provide: Port, useClass: Adapter }`. Services
depend only on ports. Cross-domain reads use consumer-owned ports:

- `CartCatalog` → `MenuCatalogAdapter` → `MenuService.findItemById`;
- `CheckoutCart` → `CartCheckoutAdapter` → `CartService.prepareCheckout` and
  `completeCheckout`.

`OrderService.placeOrder` runs these steps: resolve owner → idempotency
lookup → load priced cart → pure `createOrder` → `consume(version)` →
`create(order)`. The last two are the non-atomic pair.

Two pieces of existing infrastructure are reused:

- `AsyncLocalStorage` (`common/request-context/request-context.ts`);
- `deepFreeze` (`common/immutability/deep-freeze.ts`).

## 3. Database technology decision [OD1 — PROPOSED: PostgreSQL]

No existing decision covers this (finding 1). The evaluation below is
against *this* project's actual requirements.

| # | Criterion | What this project actually needs | PostgreSQL | MongoDB |
| --- | --- | --- | --- | --- |
| 1 | Transactions | One atomic unit across two aggregates (cart + order), ADR-0016 | Native, on a single node, with no extra setup | Multi-document transactions need a replica set, even locally. That makes the Compose setup (and every test DB) a replica set |
| 2 | Cart consistency | Optimistic version check as a guarded write (ADR-0015 §4) | `UPDATE … WHERE version = $n` plus the row lock serializes naturally | `updateOne({version})` works for the cart document. Lines would be embedded, which is fine |
| 3 | Order consistency | Unique (owner, key); immutable snapshot | Unique constraint; `CHECK` constraints on cents and quantities | Unique compound index; there is no declarative check on arithmetic (schema validation is JSON Schema only) |
| 4 | Relationships | category 1–N item; order 1–N line; cart 1–N line | Foreign keys | Embedding covers the 1–N cases; category → item would be a manual reference |
| 5 | Menu structure | Small, fixed shape, ordered | Tables with a `position` column | One document, or a collection per level |
| 6 | Future payments | Charge `totalCents` exactly once, linked to an order (ADR-0016) | A payments table in the same transaction as the status change | Possible, with the same replica-set requirement |
| 7 | Query patterns | Key lookups only: by owner, by id, by (owner, key); one menu list | Trivial | Trivial |
| 8 | Data integrity | Integer cents ≥ 0, quantity 1–99, subtotal = unit × qty | Enforced in the schema | Application-only |
| 9 | Indexing | PKs plus one compound unique | Covered by the constraints themselves | Equivalent |
| 10 | Local dev | One container, `docker compose up` | Single container | Single container, but transactions need `--replSet` plus an init step |
| 11 | Testing | A real engine, transactions exercised | Straightforward; `TRUNCATE` between tests | Workable; needs the replica set |
| 12 | Deployment | Not in scope | Every managed cloud offers it | Also widely offered |
| 13 | Scalability | Single restaurant (ADR-0009), single user | Far beyond need | Far beyond need |
| 14 | Developer experience | Typed, readable, reviewable queries | Mature TypeScript tooling (§4) | Mature driver |

**Recommendation: PostgreSQL.** The deciding factors are these:

- **Criterion 1.** The one hard requirement this phase inherits is a
  cross-aggregate transaction. Postgres gives it on a single node with no
  configuration.
- **Criteria 3 and 8.** The domain is fixed-shape, relational money data
  whose invariants a schema can enforce as a second line of defence.

MongoDB's main strength, a flexible document schema, has no requirement
behind it here.

## 4. Database rationale and data-access library [OD2 — PROPOSED: Kysely over `pg`]

| Option | Fit | Against |
| --- | --- | --- |
| **Kysely + `pg`** (recommended) | Typed SQL query builder, not an ORM, so it maps repositories to tables without mirroring classes. Its built-in `Migrator` has `up` and `down`. No code generation, no CLI binary, no engine. Parameters are always bound. Its transaction API (`db.transaction().execute(trx => …)`) fits §12 directly. | Table types are hand-written, so there is a second declaration beside the migrations. Mitigated by the migration test (AC1) and repository tests touching every column. |
| Drizzle + `pg` | Typed schema in TS; good DX | Migrations are generated by `drizzle-kit` diffing, and the schema TS tends to mirror tables as classes. There are no down migrations (conflicts with AC2). |
| Prisma | Popular; `phase-0-discovery.md` once mentioned it (not binding) | Generated client plus a schema DSL, an extra build step in the turbo graph, and more machinery beside the Vite SSR bundle (finding 8). No down migrations. Heavier than 7 repository methods need. |
| TypeORM | Nest-integrated | Decorator entities map TS classes to tables, which is exactly what the brief warns against. It would add a second modelling layer beside the pure domain types. |
| Raw `pg` only | Minimum dependencies | We would hand-write a migration runner and the row typing. |

**Versions:** latest stable of `kysely`, `pg` and `@types/pg` at
implementation time, pinned by the lockfile. This is not verified during
planning: no network or install was allowed.

## 5. Database schema [PROPOSED]

All names are `snake_case`. All timestamps are `timestamptz`. Money is
`integer` cents (OD13). Column bounds come from the existing contracts
(`MAX_ID_LENGTH` 64, `MAX_IDEMPOTENCY_KEY_LENGTH` 128, `MAX_QUANTITY` 99,
order `name` ≤ 80, `fullName` ≤ 100, `phone` ≤ 32, `email` ≤ 254). They are
defensive. The API already validates every one of them at the edge.

```sql
-- Menu
menu_categories (
  id          varchar(64)  PRIMARY KEY,
  name        text         NOT NULL,
  position    integer      NOT NULL UNIQUE CHECK (position >= 0)
)
menu_items (
  id                varchar(64) PRIMARY KEY,
  category_id       varchar(64) NOT NULL REFERENCES menu_categories(id)
                                ON DELETE RESTRICT,
  position          integer     NOT NULL CHECK (position >= 0),
  name              text        NOT NULL,
  description       text        NOT NULL,
  long_description  text        NOT NULL,
  price_cents       integer     NOT NULL CHECK (price_cents >= 0),
  available         boolean     NOT NULL,
  dietary_tags      text[]      NOT NULL DEFAULT '{}',
  allergens         text[]      NOT NULL DEFAULT '{}',
  calories          integer     NOT NULL CHECK (calories >= 0),
  UNIQUE (category_id, position)          -- also serves the list query
)

-- Cart
carts (
  owner_id    varchar(128) PRIMARY KEY,   -- one cart per owner (ADR-0015 §3)
  version     integer      NOT NULL CHECK (version >= 1),
  created_at  timestamptz  NOT NULL,
  updated_at  timestamptz  NOT NULL
)
cart_lines (
  owner_id  varchar(128) NOT NULL REFERENCES carts(owner_id) ON DELETE CASCADE,
  item_id   varchar(64)  NOT NULL,        -- deliberately NO FK to menu_items (OD6)
  position  integer      NOT NULL CHECK (position >= 0),
  quantity  smallint     NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  PRIMARY KEY (owner_id, item_id),        -- one line per item (cart.invariants.ts)
  UNIQUE (owner_id, position)
)

-- Order
orders (
  id                  uuid         PRIMARY KEY,
  owner_id            varchar(128) NOT NULL,
  idempotency_key     varchar(128) NOT NULL,
  status              text         NOT NULL CHECK (status IN ('placed')),
  item_count          integer      NOT NULL CHECK (item_count >= 1),
  subtotal_cents      integer      NOT NULL CHECK (subtotal_cents >= 0),
  total_cents         integer      NOT NULL CHECK (total_cents >= 0),
  customer_full_name  varchar(100) NOT NULL,
  customer_phone      varchar(32)  NOT NULL,
  customer_email      varchar(254) NULL,     -- NULL ⇔ absent, never ''
  created_at          timestamptz  NOT NULL,
  updated_at          timestamptz  NOT NULL,
  UNIQUE (owner_id, idempotency_key),
  CHECK (total_cents = subtotal_cents)       -- Phase 4 D5 / ADR-0016 §1
)
order_lines (
  order_id             uuid        NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  position             integer     NOT NULL CHECK (position >= 0),
  item_id              varchar(64) NOT NULL,   -- historical reference, NO FK (OD6)
  name                 varchar(80) NOT NULL,   -- snapshot
  unit_price_cents     integer     NOT NULL CHECK (unit_price_cents >= 0),
  quantity             smallint    NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_subtotal_cents  integer     NOT NULL
                       CHECK (line_subtotal_cents = unit_price_cents * quantity),
  PRIMARY KEY (order_id, position),
  UNIQUE (order_id, item_id)
)
```

The migration names every constraint explicitly (for example
`orders_owner_idempotency_key_key`), so error mapping (§14) can match on the
constraint name.

**Deliberately absent:**

- **Soft delete.** No requirement deletes anything.
- **An `owners` table.** The owner id is opaque and server-resolved
  (ADR-0015 §1). Auth decides later.
- **A `cart_id`.** The domain keys a cart by owner.
- **An order `version`.** Orders are immutable in Phase 9.
- **`orders.owner_id` → `carts` FK.** An order outlives its cart state.
- **Line-level `created_at`.** The domain has none.

## 6. Menu persistence design [PROPOSED]

- **Storage.** `menu_categories` and `menu_items`. Display order is stored
  as `position`, taken from the array index in `MENU_SEED`. The domain says
  "the order a repository returns items in is the order they render in"
  (`menu.types.ts`).
- **`PostgresMenuRepository.listCategories()`** makes two queries:
  - categories `ORDER BY position`;
  - items `ORDER BY category_id's position, position`.
  It assembles them into `MenuCategory[]` and deep-freezes the result,
  matching the in-memory adapter's immutability.
- **`findItemById(id)`** makes one PK lookup and returns `undefined` when
  there is no row.
- **Freshness.** The adapter reads the database on every call, with no
  cache. A menu change (seed re-run, SQL) therefore reaches carts
  immediately. This is ADR-0015 §2's live-pricing rule.
- **Invariants.** `assertMenuInvariants` still runs on `MENU_SEED` in the
  seed command before writing. The schema makes the same guarantees
  structurally: PK uniqueness of item ids across the whole menu, FK +
  nesting by `category_id`.
- **`MENU_SEED` stays** as the single source for both the in-memory adapter
  and the seed command. Its "temporary duplicate of the web fixture" status
  (ADR-0014) is unchanged.

## 7. Cart persistence design [PROPOSED]

- **Mapping.** `Cart { ownerId, lines[], version, createdAt, updatedAt }` →
  one `carts` row plus N `cart_lines`. Line order is persisted as
  `position = index`.
- **`findByOwner`** makes one query (carts LEFT JOIN cart_lines ORDER BY
  position, or two queries). It returns a frozen `Cart`, or `undefined` if
  there is no `carts` row.
- **`save(cart)`** runs in one transaction. It joins the ambient transaction
  if there is one (§12). Otherwise it opens its own.
  1. If `cart.version === 1`:
     `INSERT INTO carts … ON CONFLICT (owner_id) DO NOTHING RETURNING
     owner_id`. If no row comes back → `CartVersionConflictError`.
  2. Otherwise: `UPDATE carts SET version = $v, updated_at = $u WHERE
     owner_id = $o AND version = $v - 1`. If 0 rows → conflict.
  3. `DELETE FROM cart_lines WHERE owner_id = $o`, then insert every line
     with its `position`. Carts are at most one line per menu item, so this
     is bounded.
  4. Run `assertCartInvariants(cart)` before any SQL, as the in-memory
     adapter does.
- **Why this is correct under concurrency (READ COMMITTED):**
  - Two saves at the same expected version both issue step 2. The first
    takes the row lock. The second blocks until the first commits, then
    re-evaluates its `WHERE`, matches 0 rows, and fails.
  - Two first-inserts race on the PK. `ON CONFLICT DO NOTHING` makes the
    loser see no row.
  - No explicit locking, `SELECT … FOR UPDATE`, or SERIALIZABLE isolation is
    needed.
- **Clearing** (checkout) is an ordinary `save` with `lines: []` and
  version + 1. The `carts` row is **kept**, so the version stays monotonic
  per owner. Deleting it would reset the version to 0 and let a stale
  version-1 write succeed.
- **Cart totals** are never stored. `priceCart` computes them on every read
  from live menu rows [EXISTING, ADR-0015 §2].
- **Operations covered.** Create (first add), retrieve, add, set quantity,
  remove and clear all reduce to `findByOwner` + a pure operation + `save`.
  There is no line-level SQL, per the port's whole-aggregate rule.

## 8. Order persistence design [PROPOSED]

- **Mapping.** `Order` → one `orders` row plus N `order_lines`, with
  `position = index`. `CustomerDetails` is embedded as three columns.
  There is no customer table and no accounts.
- **`create(order)`:**
  - run `assertOrderInvariants` first (the in-memory adapter does this too);
  - insert the order and its lines in the ambient transaction, or in its own
    if there is none;
  - a `23505` on `orders_pkey` or `orders_owner_idempotency_key_key` →
    `OrderAlreadyExistsError`. This keeps the existing semantics: a plain
    `Error`, so a 500, "reaching this is a bug".
- **`findById(owner, id)`** → `WHERE id = $id AND owner_id = $owner`, plus
  its lines `ORDER BY position`.
- **`findByIdempotencyKey(owner, key)`** uses the unique index, then loads
  lines the same way.
- **Round-trip rules:**
  - `customer_email NULL` ⇔ the key is absent (never `email: undefined`,
    never `""`), mirroring `copyCustomer`;
  - `uuid` comes back as lowercase canonical text, which matches
    `ORDER_ID_PATTERN` and `randomUUID()`;
  - timestamps come back as `Date`;
  - the result is deep-frozen.
- **Historical snapshot.** `name`, `unit_price_cents`, `quantity` and
  `line_subtotal_cents` are copies. `item_id` has no FK, so a later menu
  change or deletion cannot touch an order (AC9) [EXISTING, ADR-0016 §1].
- **Status** is `placed` only, enforced by a `CHECK` constraint. Adding a
  state is a migration plus a contract change owned by the phase that needs
  it [EXISTING, ADR-0016].
- **Delivery information:** none [EXISTING, Phase 4 D2/D3, Phase 9 OD4].

## 9. Repository implementation strategy [OD3 — PROPOSED]

- **New adapters.** `PostgresMenuRepository`, `PostgresCartRepository` and
  `PostgresOrderRepository` go in each module's `infrastructure/`. Each
  extends its existing abstract port. **Port signatures do not change.**
- **Runtime binding: Postgres only.**
  - Each module's `useClass` changes from `InMemory*` to `Postgres*`, one
    line per module.
  - There is no `PERSISTENCE=memory|postgres` switch. A second runtime mode
    is a configuration nobody runs in production, and it is exactly the mode
    in which ADR-0004's "transactions look easier" risk hides.
- **The in-memory adapters are kept.** They are test doubles for:
  - service unit tests, which already construct them directly;
  - the existing DB-free HTTP e2e suite, through a shared
    `overrideProvider` helper (OD12).
  Their header comments are updated to say so. Nothing is deleted.
- **Executor access.** A `DatabaseClient` provider (in `src/database/`)
  owns the `Kysely` instance. It exposes `executor()`, which returns the
  ambient transaction if there is one, else the pool. It also exposes
  `transaction(work)` (§12). Repositories depend on `DatabaseClient`, never
  on `pg` directly.
- **Row ↔ domain mapping** is private to each adapter (`toCart(row, lines)`
  etc.). Domain types are untouched.

## 10. Migration strategy [OD7 — PROPOSED]

- **Tool.** Kysely `Migrator` with a **static** migration provider
  (`src/database/migrations/index.ts` exporting an ordered record). There is
  no filesystem scanning, so it is deterministic and bundle-safe.
- **Naming.** `NNNN_snake_description.ts`, for example
  `0001_initial_schema.ts`. Kysely orders migrations by name. Zero-padded
  sequence numbers are unambiguous for a single-writer repository.
- **Each migration exports `up` and `down`.** A migration is never edited
  after it has been merged. A change is a new migration.
- **Execution is explicit, never at boot:**
  - `pnpm --filter commerce-api db:migrate` → migrate to latest;
  - `pnpm --filter commerce-api db:migrate:down` → one step down.
  Kysely records applied migrations in its own `kysely_migration` and
  `kysely_migration_lock` tables. The lock also prevents concurrent runs.
- **Rollback.** `down` is supported for development and test.
  **[DEFERRED]** A production rollback policy (forward-fix versus down) is
  for the deployment phase.
- **Development workflow:** `db:up` → `db:migrate` → `db:seed` → `dev`.
- **Test workflow:**
  - DB test global setup drops and recreates the `public` schema in the
    *test* database;
  - then it migrates to latest;
  - the migration test itself exercises up → down-to-zero → up (AC2).
- **Schema drift guard.** The migration test asserts the expected columns
  and constraints from `information_schema` and `pg_catalog`. The hand-written
  Kysely types in `database.schema.ts` are checked by `tsc` against the
  repositories' usage, and at runtime by the repository round-trip tests.

## 11. Seed strategy [OD5 — PROPOSED]

- **Seed only reference data:** the 3 categories and 6 items of
  `MENU_SEED`, including `gelato` as unavailable. There are no fake carts or
  orders, and no extra items.
- **A separate idempotent command** (`db:seed`), not a migration. It upserts
  by id (`INSERT … ON CONFLICT (id) DO UPDATE`) in one transaction, and
  writes `position` from the array index. It never deletes rows.
  - Keeping it out of migrations means a menu edit is not a schema-history
    event.
  - Upsert means re-running it restores the seeded values.
- **It refuses to run when `NODE_ENV=production`.** There is no production,
  and this makes the command's development-only purpose explicit.
- **Compatibility.** The seeded ids and prices are exactly what the
  existing Menu, Cart and Order tests assert, so the DB e2e reuses the same
  expectations (AC4).
- **Tests.** The DB test helper calls the same seed function (not the CLI)
  before each test, after truncation.

## 12. Transaction boundaries [OD4 — PROPOSED]

| Operation | Writes | Atomic? | How |
| --- | --- | --- | --- |
| Place order | `carts` (version bump) + `cart_lines` (delete) + `orders` + `order_lines` | **Yes, required** (ADR-0016) | `OrderService` wraps `checkoutCart.consume(version)` + `orderRepository.create(order)` in `transactionRunner.run(…)` |
| Cart save (any mutation) | `carts` + `cart_lines` | Yes | Inside `PostgresCartRepository.save`: joins the ambient transaction, else opens its own |
| Order create | `orders` + `order_lines` | Yes | Inside `PostgresOrderRepository.create`: same rule |
| Menu seed | categories + items | Yes | The seed command's own transaction |
| Reads | — | No | The pool executor. Reads inside a running transaction use it automatically |

**Mechanism.**

- **The port.** A new abstract port, `TransactionRunner`, lives in
  `src/common/persistence/transaction-runner.ts`:

  ```ts
  export abstract class TransactionRunner {
    abstract run<T>(work: () => Promise<T>): Promise<T>;
  }
  ```

- **The Postgres implementation** runs
  `db.transaction().execute(trx => storage.run(trx, work))`. `storage` is an
  `AsyncLocalStorage<Transaction>` owned by `DatabaseClient`, the same Node
  primitive `request-context.ts` already uses. `DatabaseClient.executor()`
  returns the stored transaction when present. That way `CartService`,
  `CartCheckoutAdapter` and both repositories join the transaction without
  any port, service signature or domain type changing.
- **The in-memory implementation** is a pass-through: `run = work => work()`.
  It gives no atomicity, which is exactly today's behaviour. The existing
  test "order write failure after consumption leaves the cart consumed"
  stays true *for in-memory* and is kept.
- **Nested `run`** joins the outer transaction and does not open a new one.
  There are no savepoints, because nothing needs them.
- **Isolation.** READ COMMITTED (the Postgres default). Correctness comes
  from the version-guarded `UPDATE` (§7), not from isolation level.
  SERIALIZABLE would add retry obligations the API does not have.
- **Scope of the order transaction.** Only steps 5 and 6. The idempotency
  lookup, the cart pricing read and the pure `createOrder` stay outside.
  That keeps the transaction short and adds no menu row locks. Staleness is
  already guarded by the cart version (and, for price drift, accepted by
  Phase 9 OD12).
- **What the transaction guarantees.**
  - If `create` fails (an injected fault, a constraint, a lost connection),
    the cart update rolls back. The cart keeps its lines and version (AC7).
  - A concurrent placement blocks on the `carts` row lock, then fails the
    version check → 409 `CART_CONFLICT` (AC8).

**No distributed transactions and no distributed locks.** Everything is one
database and one connection per transaction.

**Alternatives considered:**

- Passing a transaction handle through `CheckoutCart` and the repository
  methods would leak a database type into domain ports.
- A combined "consume cart and create order" repository method would make
  Order own Cart's tables.
- `@nestjs-cls/transactional` does the same thing as the proposal but adds
  a dependency for about 40 lines of code.

## 13. Consistency rules [EXISTING — unchanged; now testable against a DB]

| Case | Rule (source) | Database behaviour |
| --- | --- | --- |
| Product removed after being added to cart | The line stays stored; the priced cart omits it; the order refuses: 422 `MENU_ITEM_UNAVAILABLE` (ADR-0015, ADR-0016) | There is no FK, so the `cart_lines` row survives a `menu_items` delete. `unpricedLineCount` counts it |
| Product becomes unavailable | The line is flagged `available: false` and still counted in the subtotal; add and set are 422; the order is 422 (ADR-0015, ADR-0016) | `menu_items.available = false` is read live |
| Product price changes | The cart reprices live; existing orders keep their snapshot (ADR-0015 §2, ADR-0016 §1) | The cart reads `price_cents` live; `order_lines` holds copies |
| Cart holds stale product information | Impossible by design: the cart stores only `itemId` + `quantity` (ADR-0015 §2) | `cart_lines` has no name or price columns |
| Order created from a changed cart | The cart version was consumed at the priced version; otherwise 409 `CART_CONFLICT` (ADR-0016 §3) | Guarded `UPDATE` inside the order transaction |
| Price changes between pricing and consumption | Accepted: the order uses the price it read; no guard (Phase 9 OD12) | Unchanged; no menu lock taken |

No new business rule is introduced. Menu rows can only change through the
seed command or SQL. There is no menu write API [DEFERRED].

## 14. Error mapping [OD9 — PROPOSED]

This lives in one module, `src/database/persistence.errors.ts`. Repositories
catch driver errors and rethrow one of the following. **Nothing from the
driver error except SQLSTATE and constraint name is kept.** `detail`
("Failing row contains (…)", which can hold customer data), `where`,
parameters and the query text are all dropped.

| Driver condition | SQLSTATE / signal | Becomes | HTTP |
| --- | --- | --- | --- |
| Unique violation on `orders_pkey` or `orders_owner_idempotency_key_key` | `23505` + constraint | `OrderAlreadyExistsError` (existing plain `Error`) | 500 `INTERNAL_ERROR` (unchanged semantics) |
| Cart version guard matched 0 rows / insert conflict | no error; row count | `CartVersionConflictError` (existing) | 409 `CART_CONFLICT` |
| Connection refused / terminated / pool timeout / admin shutdown | `ECONNREFUSED`, `ETIMEDOUT`, class `08`, `57P01`–`57P03` | `DatabaseUnavailableError` (new `DomainError` subclass: status 503, static message) | **503 `SERVICE_UNAVAILABLE`** (new additive code) |
| Anything else (check or FK violation, syntax, undefined table, serialization) | any | `PersistenceError` (plain `Error`, message `"<operation> failed (SQLSTATE <code>[, constraint <name>])"`) | 500 `INTERNAL_ERROR` |

`AllExceptionsFilter` needs **no change**:

- `DomainError` status and code already pass through;
- other errors become the generic 500;
- 5xx errors are logged with the stack, and that stack now contains only the
  sanitized message.

The 503 status was already reserved in `commerce-api.md` §6 "once there is a
dependency (e.g. a database)". Using it for "database unavailable" matches
that reservation. The code is additive, and `contractErrorCodeSchema` is
pattern-based, so there is no contract change. A deadlock (`40P01`) or
serialization failure (`40001`) is not expected under §7/§12's patterns. If
one happens it is a 500, logged; it is not retried internally.

## 15. Configuration strategy [PROPOSED]

This extends the existing Zod `env.schema.ts` (ADR-0013 §7). It stays parsed
once, in `main.ts`. There is no `@nestjs/config` and no `dotenv`.

- `DATABASE_URL` — **required**, and must be a `postgres://` or
  `postgresql://` URL. It is never logged, and `EnvValidationError` already
  prints field names only.
- `DATABASE_POOL_MAX` — optional integer 1–50, default 10.
- Fixed in code, not configurable yet:
  - a connection timeout (5 s);
  - `statement_timeout` (10 s), so a hung query surfaces as an error rather
    than a hung request;
  - `application_name=commerce-api`.
- `testConfig()` gains a placeholder `DATABASE_URL`. `pg.Pool` connects
  lazily, so DB-free tests never touch it.

**Connection lifecycle.** A global `DatabaseModule.forRoot(config)` is
imported by `AppModule`.

- `DatabaseClient` creates `new Kysely({ dialect: new PostgresDialect({
  pool: new pg.Pool(…) }) })`.
- `onModuleInit` runs `SELECT 1`. If that fails, boot fails with a sanitized
  message (AC13).
- `onApplicationShutdown` runs `db.destroy()` to drain the pool.
  `enableShutdownHooks()` is already on (`configure-app.ts`).
- The DB-free e2e harness overrides `DatabaseClient` with an inert stub, so
  those tests never try `SELECT 1` (§18, OD12).

## 16. Local development strategy [OD11 — PROPOSED]

- **`infrastructure/docker/compose.yaml`** holds one `postgres` service and
  nothing else. It has no API container, no network topology and no
  production settings.
  - The image is the official `postgres` at a pinned major version. The
  current major is expected to be 18; confirm the tag at implementation.
  - The port is bound to **`127.0.0.1:5432`** only.
  - A named volume `commerce-pgdata` holds the data.
  - Dev-only credentials: user `commerce`, password `commerce`, database
    `commerce`.
  - A healthcheck (`pg_isready`) is included.
  - `infrastructure/docker/postgres/init/01-create-test-database.sql`
    creates `commerce_test` on first start.
- **New `apps/commerce-api` package scripts:**
  - `db:up` / `db:down`: `docker compose -f ../../infrastructure/docker/compose.yaml up -d --wait` / `down`;
  - `db:migrate`, `db:migrate:down`, `db:seed`: run through `vite-node`
    with `--env-file-if-exists=.env`, the same launch pattern `dev` uses;
  - `test:db`.
- **`.env.example`** gains
  `DATABASE_URL=postgres://commerce:commerce@127.0.0.1:5432/commerce`. This
  is the non-secret local value that matches the Compose file.
- `docker compose down -v` destroys local data. This is documented.
- `system-architecture.md` §7 says work in `infrastructure/docker/` is
  HIGH-risk on the infrastructure dimension. This phase is already HIGH and
  scopes it explicitly: local development only.

## 17. Test database strategy [OD10 — PROPOSED]

- **The database.** The same Compose Postgres, but database
  `commerce_test`, reached through **`TEST_DATABASE_URL`**. Only the DB test
  setup reads it. The app's `env.schema` does not. The DB tests build their
  config with `testConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL })`.
  `.env.example` documents the default value.
- **Kept separate from the default suite:**
  - DB tests are named `*.db.test.ts`;
  - `vitest.config.ts` excludes them;
  - a new `vitest.db.config.ts` includes only them, with
    `fileParallelism: false` and a `globalSetup`.
- **Global setup:**
  1. connect;
  2. **fail with an actionable message** ("run `pnpm --filter commerce-api
     db:up`") if the database is unreachable;
  3. refuse to run if the database name does not end in `_test`, so a
     developer's dev data is never truncated;
  4. drop and recreate `public`;
  5. migrate to latest.
- **Per test:** `TRUNCATE order_lines, orders, cart_lines, carts,
  menu_items, menu_categories`, then run the menu seed function. This gives
  deterministic, independent tests.
- **Why not the alternatives:**
  - Testcontainers adds a dependency and still needs the Docker daemon.
  - PGlite (Postgres in WASM) is single-connection, so it cannot prove the
    concurrency ACs (AC5, AC8).
  - Both are recorded in OD10.

## 18. Unit-test strategy [EXISTING pattern, kept]

Domain tests stay pure and DB-free: `*.operations`, `*.invariants`,
`*.pricing`, `order.create`. Service tests keep using the in-memory adapters
and fakes. `OrderService` tests gain a pass-through `TransactionRunner` and
**one new test**: `consume` and `create` are invoked inside `run`, and a
failure inside `run` propagates. New pure unit tests cover:

- `persistence.errors.ts` mapping: each SQLSTATE class, and that `detail`
  and parameters are dropped (AC12);
- the `env.schema` additions (AC13);
- the Postgres `TransactionRunner`'s nesting rule (with a fake `Kysely`), if
  that is practical; otherwise it is covered in the DB suite.

## 19. Repository-test strategy [PROPOSED]

Each Postgres adapter gets a `*.db.test.ts` against `commerce_test`.

| Adapter | Proves |
| --- | --- |
| `PostgresMenuRepository` | Seeded list equals `MENU_SEED` in order, with frozen output; `findItemById` hit and miss; a row changed by SQL is visible on the next read (no cache) |
| `PostgresCartRepository` | Unknown owner → `undefined`; insert at v1; update v1→v2; stale or skipped version → conflict with nothing stored; v1 insert on an existing row → conflict; line order and timestamps round-trip; clear keeps the row and bumps the version; two concurrent saves at the same version → exactly one fulfils; frozen output |
| `PostgresOrderRepository` | Round-trip every field, with and without email (absent stays absent); owner-scoped `findById` and `findByIdempotencyKey`; duplicate id and duplicate (owner, key) → `OrderAlreadyExistsError` with no partial rows; lines in order |
| `PostgresTransactionRunner` + `DatabaseClient` | Writes inside `run` commit together; a throw rolls all of them back; nested `run` joins; `executor()` outside `run` is the pool |
| Migrations | AC1 (schema assertions via `information_schema` / `pg_constraint` / `pg_indexes`), AC2 (up → down → up; idempotent re-run) |
| Seed | AC3 (exact rows; idempotent) |

The repository tests share their contract assertions with the existing
`in-memory-*.repository.test.ts` where that is cheap, to show the two
adapters behave the same way. This is **not** done by restructuring the
existing in-memory tests (scope).

## 20. Integration-test strategy [OD12 — PROPOSED]

1. **Existing HTTP e2e (`test/*.e2e.test.ts`) stays DB-free.** A new helper,
   `test/support/in-memory-persistence.ts`, applies `overrideProvider` for
   `MenuRepository`, `CartRepository`, `OrderRepository`,
   `TransactionRunner` and `DatabaseClient`. Each e2e `buildApp` calls it.
   This is a wiring-only change (AC15).
2. **New `test/persistence.e2e.db.test.ts`.** The real `AppModule` and
   `configureApp` are wired to `commerce_test`, over real HTTP. It covers:
   - menu read parity (AC4);
   - an add / patch / delete / get cart walk;
   - placing an order, replaying it, and `IDEMPOTENCY_KEY_REUSED`;
   - **restart persistence**: close the app, start a new instance on the
     same database, and the order, the replay and the cart state all
     persist (AC11);
   - **the snapshot after a menu change** (AC9);
   - **unavailable and removed items** (AC10);
   - **rollback**: `OrderIdGenerator` is overridden to return an existing
     order's id, so `create` hits `orders_pkey` after `consume`. The result
     is 500, and the cart is unchanged (AC7);
   - **concurrency**: two parallel `POST /v1/orders` requests with
     different keys give exactly one 201 and one 409, and exactly one order
     row (AC8). A deterministic variant holds the `carts` row lock in a
     separate connection to force the interleaving;
   - **database down**: an app built against an unreachable URL fails boot.
     A request while the pool cannot connect is 503 `SERVICE_UNAVAILABLE`
     with a static body (AC12, AC13).

## 21. Security considerations [PROPOSED]

- **Boundary** (`system-architecture.md` §4.1). Only `apps/commerce-api`
  gets `kysely` and `pg`, and only it reads `DATABASE_URL`. `apps/web` and
  `packages/contracts` are unchanged (AC17). The mechanical enforcement in
  §8 gap 2 (credential separation or network policy) stays
  [DEFERRED]. The Compose port bound to `127.0.0.1` is the only network
  measure.
- **Credentials.**
  - Only dev-only, non-secret values are committed: in `compose.yaml` and
    `.env.example`, clearly labelled.
  - The real `.env` is already gitignored.
  - There is no secret manager [DEFERRED, per the brief].
- **Injection.** Every query goes through Kysely's builder with bound
  parameters. `sql.raw` and string-built SQL are forbidden in repositories,
  and review checks this. Migrations use `sql` only for DDL literals.
- **Sensitive data.** Customer name, phone and email are now **durable
  personal data** for the first time.
  - They are stored only in `orders`.
  - They are returned only on the owner's order routes (unchanged).
  - They never appear in logs: request logging is unchanged, and driver
    errors are sanitized (§14).
  - They are never echoed in errors.
  - **Retention, erasure and encryption at rest are open product/legal
    decisions [DEFERRED]** (§24).
- **Permissions.**
  - Local dev uses one role that owns the schema.
  - **[DEFERRED]** a split between a migration role (DDL) and an app role
    (DML on four tables), plus `REVOKE` on public. Recorded for the
    deployment phase.
- **Error and log hygiene.**
  - No driver `detail`, query text or parameters reach a log or a response
    (AC12).
  - `DATABASE_URL` is never logged. The boot-failure message says "database
    unreachable", with no host and no URL.
- **A specialised security review is required** (see the end of this
  document).

## 22. Indexing strategy [PROPOSED]

Every query is a key lookup, and each one is covered by a constraint's own
index. **No additional indexes.**

| Query | Index |
| --- | --- |
| Menu list (categories by position) | `menu_categories_position_key` |
| Menu list (items by category, position) | `menu_items_category_id_position_key` |
| `findItemById` | `menu_items_pkey` |
| `findByOwner` / guarded update | `carts_pkey`; lines via `cart_lines_pkey` (prefix `owner_id`) |
| `findById(owner, id)` | `orders_pkey` (then the owner filter) |
| `findByIdempotencyKey` | `orders_owner_idempotency_key_key` |
| Order lines | `order_lines_pkey` (prefix `order_id`) |
| FK `menu_items.category_id` | Covered by the `(category_id, position)` unique index |
| FK `order_lines.order_id` | Covered by the PK prefix |

There is no `orders(owner_id, created_at)` index, because there is no order
list route [DEFERRED, Phase 9 OD2].

## 23. Performance considerations

- **Cart pricing is N+1 in lookups.** `CartService.priceLines` calls
  `CartCatalog.findItem` once per line. That is `Promise.all` over PK
  lookups, with at most 6 lines against today's menu. It is accepted, and
  the port does not change.
  `FOLLOW-UP (not done): cart.service.ts priceLines — N PK lookups per
  cart read — add a batched findItems to CartCatalog/MenuService if carts
  grow — LOW`.
- **Place order** makes about 6 or 7 round-trips, with only two writes
  inside the transaction.
- **The pool** defaults to 10 connections. Single user, local.
- **Nothing is cached.** Correctness (live menu pricing) matters more than
  latency here.
- **`statement_timeout`** bounds a pathological query.
- No specialised performance review is needed (see the end of this
  document).

## 24. Data lifecycle considerations

| Data | Lifetime | Notes |
| --- | --- | --- |
| Menu | Until changed by seed or SQL | Reference data |
| Carts | Indefinite; one row per owner | A cleared cart keeps its row (§7) |
| Orders | **Indefinite** | Behaviour change: orders, and their idempotency keys, now survive restarts. A same-key retry after a restart **replays** instead of creating a new order, which is stricter and safer. Phase 9's manual check 9 ("restart → 404") inverts. This is documented |
| Idempotency keys | The order's lifetime | Unchanged rule (ADR-0016); now durable |

**[DEFERRED]** A retention or erasure policy for customer personal data,
abandoned-cart cleanup, and archival. These are product/legal decisions with
no requirement today. They are recorded in ADR-0017 as open.

## 25. Backup considerations

This phase is local development only. There is no backup mechanism, and one
would be premature. The docs note that `docker compose down -v` destroys the
data, and that `pg_dump` is the manual option.
**[DEFERRED]** backups and point-in-time recovery, for the deployment phase.

## 26. Files to create

| File | Purpose |
| --- | --- |
| `infrastructure/docker/compose.yaml` | Local Postgres only |
| `infrastructure/docker/postgres/init/01-create-test-database.sql` | Creates `commerce_test` |
| `apps/commerce-api/src/common/persistence/transaction-runner.ts` | Abstract `TransactionRunner` port |
| `apps/commerce-api/src/common/persistence/in-memory-transaction-runner.ts` | Pass-through (test double) |
| `apps/commerce-api/src/database/database.module.ts` | Global `DatabaseModule.forRoot(config)` |
| `apps/commerce-api/src/database/database-client.ts` | Owns Kysely and the pool; `executor()`, `transaction()`, lifecycle, boot check |
| `apps/commerce-api/src/database/postgres-transaction-runner.ts` | `TransactionRunner` over `DatabaseClient` |
| `apps/commerce-api/src/database/database.schema.ts` | Kysely table types |
| `apps/commerce-api/src/database/persistence.errors.ts` (+ `.test.ts`) | Sanitized error mapping (§14) |
| `apps/commerce-api/src/database/migrations/0001_initial_schema.ts` | §5 schema, `up` and `down` |
| `apps/commerce-api/src/database/migrations/index.ts` | Static migration provider |
| `apps/commerce-api/src/database/migrator.ts` | Builds a Kysely `Migrator` |
| `apps/commerce-api/src/database/menu-seed.ts` | `seedMenu(db, MENU_SEED)`: idempotent upsert |
| `apps/commerce-api/src/database/cli/migrate.ts`, `cli/seed.ts` | Script entry points |
| `apps/commerce-api/src/database/migrations.db.test.ts`, `menu-seed.db.test.ts`, `postgres-transaction-runner.db.test.ts` | AC1–AC3; transaction semantics |
| `apps/commerce-api/src/modules/menu/infrastructure/postgres-menu.repository.ts` (+ `.db.test.ts`) | §6 |
| `apps/commerce-api/src/modules/cart/infrastructure/postgres-cart.repository.ts` (+ `.db.test.ts`) | §7 |
| `apps/commerce-api/src/modules/order/infrastructure/postgres-order.repository.ts` (+ `.db.test.ts`) | §8 |
| `apps/commerce-api/test/support/in-memory-persistence.ts` | Override helper for the DB-free e2e |
| `apps/commerce-api/test/support/test-database.ts` | Connect, the `_test` guard, truncate, seed |
| `apps/commerce-api/test/db-global-setup.ts` | Reachability check, schema reset, migrate |
| `apps/commerce-api/test/persistence.e2e.db.test.ts` | §20 item 2 |
| `apps/commerce-api/vitest.db.config.ts` | DB suite config |
| `docs/features/phase-10-database-persistence/review-report.md` | Written at `/review`, not now |

## 27. Files to modify

| File | Change |
| --- | --- |
| `apps/commerce-api/package.json` | Dependencies `kysely` and `pg`; dev dependency `@types/pg`; scripts `db:up`, `db:down`, `db:migrate`, `db:migrate:down`, `db:seed`, `test:db` |
| `pnpm-lock.yaml` | Lockfile update from the install |
| `apps/commerce-api/vitest.config.ts` | Exclude `**/*.db.test.ts` |
| `apps/commerce-api/.env.example` | `DATABASE_URL`, `DATABASE_POOL_MAX`, `TEST_DATABASE_URL` (documented) |
| `apps/commerce-api/src/config/env.schema.ts` (+ `.test.ts`) | The two new variables |
| `apps/commerce-api/src/config/test-config.ts` | Placeholder `DATABASE_URL` |
| `apps/commerce-api/src/app.module.ts` | Import `DatabaseModule.forRoot(config)` |
| `apps/commerce-api/src/common/errors/api-error-codes.ts` | `SERVICE_UNAVAILABLE` |
| `apps/commerce-api/src/modules/{menu,cart,order}/*.module.ts` | `useClass` → `Postgres*`; `OrderModule` binds `TransactionRunner` |
| `apps/commerce-api/src/modules/order/order.service.ts` | Inject `TransactionRunner`; wrap steps 5 and 6; update the failure-window comment |
| `apps/commerce-api/src/modules/order/order.service.test.ts` | Constructor argument; one new transaction test |
| `apps/commerce-api/src/modules/{menu,cart,order}/*.module.test.ts`, `src/app.module.test.ts` | Binding assertions → `Postgres*`; import `DatabaseModule` with the test config |
| `apps/commerce-api/test/{app,menu,cart,order,validation}.e2e.test.ts` | `buildApp` applies the in-memory override helper (wiring only) |
| `apps/commerce-api/src/modules/*/infrastructure/in-memory-*.repository.ts` | Header comment only: now the test adapter |
| `eslint.config.mjs` | A `no-restricted-imports` block for `apps/commerce-api/src/modules/**` banning `kysely`, `pg` and `**/database/**`, **except** `modules/*/infrastructure/**`. It repeats the existing commerce-api patterns, because flat-config rule options do not merge (Risk R6) |
| `docs/architecture/architecture-decisions.md` | ADR-0017 (new); ADR-0004 → `Superseded by ADR-0017` for runtime storage (in-memory kept as test adapters); index |
| `docs/architecture/system-architecture.md` | Database: PostgreSQL; §8 gap 1 closed; gap 2 unchanged |
| `docs/api/commerce-api.md` | 503 `SERVICE_UNAVAILABLE`; persistence notes on the §12 and §13 routes (restart durability) |
| `docs/development/getting-started.md` | Commands table (`db:*`, `test:db`), setup order, test counts |
| `apps/commerce-api/README.md` | Persistence and local-database section |
| `docs/product/food-ordering-frontend-mvp.md` | "Persistence across a server restart" moves from out of scope to done (commerce-api only) |

**Not modified:** `apps/web/**`, `packages/contracts/**`, every
`modules/*/domain/**` file, `cart.service.ts`, the controllers, the mappers,
`configure-app.ts`, `all-exceptions.filter.ts` and `vite.config.ts`. If the
build check in 10.5 shows `vite.config.ts` needs a change, that is reported
as a scope change first.

## 28. Dependencies required

| Package | Kind | Why |
| --- | --- | --- |
| `kysely` | runtime | Query builder, transactions, migrator (OD2) |
| `pg` | runtime | PostgreSQL driver used by Kysely's `PostgresDialect` |
| `@types/pg` | dev | Types for `pg` |

That is everything. There are no Nest persistence packages, no
Testcontainers, no `dotenv` and no CLI tools. Docker (already installed) is
a developer prerequisite, not a package. `pnpm-workspace.yaml`
`allowBuilds`: `pg` is pure JavaScript. Its optional `pg-native` is not
installed. So no build approval should be needed. This is verified at
install time.

## 29. Environment variables

| Variable | Read by | Required | Default / example | Secret? |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | `env.schema.ts` (app, CLIs) | Yes | `postgres://commerce:commerce@127.0.0.1:5432/commerce` (dev) | Yes in any real environment; the dev value is not |
| `DATABASE_POOL_MAX` | `env.schema.ts` | No | `10` | No |
| `TEST_DATABASE_URL` | DB test setup only | For `test:db` | `postgres://commerce:commerce@127.0.0.1:5432/commerce_test` | Dev value, not secret |

## 30. Acceptance criteria

AC1–AC18 are in `requirements.md`.

## 31. Validation commands

| Check | Command | Source |
| --- | --- | --- |
| Lint | `pnpm turbo run lint` | root `package.json` / turbo |
| Types | `pnpm turbo run typecheck` | same |
| Test (DB-free, all packages) | `pnpm turbo run test` | same |
| Build | `pnpm turbo run build` | same |
| Start the database | `pnpm --filter commerce-api db:up` | **new** (this phase) |
| Migrate / seed | `pnpm --filter commerce-api db:migrate`, `db:seed` | **new** |
| DB suite | `pnpm --filter commerce-api test:db` | **new** |
| Run (built) | `pnpm --filter commerce-api build && pnpm --filter commerce-api start` + `curl` | existing |

Format: `NOT_CONFIGURED`. CI: `NOT_CONFIGURED` (no `.github/`). Between
sub-phases, run targeted checks (`pnpm --filter commerce-api test`,
`test:db`) and report them as targeted. The full set runs before `/review`.
The new commands become "declared" only once 10.1 adds them. Until then
they are `NOT_CONFIGURED`.

## 32. Risks

| # | Risk | Impact | Handling |
| --- | --- | --- | --- |
| R1 | Docker daemon unavailable at implementation time (it was not running during planning) | `test:db` and AC5–AC11 cannot be executed | Stop and report as blocked; never mark `PASS`. The DB-free suite still runs. You start Docker Desktop |
| R2 | The ambient `AsyncLocalStorage` transaction is "magic": a repository call outside `run` silently uses the pool | A non-atomic write that looks atomic | `run` is used in exactly one place; the DB rollback test (AC7) fails if the cart save escapes the transaction; code comment on `DatabaseClient.executor()` |
| R3 | The Vite SSR bundle and `pg` (CommonJS) interop, flagged by ADR-0013 | Built `start` fails | Verified in 10.5 by build + start + `curl`; any `vite.config.ts` change is reported first |
| R4 | Hand-written Kysely types drift from migrations | Runtime SQL errors | The migration schema test, plus repository round-trips over every column |
| R5 | DB tests truncate the wrong database | Loss of local dev data | The global setup refuses unless the database name ends in `_test` |
| R6 | ESLint flat config: a new `no-restricted-imports` block for the same files replaces, not merges, the existing web/ui-commands bans | The Phase 6 boundary is silently lost | The new block repeats the existing patterns; re-verify both bans with temporary imports (precedent: ADR-0013 §9) |
| R7 | Changing pre-existing tests (bindings, harness) masks a regression | False green | Wiring-only changes, each listed; no assertion removed or weakened (AC15); reviewer checks the diff |
| R8 | Personal data is now durable with no retention policy | Privacy / legal | Local-only; recorded [DEFERRED] in ADR-0017; security review |
| R9 | A behaviour change to replay-after-restart surprises someone | Confusion | Documented in `commerce-api.md` §13 and ADR-0017 |
| R10 | Five sub-phases and about 30 files make a large review | Review fatigue | Each sub-phase is independently green; approve phase by phase if wanted (Full Path allows it). A split alternative is under Implementation order |
| R11 | Port 5432 is already in use on your machine | `db:up` fails | Documented; change the host port in `compose.yaml` and the URLs together |

## 33. Open architectural decisions (approved as recommended)

| # | Decision | Recommendation | Alternatives |
| --- | --- | --- | --- |
| OD1 | Database | **PostgreSQL** (§3) | MongoDB (needs a replica set for transactions) |
| OD2 | Data access | **Kysely + `pg`**, hand-written table types | Drizzle, Prisma, TypeORM, raw `pg` (§4) |
| OD3 | Runtime binding | **Postgres only**; in-memory adapters kept as test doubles | A `PERSISTENCE=memory\|postgres` switch |
| OD4 | Transaction mechanism | **`TransactionRunner` port + an `AsyncLocalStorage` ambient transaction in `DatabaseClient`**; only `OrderService` opens one | An explicit transaction handle through the ports; a combined repository method; `@nestjs-cls/transactional` |
| OD5 | Menu seeding | **Idempotent `db:seed` upsert from `MENU_SEED`**, not a migration; never deletes | A data migration; seeding at boot |
| OD6 | FK from `cart_lines.item_id` / `order_lines.item_id` to `menu_items` | **None** (finding 6) | `CASCADE` (breaks ADR-0016); `RESTRICT` (new business rule) |
| OD7 | Migrations | **Kysely `Migrator`, static provider, `NNNN_name`, `up` + `down`, explicit command, never at boot** | Migrate on boot; SQL files with a custom runner |
| OD8 | Boot behaviour | **`SELECT 1` connectivity check; fail fast.** No pending-migration check (keeps the migrator out of the runtime bundle) | Also fail on pending migrations; no check |
| OD9 | DB error mapping | **Sanitized errors; connectivity → 503 `SERVICE_UNAVAILABLE` (new additive code); everything else 500**; the order unique violation stays `OrderAlreadyExistsError` | Everything as 500 |
| OD10 | Test database | **Compose Postgres, `commerce_test`, a separate `test:db` suite that fails when the database is absent; the default `test` stays DB-free** | Testcontainers; PGlite; making the default `test` require a database |
| OD11 | Compose location | **`infrastructure/docker/compose.yaml`** (the reserved directory), Postgres only, `127.0.0.1`-bound | `apps/commerce-api/compose.yaml` |
| OD12 | Existing HTTP e2e | **Kept DB-free through an override helper**; a new DB-backed e2e covers the full stack | Convert every e2e to require the database |
| OD13 | Money column type | **`integer`** (±$21M in cents) with `CHECK ≥ 0` | `bigint`, which `pg` returns as a string and needs a parser |
| OD14 | Cart save algorithm | **Guarded `UPDATE` / `INSERT … ON CONFLICT DO NOTHING`, then replace the lines, in one transaction; the cleared cart row is kept** | Diffing lines; deleting the row on clear |
| OD15 | Readiness endpoint | **Deferred.** `GET /health` stays liveness-only | Add `GET /health/ready` → 503 |
| OD16 | ADR bookkeeping | **New ADR-0017; ADR-0004 → Superseded by ADR-0017** (runtime storage), with the in-memory role noted | Amend ADR-0004 in place |

## 34. Implementation order

These are five sub-phases. Each ends green on the DB-free suite, and from
10.1 on, also on `test:db`. You can approve them one at a time.

### 10.1 — Database foundation (no binding changes)
- [x] Dependencies (`kysely`, `pg`, `@types/pg`); package scripts; Compose
  file and init SQL; `.env.example`.
- [x] `env.schema` additions and tests; `test-config`.
- [x] `TransactionRunner` port and in-memory pass-through; `DatabaseClient`,
  `DatabaseModule`, `PostgresTransactionRunner`; `persistence.errors.ts` and
  unit tests; `SERVICE_UNAVAILABLE`.
- [x] `database.schema.ts`, migration `0001`, static provider, migrator,
  `db:migrate` / `db:migrate:down` CLI.
- [x] `vitest.db.config.ts`, global setup, `test-database.ts`, the default
  config's exclude; migration and transaction-runner DB tests.
- [x] `AppModule` imports `DatabaseModule`. The e2e override helper is
  introduced now, because boot's `SELECT 1` would otherwise hit the
  database.
- **Done when:** `pnpm --filter commerce-api test` passes with no database;
  `db:up && test:db` passes (AC1, AC2, AC13 partial); the in-memory bindings
  are still active.
- **Status (2026-09-25): done.** DB-free `test` (310), `lint`,
  `typecheck` and `build` PASS. `db:up` PASS (Postgres 18.6).
  `test:db` PASS (35). On the first run, 3 tests failed on the test's own
  expectations:
  - `ON DELETE RESTRICT` raises `23001`, not `23503`;
  - one check-constraint row broke two checks at once.
  All three expectations were fixed; the schema was not changed. A
  mutation check (transaction removed) made 6 of the 8 runner tests fail.
  `db:migrate` / `db:migrate:down` were exercised up, no-op, down, no-op
  and up on the dev database.

### 10.2 — Menu persistence
- [x] `menu-seed.ts`, `db:seed` CLI, seed DB test (AC3).
- [x] `PostgresMenuRepository` and its DB test; `MenuModule` binding; module
  test update.
- **Done when:** both suites pass; `dev` + `curl /v1/menu` against the
  database matches the Phase 9 output.
- **Status (2026-09-25): done.** `test` (310, DB-free), `test:db` (51),
  `lint`, `typecheck` and `build` PASS. `db:seed` was run twice on the dev
  database (3 categories, 6 items). A `dev` server on the dev database
  returned `GET /v1/menu` and `/v1/menu/items/gelato` byte-identical to the
  in-memory output. Unknown item → 404. A cart add priced from the database
  → 1500; adding unavailable gelato → 422. The module-test update also
  covered `cart.module.test.ts` and `order.module.test.ts`, which compile
  `MenuModule` transitively; that change is wiring-only (the override
  helper).

### 10.3 — Cart persistence
- [x] `PostgresCartRepository` and its DB test, including concurrency
  (AC5); `CartModule` binding; module test update.
- **Done when:** both suites pass; a cart survives a `dev` restart.
- **Status (2026-09-25): done.** `test` (310, DB-free), `test:db` (71;
  3 repeat runs green), `lint`, `typecheck` and `build` PASS. Mutation
  check: removing the `WHERE version = N-1` guard fails 5 tests (the lost
  update, the rejected conflict, and all three concurrency cases). A
  `dev` server on the dev database: add, add, patch → restart → the same
  cart; delete → restart → the same cart. The database holds version 4.
  `findByOwner` reads the cart and its lines in one LEFT JOIN statement, so
  the header and lines come from one snapshot (a detail §7 left open: "or
  two queries").

### 10.4 — Order persistence and the transaction boundary
- [x] `PostgresOrderRepository` and its DB test (AC6).
- [x] `OrderService` + `TransactionRunner`; `OrderModule` bindings; service
  and module test updates.
- [x] Transaction-rollback and concurrency tests (AC7, AC8).
- **Done when:** both suites pass; the rollback test is shown to **fail**
  with the `run` wrapper temporarily removed, then restored. This mutation
  check proves the test tests the transaction.
- **Status (2026-09-25): done.** `test` (313, DB-free), `test:db` (97;
  3 consecutive runs green), `lint`, `typecheck` and `build` PASS.
  - **Mutation check:** with the `run` wrapper removed, the AC7 rollback
    test fails with the ADR-0016 failure itself (cart cleared, no order).
    The two service-level boundary tests fail too. Restored.
  - **First DB run:** 3 tests failed on the tests' own assumptions.
    1. AC7's expected cart version was off by one.
    2. The two AC8 concurrency tests assumed both placements price the cart
       before either consumes it. Real parallel requests don't guarantee
       that: the loser can load after the winner commits and get 422
       `CART_EMPTY`, an outcome ADR-0016 already documents.
    - **Fix:** a barrier on `load()` now forces the AC8 race (one order,
      409 for the other). A separate ungated test asserts what holds for any
      timing: one order, and the losers get 409 or 422 with nothing
      ordered. No product code changed for these.
  - **Live:** `POST /v1/orders` on the dev database → 201. After a restart,
    `GET` → 200 with the same body; a same-key replay returns the same
    order; a different customer → 409 `IDEMPOTENCY_KEY_REUSED`.

### 10.5 — Full-stack DB e2e, boundary, docs, full validation
- [x] `test/persistence.e2e.db.test.ts` (AC4, AC9–AC12).
- [x] ESLint domain boundary, with temporary-violation checks for both new
  and pre-existing bans (AC14).
- [x] The docs in §27; ADR-0017; ADR-0004 status.
- [x] Full lint, typecheck, test and build; `test:db`; built `start` +
  `curl` walk including a restart (AC11, AC16–AC18);
  `git diff --stat -- apps/web packages/contracts` is empty.
- **Done when:** every AC is checked with evidence.
- **Status (2026-09-25): done.**
  - **Validation:** `pnpm turbo run lint typecheck test build --force`:
    24/24 tasks, 708 tests (313 `commerce-api`). `test:db`: 109 tests.
  - **ESLint boundary:** temporary imports of `kysely`, `pg`,
    `kysely/migration` and `src/database/` failed lint in a domain file,
    and `kysely` in a service file. The two pre-existing bans
    (`@contracts/ui-commands`, `apps/web`) still fail, both inside and
    outside the new block's files. `kysely` in an `infrastructure/` file
    is allowed. All probe files were removed.
  - **Built `start` + `curl` walk:** menu; a cart survives a restart; an
    order placed, empties the cart, and survives a restart with an
    identical body; a same-key replay gives the same id; reuse → 409;
    database stopped under a running server → 503 on every route; start
    with the database down → exit 1, with a sanitized message. No
    credential, URL or customer detail in any log.
  - `git diff --stat -- apps/web packages/contracts` is empty.
  - **First run of the full-stack DB e2e:** 2 failures. The test expected
    201 from `POST /v1/cart/items`, which Phase 8 made 200 on purpose; the
    test was fixed.
  - `order.e2e.test.ts`: only the comment of its "does not keep orders
    across a restart" test was corrected (that suite runs on the in-memory
    test adapters).

**Split alternative (if you prefer smaller PRs):**

- 10a = 10.1 + 10.2 (foundation + menu, no writes);
- 10b = 10.3 – 10.5.

It costs one extra review cycle. It does not change the design.

## 35. Expected repository structure

```text
infrastructure/docker/
  compose.yaml
  postgres/init/01-create-test-database.sql
apps/commerce-api/
  vitest.config.ts            (excludes *.db.test.ts)
  vitest.db.config.ts
  src/
    common/persistence/       transaction-runner.ts  in-memory-transaction-runner.ts
    database/
      database.module.ts  database-client.ts  database.schema.ts
      postgres-transaction-runner.ts  persistence.errors.ts  migrator.ts  menu-seed.ts
      migrations/  index.ts  0001_initial_schema.ts
      cli/         migrate.ts  seed.ts
      *.test.ts  *.db.test.ts
    modules/
      menu/infrastructure/   in-memory-menu.repository.ts   postgres-menu.repository.ts   (+ tests)
      cart/infrastructure/   in-memory-cart.repository.ts   postgres-cart.repository.ts   (+ tests)
      order/infrastructure/  in-memory-order.repository.ts  postgres-order.repository.ts  (+ tests)
      (domain/ directories unchanged)
  test/
    support/  in-memory-persistence.ts  test-database.ts
    db-global-setup.ts
    persistence.e2e.db.test.ts
    *.e2e.test.ts             (DB-free, wiring updated)
docs/features/phase-10-database-persistence/{requirements,plan,test-plan}.md
```

---

## Assumptions

**Verified by reading:**

- all three ports and adapters, and their contracts (§2);
- `OrderService`'s step order and the failure-window comment;
- `CartService.completeCheckout` loads, checks the version, then saves;
- `AllExceptionsFilter` passes `DomainError` status and code through, and
  logs only 5xx;
- `env.schema` prints field names only;
- `orderIdSchema` is lowercase-hex UUID (so a `uuid` column cannot receive a
  malformed id);
- contract length bounds (§5);
- `MENU_SEED` has 3 categories and 6 items, with `gelato` unavailable;
- `.env` is gitignored;
- `infrastructure/docker/` is empty;
- there is no `.github/`;
- the ESLint commerce-api block exists, at `eslint.config.mjs:59`;
- Docker and Compose are installed, but the daemon was down.

**Not verified:**

- that the suite passes at HEAD (not re-run during planning);
- current `kysely` and `pg` versions and their ESM/CJS behaviour under
  `vite-node` and the Vite SSR build (R3);
- the Postgres image tag;
- that port 5432 is free (R11);
- that `pg` needs no `allowBuilds` entry.

## Not doing

Everything in `requirements.md` "Out of scope", and everything marked
[DEFERRED] above.

## Specialised review needed?

- **security: yes.** First durable personal data; credential and connection
  string handling; driver-error sanitization; query parameterization; the
  §4.1 boundary.
- **performance: no.** Key lookups only, bounded data, single user. The
  N+1 pricing is recorded as a LOW follow-up.
- **data / migration: yes.** Schema and constraints versus domain
  invariants; migration reversibility; the order transaction and rollback;
  cart version semantics under real concurrency; the no-FK decision (OD6);
  the truncate guard.
