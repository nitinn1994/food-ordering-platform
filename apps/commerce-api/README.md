# commerce-api

NestJS modular-monolith for the food-ordering platform's commerce domain.
Phase 6 built the transport boundary — configuration, validation, the error
model, correlation, logging, and `GET /health`. Phase 7 built the first
domain on top of it: a read-only Menu, `GET /v1/menu` and
`GET /v1/menu/items/:itemId`. Phase 8 added a Cart (the first domain with
writes): `GET /v1/cart`, `POST /v1/cart/items`, and `PATCH`/`DELETE
/v1/cart/items/:itemId`, in-memory and single-owner. No Order route exists
yet.

Read first, in this order:

1. [`../../docs/api/commerce-api.md`](../../docs/api/commerce-api.md) — the
   HTTP conventions this service follows (versioning, error codes, headers,
   §11 for the Menu routes, and §12 for the Cart routes).
2. [`../../docs/architecture/architecture-decisions.md`](../../docs/architecture/architecture-decisions.md)
   ADR-0013 — why the toolchain, validation mechanism, and error model are
   what they are; ADR-0014 — why Menu is in-memory, where its response
   shapes live, and how a domain error becomes an HTTP response; ADR-0015 —
   Cart's identity, pricing, storage, and concurrency decisions.
3. [`../../docs/development/getting-started.md`](../../docs/development/getting-started.md) —
   every command this package actually has, verified.

`src/modules/menu/` is the pattern every future domain module follows:
controller → service → repository interface, with only its own
`infrastructure/` touching storage (ADR-0013 §8). `src/modules/cart/` adds
the write-side pattern on top: pure domain operations, abstract ports for
everything external (storage, the menu, cart identity), and a version check
in the repository contract. Do not add an Order route, a real database, or
any dependency outside an approved phase's scope without a new plan — see
[`../../docs/features/phase-6-commerce-api-foundation/`](../../docs/features/phase-6-commerce-api-foundation/),
[`../../docs/features/phase-7-menu-domain/`](../../docs/features/phase-7-menu-domain/),
and
[`../../docs/features/phase-8-cart-domain/`](../../docs/features/phase-8-cart-domain/).
