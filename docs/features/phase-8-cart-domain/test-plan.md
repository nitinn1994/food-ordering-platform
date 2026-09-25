# Test Plan — Phase 8: Cart Domain & Cart API

Assumes the OD1–OD14 recommendations in `plan.md` §33. Fixture facts used
below come from the Menu seed (Phase 7 AC2): `tiramisu` costs 750 and is
available; `gelato` has `available: false`.

## What will be tested

| AC | How it is verified | Type |
| --- | --- | --- |
| AC1 | e2e: fresh app, `GET /v1/cart`, parse with `cartResponseSchema`, assert empty | automated |
| AC2 | e2e: POST tiramisu ×2 → assert line fields, subtotal, itemCount | automated |
| AC3 | domain: merge; e2e: two POSTs → one line ×5; order test with 2 items, re-add the first | automated |
| AC4 | domain: 98 + 2 throws; e2e: 422 code, then GET shows the prior state | automated |
| AC5 | service with fake catalog; e2e: unknown slug → 404 `MENU_ITEM_NOT_FOUND`; gelato → 422 `MENU_ITEM_UNAVAILABLE`; GET unchanged | automated |
| AC6 | e2e: PATCH sets 7 from 2 → 7 (not 9); bad quantities table → 400 `field:"quantity"`; controller spy not called | automated |
| AC7 | e2e: PATCH/DELETE `garlic-bread` on an empty cart → 404 `CART_ITEM_NOT_FOUND` | automated |
| AC8 | e2e: two lines, DELETE one → one line, recomputed totals | automated |
| AC9 | e2e: malformed `itemId` in path and body, extra key, `text/plain` body → existing codes; no input echoed; both headers on every response | automated |
| AC10 | e2e: requests carrying `X-Cart-Id`, `?cartId=`, `ownerId` in body (→ 400 strict) all hit the same single cart; service test asserts the owner comes only from the resolver | automated |
| AC11 | contract: `unitPriceCents` in the add body rejected; e2e: returned `unitPriceCents` equals `GET /v1/menu/items/:id` `priceCents` | automated |
| AC12 | service test with 3 fakes; review-time grep: `cart/domain/**` has no `@nestjs`, `express`, or `infrastructure` imports; controller read in review | automated + review |
| AC13 | repository: save with a stale version rejects; service: interleaved fake → `CartVersionConflictError`; e2e is not attempted (timing-dependent); freeze test | automated |
| AC14 | `cart.contract-compat.test.ts`: sample intents → projected → parsed by request schemas; `expectTypeOf` field equality | automated |
| AC15 | `api-contracts` drift test; `git diff --stat` shows no forbidden paths | automated + review |
| AC16 | service test for `clearCart`; e2e: `DELETE /v1/cart` → 404 `ROUTE_NOT_FOUND` (proves no route) | automated |
| AC17 | full validation commands below | automated |
| AC18 | manual `curl` walk on `dev` and on `start` | manual |
| AC19 | review checklist against `plan.md` §28 | review |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| Cart schema accept/reject | AC11, AC15 | `packages/contracts/api-contracts/src/cart.test.ts` |
| Schema drift (extended automatically) | AC15 | `packages/contracts/api-contracts/src/schema.test.ts` (unchanged file; `ARTIFACTS` grows) |
| Domain operations | AC3, AC4, AC6–AC8, AC16 | `cart/domain/cart.operations.test.ts` |
| Pricing: line/cart subtotal, itemCount, empty, zero-price item, OD8 unavailable line | AC2, AC8 | `cart/domain/cart.pricing.test.ts` |
| Invariants: duplicate `itemId`, out-of-range quantity | AC12 | `cart/domain/cart.invariants.test.ts` |
| Repository: missing owner → undefined; version conflict; frozen output; clone isolation | AC13 | `cart/infrastructure/in-memory-cart.repository.test.ts` |
| Menu catalog adapter: found / missing / unavailable passthrough | AC5 | `cart/infrastructure/menu-catalog.adapter.test.ts` |
| `MenuService.findItemById`: found / undefined, no throw | OD14 | `menu/menu.service.test.ts` (additive cases only) |
| Service with fakes: all operations and all error paths, owner-from-resolver | AC5, AC10, AC12, AC13, AC16 | `cart/cart.service.test.ts` |
| Module DI resolves controller → service → ports by class type | AC12 | `cart/cart.module.test.ts` |
| Intent ↔ Cart request compatibility | AC14 | `cart/cart.contract-compat.test.ts` |
| HTTP end to end | AC1–AC11, AC16 | `apps/commerce-api/test/cart.e2e.test.ts` |

Each e2e test builds its own app (`buildApp`/`startApp`, the same pattern as
`test/menu.e2e.test.ts`), so each test gets a fresh in-memory cart. There is
no cross-test state.

## Validation commands

These are declared in root `package.json` and `docs/development/getting-started.md`.

| Check | Command | Expected |
| --- | --- | --- |
| format | — | NOT_CONFIGURED (no formatter script exists) |
| schema regen | `pnpm --filter @contracts/api-contracts build` | PASS; the three new `schema/cart*.v1.json` files are written |
| lint | `pnpm turbo run lint` | PASS |
| types | `pnpm turbo run typecheck` | PASS |
| test | `pnpm turbo run test` | PASS; the pre-existing 375 are unchanged in outcome, plus the new tests |
| build | `pnpm turbo run build` | PASS (the known `no output files found` turbo warning for contracts packages is pre-existing) |

Targeted runs between sub-phases: `pnpm --filter @contracts/api-contracts test`
and `pnpm --filter commerce-api test`. These are reported as targeted and do
not count as full validation.

## Manual checks

Run against `pnpm --filter commerce-api dev` (http://127.0.0.1:3001), then
repeat against `build` + `start`:

1. `curl -i /v1/cart` → 200 and an empty cart; both id headers present.
2. `POST /v1/cart/items {"itemId":"tiramisu","quantity":2}` → subtotal 1500.
3. The same POST with `quantity 3` → one line, ×5.
4. `PATCH /v1/cart/items/tiramisu {"quantity":1}` → ×1.
5. `POST … {"itemId":"gelato","quantity":1}` → 422 `MENU_ITEM_UNAVAILABLE`.
6. `DELETE /v1/cart/items/tiramisu` → empty cart; repeat → 404 `CART_ITEM_NOT_FOUND`.
7. `DELETE /v1/cart` → 404 `ROUTE_NOT_FOUND` (per OD5).
8. Restart the process → the cart is empty (in-memory, as documented).

## Not covered

- **True concurrent HTTP races.** These are timing-dependent and flaky over
  real sockets. The lost-update guard is proven deterministically at the
  repository and service level with a controlled interleaving instead.
- **Retry or double-count behaviour of POST.** This is a documented,
  accepted gap (`plan.md` §19). There is no idempotency mechanism to test.
- **Multi-owner isolation.** There is one owner by design (OD3). It gets
  tested when the authentication phase replaces the resolver.
- **A line whose item became unavailable or left the menu.** This cannot
  happen with a static seed. The OD8 behaviour is covered by pure
  `priceCart` unit tests only.
- **Any consumer (web, ai-service).** None is wired in this phase.
- **Python / Pydantic consumption** of the new JSON Schema artifacts. No
  ai-service exists (Phase 5 open question 1, unchanged).
