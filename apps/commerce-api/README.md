# commerce-api

NestJS modular-monolith for the food-ordering platform's commerce domain.
Phase 6 built the transport boundary — configuration, validation, the error
model, correlation, logging, and `GET /health`. Phase 7 built the first
domain on top of it: a read-only Menu, `GET /v1/menu` and
`GET /v1/menu/items/:itemId`. Phase 8 added a Cart (the first domain with
writes): `GET /v1/cart`, `POST /v1/cart/items`, and `PATCH`/`DELETE
/v1/cart/items/:itemId`, in-memory and single-owner. Phase 9 added Orders:
`POST /v1/orders` (an immutable snapshot of the cart, idempotent by a
required key; it empties the cart) and `GET /v1/orders/:orderId`, also
in-memory. Phase 10 moved all of it into PostgreSQL behind the same
repository interfaces: carts and orders survive a restart, and placing an
order consumes the cart and stores the order in one transaction. There is
no payment.

Read first, in this order:

1. [`../../docs/api/commerce-api.md`](../../docs/api/commerce-api.md) — the
   HTTP conventions this service follows (versioning, error codes, headers,
   §11 for the Menu routes, §12 for the Cart routes, and §13 for the Order
   routes).
2. [`../../docs/architecture/architecture-decisions.md`](../../docs/architecture/architecture-decisions.md)
   ADR-0013 — why the toolchain, validation mechanism, and error model are
   what they are; ADR-0014 — why Menu is in-memory, where its response
   shapes live, and how a domain error becomes an HTTP response; ADR-0015 —
   Cart's identity, pricing, storage, and concurrency decisions; ADR-0016 —
   Order's snapshot, cart-consumption, idempotency, and storage decisions;
   ADR-0017 — PostgreSQL, Kysely, migrations, and the order-placement
   transaction.
3. [`../../docs/development/getting-started.md`](../../docs/development/getting-started.md) —
   every command this package actually has, verified.

**Local database.** `dev`, `start` and the `db:*` scripts need PostgreSQL
and read `DATABASE_URL` from `.env` (copy `.env.example`). Once:
`pnpm --filter commerce-api db:up && pnpm --filter commerce-api db:migrate
&& pnpm --filter commerce-api db:seed`. `pnpm --filter commerce-api test`
needs no database. `pnpm --filter commerce-api test:db` runs the
database-backed suite and fails if the database is down. Only
`src/database/` and each module's `infrastructure/` touch storage; ESLint
enforces this for domain, service, controller and mapper files (ADR-0017).

`src/modules/menu/` is the pattern every future domain module follows:
controller → service → repository interface, with only its own
`infrastructure/` touching storage (ADR-0013 §8). `src/modules/cart/` adds
the write-side pattern on top: pure domain operations, abstract ports for
everything external (storage, the menu, cart identity), and a version check
in the repository contract. `src/modules/order/` reads another write-side
domain through its own port (`CheckoutCart`) rather than its internals. Do
not add a route, a table or migration, payment, or any dependency outside an
approved phase's scope without a new plan — see
[`../../docs/features/phase-6-commerce-api-foundation/`](../../docs/features/phase-6-commerce-api-foundation/),
[`../../docs/features/phase-7-menu-domain/`](../../docs/features/phase-7-menu-domain/),
[`../../docs/features/phase-8-cart-domain/`](../../docs/features/phase-8-cart-domain/),
[`../../docs/features/phase-9-order-domain/`](../../docs/features/phase-9-order-domain/),
and
[`../../docs/features/phase-10-database-persistence/`](../../docs/features/phase-10-database-persistence/).
