# commerce-api

NestJS modular-monolith foundation for the food-ordering platform's commerce
domain (Phase 6). No Menu, Cart, or Order route exists yet — this is the
transport boundary they will be built on: configuration, validation, the
error model, correlation, logging, and `GET /health`.

Read first, in this order:

1. [`../../docs/api/commerce-api.md`](../../docs/api/commerce-api.md) — the
   HTTP conventions this service follows (versioning, error codes, headers).
2. [`../../docs/architecture/architecture-decisions.md`](../../docs/architecture/architecture-decisions.md)
   ADR-0013 — why the toolchain, validation mechanism, and error model are
   what they are.
3. [`../../docs/development/getting-started.md`](../../docs/development/getting-started.md) —
   every command this package actually has, verified.

Do not add a Menu, Cart, or Order route, a database, or any dependency
outside this phase's scope without a new plan — see
[`../../docs/features/phase-6-commerce-api-foundation/`](../../docs/features/phase-6-commerce-api-foundation/).
