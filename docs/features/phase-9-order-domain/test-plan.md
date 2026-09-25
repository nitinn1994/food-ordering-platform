# Test Plan — Phase 9: Order Domain & Order API

Assumes the OD1–OD13 recommendations in `plan.md` §31. Fixture facts from
the Menu seed (Phase 7 AC2): `tiramisu` costs 750 and is available; `gelato`
has `available: false` (so it can never reach a cart over HTTP).

## What will be tested

| AC | How it is verified | Type |
| --- | --- | --- |
| AC1 | e2e: add `tiramisu ×2`, `garlic-bread ×1`; POST → 201; parse with `orderResponseSchema`; assert lines equal `GET /v1/menu/items/:id` values; totals; status; `placedAt` ISO | automated |
| AC2 | e2e: after AC1, `GET /v1/cart` empty | automated |
| AC3 | e2e: GET by id equals POST body; random UUID → 404 `ORDER_NOT_FOUND`; malformed → 400 | automated |
| AC4 | e2e: POST twice with same key and customer → same body; add an item between → it stays in the cart. Service: repository holds one order | automated |
| AC5 | e2e: same key, different `fullName` → 409 `IDEMPOTENCY_KEY_REUSED`; cart unchanged | automated |
| AC6 | e2e: fresh app, POST → 422 `CART_EMPTY`; service: no `create` call | automated |
| AC7 | domain: unavailable line / `unpricedLineCount > 0` throw; service with fake cart: 422, `consume` and `create` not called | automated |
| AC8 | service: fake `CheckoutCart.consume` throws `CartVersionConflictError` → 409, no `create`; Cart service: `completeCheckout` with stale version rejects; service interleaving test: two concurrent `placeOrder` → exactly one fulfilled | automated |
| AC9 | service: fake cart whose prices change after placement → `getOrder` unchanged; repository: returned order frozen | automated |
| AC10 | contract: strict rejection of `items`, `totalCents`, `unitPriceCents`, `status`, `cartId`, `ownerId`; customer field table; e2e: several → 400, error bodies contain no submitted name/phone/email/key | automated |
| AC11 | service tests with four fakes; review grep: `order/domain/**` has no `@nestjs`, `express`, `infrastructure`, `modules/cart` imports | automated + review |
| AC12 | pre-existing test counts compared before/after | automated + review |
| AC13 | drift test; `git status` on forbidden paths | automated + review |
| AC14 | full validation commands below | automated |
| AC15 | manual `curl` walk on `dev` and `start`; restart | manual |
| AC16 | checklist against `plan.md` §27 | review |

## New or changed tests

| Test | File |
| --- | --- |
| Order schema accept/reject | `packages/contracts/api-contracts/src/order.test.ts` |
| Drift (extended via `ARTIFACTS`) | `packages/contracts/api-contracts/src/schema.test.ts` (unchanged file) |
| `createOrder`: snapshot, totals, empty, unavailable, unpriced, `totalCents === subtotalCents` | `order/domain/order.create.test.ts` |
| Invariants | `order/domain/order.invariants.test.ts` |
| Repository: create/find, duplicate id, duplicate (owner, key), owner scoping, freeze, clone isolation | `order/infrastructure/in-memory-order.repository.test.ts` |
| Cart checkout adapter | `order/infrastructure/cart-checkout.adapter.test.ts` |
| `CartService.prepareCheckout` / `completeCheckout` (additive cases) | `cart/cart.service.test.ts` |
| `CartModule` exports (additive) | `cart/cart.module.test.ts` |
| `OrderService` with fakes: all §5 paths | `order/order.service.test.ts` |
| Module DI | `order/order.module.test.ts` |
| HTTP end to end | `apps/commerce-api/test/order.e2e.test.ts` |

Each e2e test builds its own app, so cart and orders start empty.

## Validation commands

| Check | Command | Expected |
| --- | --- | --- |
| format | — | NOT_CONFIGURED |
| schema regen | `pnpm --filter @contracts/api-contracts build` | PASS; two new artifacts |
| lint | `pnpm turbo run lint` | PASS |
| types | `pnpm turbo run typecheck` | PASS |
| test | `pnpm turbo run test` | PASS; the 503 pre-existing unchanged in outcome, plus new |
| build | `pnpm turbo run build` | PASS (pre-existing turbo `no output files found` warning for contracts) |

Targeted between sub-phases: `pnpm --filter @contracts/api-contracts test`,
`pnpm --filter commerce-api test` — reported as targeted.

## Manual checks

Against `pnpm --filter commerce-api dev` (http://127.0.0.1:3001), then `build` + `start`:

1. `POST /v1/orders` on an empty cart → 422 `CART_EMPTY`.
2. Add `tiramisu ×2`; `POST /v1/orders` with a key and customer → 201.
3. `GET /v1/cart` → empty.
4. `GET /v1/orders/<id>` → same body.
5. Repeat step 2's POST → same `orderId`.
6. Same key, different name → 409 `IDEMPOTENCY_KEY_REUSED`.
7. Body with `totalCents` → 400.
8. `GET /v1/orders` → 404 `ROUTE_NOT_FOUND` (no list route).
9. Restart → the order id is 404.

## Not covered

- True concurrent HTTP races (proved by service-level interleaving instead).
- Menu price changes and unavailable lines over HTTP (static seed; service
  level only).
- Failure of the order write after cart consumption beyond a service-level
  fake (in-memory store cannot fail naturally).
- Multi-owner isolation (single owner by design).
- Any consumer (web, ai-service); Python consumption of the JSON Schema.
