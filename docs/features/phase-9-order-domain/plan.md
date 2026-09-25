# Plan — Phase 9: Order Domain & Order API

**Approval Status:** APPROVED (2026-09-25, OD1–OD13 as recommended)

Labels: **[EXISTING]** inherited requirement with its source · **[PROPOSED]**
this plan's design · **[ODn]** decision in §31 · **[DEFERRED]** deliberately
not done.

### Findings from inspection that correct the brief

1. The route prefix is `/v1`, not `/api/v1` (Phase 7 OD1, ADR-0013).
2. `itemId`, not `productId` (Phase 5 intents, Phase 7 OD2).
3. Phase 4 D2/D3 declined delivery/pickup and address fields; no product
   document defines delivery information (OD4).
4. Phase 4 D5: no tax/fee/tip/discount; `totalCents = subtotalCents`.
5. Phase 4 D4 fixed customer fields (full name ≤ 100 required, phone 7–20
   digits required, email optional) — an admitted recommendation, not a spec.
6. Phase 5 D2 declined a `PlaceOrder` intent. This phase supplies its
   blockers (customer fields, idempotency) but does not add it.
7. ADR-0015 already decided pricing: live cart prices, Order snapshots at
   placement. `CartService.clearCart` exists for this phase (Phase 8 OD5).
8. `priceCart` silently drops a line whose item left the menu. Correct for a
   cart view; an order must detect and reject it (§10).
9. Phase 8 has no validation / final-review / completion-summary files —
   only `requirements.md`, `plan.md`, `test-plan.md`, `review-report.md`
   (APPROVE; no BLOCKER/HIGH/MEDIUM). `getting-started.md` records 503
   tests. The suite was not re-run during planning.
10. There is no validated-header mechanism — only `@Param/@Body({ schema })`
    (OD7).

---

## 1. Objective

[PROPOSED] Make commerce-api the authoritative creator of orders: validate
the current cart, snapshot item names, unit prices and quantities, fix the
totals, record customer details, consume the cart — retry-safe through an
idempotency key, duplicate-proof, and payment-free.

## 2. Order domain model

```text
Order
├── id: OrderId                   — server-generated UUID (OD13)
├── ownerId: OrderOwnerId         — resolved server-side (same single owner as Cart)
├── idempotencyKey: IdempotencyKey — scoped per owner (§11)
├── lines: OrderLine[]            — ≥ 1, cart line order
├── itemCount: number             — Σ quantity
├── subtotalCents: PriceCents     — Σ lineSubtotalCents
├── totalCents: PriceCents        — = subtotalCents (Phase 4 D5)
├── status: OrderStatus           — §4
├── customer: CustomerDetails     — §8
├── createdAt: Date
└── updatedAt: Date               — = createdAt; nothing mutates an order yet
```

No `version` (insert-only; nothing updates an order) [DEFERRED → the
status-transition phase]. No fees, no delivery.

## 3. Order-item model

```text
OrderLine (immutable snapshot)
├── itemId            — reference only
├── name              — snapshot
├── unitPriceCents    — snapshot at placement
├── quantity          — snapshot
└── lineSubtotalCents — unitPriceCents × quantity
```

No `available` (every line was available at placement by construction).

## 4. Order status model

[OD3] One status: `placed` — accepted by commerce-api, no payment taken. No
transitions. Wire: `z.enum(["placed"])`. Future states are the owning
phase's contract change; the Payment phase decides whether the initial
status becomes `awaiting_payment`.

## 5. Cart-to-order flow

`OrderService.placeOrder(request)`:

```text
1. owner    ← OrderOwnerResolver.resolve()
2. existing ← OrderRepository.findByIdempotencyKey(owner, key)
   ├ same customer      → return it (replay)
   └ different customer → 409 IDEMPOTENCY_KEY_REUSED
3. checkout ← CheckoutCart.load()    { ownerId, version, lines (priced), unpricedLineCount }
4. order    ← createOrder(...)       pure; 422 CART_EMPTY / MENU_ITEM_UNAVAILABLE
5. CheckoutCart.consume(version)     clears only at that version; else 409 CART_CONFLICT
6. OrderRepository.create(order)
7. toOrderResponse(order)            201
```

- Idempotency lookup first: a success clears the cart, so a retry would
  otherwise hit `CART_EMPTY`.
- [OD11] Cart consumed **before** the order is written. The cart's version
  check serializes concurrent placements (same or different keys): only one
  can consume version *v*. Order-first would allow an order whose cart was
  never consumed. Cost: if step 6 throws after step 5 the cart is lost with
  no order — only reachable through a programming error with in-memory
  storage; the database phase must put 5 and 6 in one transaction
  (ADR-0016).

## 6. Snapshot strategy

The order copies `name`, `unitPriceCents`, `quantity`, `lineSubtotalCents`
from Cart's own `priceCart` output at placement. Order never re-prices and
never reads Menu, so the order total equals what `GET /v1/cart` showed at
that instant. Stored orders are deep-frozen clones; later Menu changes
cannot reach them.

## 7. Pricing strategy

[EXISTING] line = unit × qty; subtotal = Σ lines; `totalCents = subtotalCents`
on its own line (OD5). Integer cents, no currency, no fees.

## 8. Customer-information model

[EXISTING Phase 4 D4 → contract, OD6]

- `fullName`: 1–100 chars, no leading/trailing whitespace.
- `phone`: ≤ 32 chars; optional leading `+`; digits with spaces, `-`, `(`,
  `)`; 7–20 digits.
- `email`: optional (absent, never `""`); ≤ 254 chars; the web's simple
  shape check.

Expressed as bounds and regexes only (no transform/refine) so the JSON
Schema is faithful for Python (ADR-0003). The caller trims; the server
rejects rather than normalizes. Personal data: never logged, never in an
error, returned only to the owner.

## 9. Delivery-information model

[OD4] None (Phase 4 D2/D3). An optional fulfilment object is additive later.
[DEFERRED → product decision]

## 10. Order creation rules

| Rule | Error |
| --- | --- |
| Cart has ≥ 1 line | 422 `CART_EMPTY` |
| Every line available | 422 `MENU_ITEM_UNAVAILABLE` |
| No cart line dropped by `priceCart` (`unpricedLineCount === 0`) | 422 `MENU_ITEM_UNAVAILABLE` (OD9) |
| Unique `itemId`s, quantities 1..99, totals = sums | `assertOrderInvariants` (programming error if violated) |
| No price, total, items, status, cart or owner id from the caller | 400 (strict schema) |
| Cart consumed only at the priced version | 409 `CART_CONFLICT` |

No cart lifecycle state is introduced; the version check is the lock.

## 11. Idempotency strategy

[OD7] `idempotencyKey` required in the body (`@contracts/common`
`idempotencyKeySchema`, 1–128), scoped by (ownerId, key), stored on the
order (no separate store; retention = the order's lifetime). Fingerprint =
the validated `customer`; the cart is server state and is legitimately
empty on replay. Concurrency is serialized by the cart version (§5); the
repository also rejects a duplicate id or (owner, key).

## 12. Duplicate-request behavior

| Case | Result |
| --- | --- |
| Same key + same customer after success | 201, identical original order; cart untouched |
| Same key + different customer | 409 `IDEMPOTENCY_KEY_REUSED`; nothing changes |
| Same key while the first is in flight | 409 `CART_CONFLICT`, or 422 `CART_EMPTY` if the winner already consumed the cart; a retry replays |
| New key, cart already consumed | 422 `CART_EMPTY` |

[OD8] A replay returns the same status (201) and body; no replay header.
The controller stays branch-free.

## 13. API endpoints

[OD2]

| Method | Route | Success |
| --- | --- | --- |
| `POST` | `/v1/orders` | 201 `OrderResponse` |
| `GET` | `/v1/orders/:orderId` | 200 `OrderResponse` |

No `GET /v1/orders` — history/tracking is out of scope (product doc §11).
GET is owner-scoped: another owner's order is 404.

## 14. Request/response contracts

New `packages/contracts/api-contracts/src/order.ts`, strict objects:

```ts
orderIdSchema            = lowercase UUID string (regex)
orderStatusSchema        = z.enum(["placed"])
customerDetailsSchema    = §8
createOrderRequestSchema = { idempotencyKey, customer }
orderParamsSchema        = { orderId }
orderLineSchema          = { itemId, name (1..80), unitPriceCents, quantity, lineSubtotalCents }
orderResponseSchema      = { orderId, status, placedAt (ISO-8601), customer,
                             items: orderLineSchema[] (min 1), itemCount,
                             subtotalCents, totalCents }
```

Artifacts: `order.v1.json`, `order-create-request.v1.json`. `orderIdSchema`
stays in `api-contracts` (no `common` change). No owner, key, version or
`updatedAt` on the wire.

## 15. Validation rules

Pipe (400, handler not invoked): shape, unknown keys, missing/oversized key,
customer rules, malformed `orderId`; existing 413/415. Domain (422): empty,
unavailable, unpriced. Service (409): key reuse, cart conflict.

## 16. Error model

[EXISTING format; no filter change; static messages]

| Status | Code | When | New? |
| --- | --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | §15 | existing |
| 404 | `ORDER_NOT_FOUND` | unknown id or another owner's order | new |
| 422 | `CART_EMPTY` | empty cart | new |
| 422 | `MENU_ITEM_UNAVAILABLE` | unavailable or no-longer-on-menu line | reused |
| 409 | `CART_CONFLICT` | cart changed between pricing and consumption | reused |
| 409 | `IDEMPOTENCY_KEY_REUSED` | same key, different request | new |
| 500 | `INTERNAL_ERROR` | order write failed after consumption | existing |

## 17. Repository abstraction

```ts
abstract class OrderRepository {
  abstract create(order: Order): Promise<void>; // rejects duplicate id or (ownerId, key)
  abstract findById(ownerId, orderId): Promise<Order | undefined>;
  abstract findByIdempotencyKey(ownerId, key): Promise<Order | undefined>;
}
```

Owner-scoped reads; `undefined`, not a throw, for none; no update/delete.
A database implements `create` with unique constraints.

## 18. Data-source strategy

[OD10] `InMemoryOrderRepository`: `Map` by id + `(owner, key)` index,
`structuredClone` + shared `deepFreeze`. ADR-0004 → Accepted for Order.
Lost on restart. Unbounded growth accepted for local dev [DEFERRED].

## 19. Controller responsibilities

`@Controller("orders")`: `@Post() @HttpCode(201)` with
`@Body({ schema: createOrderRequestSchema })`; `@Get(":orderId")` with
`@Param({ schema: orderParamsSchema })`. One service call each, no branching.

## 20. Application-service responsibilities

`placeOrder` (§5) and `getOrder` (resolve owner → `findById` →
`OrderNotFoundError` or map). Depends only on `OrderRepository`,
`CheckoutCart`, `OrderOwnerResolver`, `OrderIdGenerator`. `now` is created
in the service.

## 21. Domain responsibilities

`order/domain/`: types, `createOrder` (pure: validate, snapshot, total),
`assertOrderInvariants`, errors, four ports. Imports nothing from
`@nestjs/*`, `express`, `infrastructure/`, or `modules/cart`.

## 22. Cart integration

[OD1]

```text
OrderService → CheckoutCart (Order port) ← CartCheckoutAdapter → CartService.prepareCheckout / completeCheckout
OrderService → OrderOwnerResolver (Order port) ← CartOwnerAdapter → CartOwnerResolver (exported)
```

Additive Cart changes: `prepareCheckout()` → `{ ownerId, version, lines:
PricedCartLine[], unpricedLineCount }` via the existing `priceCart`;
`completeCheckout(expectedVersion)` clears only if the stored version
equals `expectedVersion`, else `CartVersionConflictError`; `CartModule`
exports `CartService` and `CartOwnerResolver`. `clearCart()` unchanged.
One identity binding for both domains.

## 23. Contract integration

`api-contracts` gains `order.ts`. `common`, `ui-commands`, `agent-intents`
unchanged. No `PlaceOrder` intent, no intent-execution endpoint; the
unblocked status of the Phase 5 D2 candidate is recorded in `contracts.md`
as follow-up.

## 24. Testing strategy

See `test-plan.md`.

## 25. Security considerations

- Personal data: in memory only, returned only to the owner, never logged
  or put in errors.
- Identity from the resolver only; nothing in the request selects a cart or
  owner.
- No amount accepted from input.
- No list route; random UUID ids; owner-scoped GET → 404. Not access
  control — single owner, no auth (§8 gap 4 unchanged).
- Keys bounded; reuse with a different request refused.
- Unbounded in-memory growth (§18).

## 26. Files to create

| File | Purpose |
| --- | --- |
| `packages/contracts/api-contracts/src/order.ts` (+ `.test.ts`) | Schemas |
| `packages/contracts/api-contracts/schema/order.v1.json` | Generated |
| `packages/contracts/api-contracts/schema/order-create-request.v1.json` | Generated |
| `apps/commerce-api/src/modules/order/domain/order.types.ts` | Types |
| `…/order/domain/order.create.ts` (+ test) | `createOrder` |
| `…/order/domain/order.invariants.ts` (+ test) | Invariants |
| `…/order/domain/order.errors.ts` | `DomainError` subclasses |
| `…/order/domain/order.repository.ts` | Port |
| `…/order/domain/checkout-cart.ts` | Port |
| `…/order/domain/order-owner.resolver.ts` | Port |
| `…/order/domain/order-id.generator.ts` | Port |
| `…/order/infrastructure/in-memory-order.repository.ts` (+ test) | Adapter |
| `…/order/infrastructure/cart-checkout.adapter.ts` (+ test) | Adapter → `CartService` |
| `…/order/infrastructure/cart-owner.adapter.ts` | Adapter → `CartOwnerResolver` |
| `…/order/infrastructure/uuid-order-id.generator.ts` | Adapter (`node:crypto`) |
| `…/order/order.service.ts` (+ test) | Use cases |
| `…/order/order.mapper.ts` | Domain → wire |
| `…/order/order.controller.ts` | Routes |
| `…/order/order.module.ts` (+ test) | DI |
| `apps/commerce-api/test/order.e2e.test.ts` | HTTP |

## 27. Files to modify

| File | Change |
| --- | --- |
| `packages/contracts/api-contracts/src/index.ts` | Export order schemas/types |
| `packages/contracts/api-contracts/scripts/emit-schema.ts` | 2 `ARTIFACTS` |
| `apps/commerce-api/src/modules/cart/cart.service.ts` (+ test) | Additive `prepareCheckout`, `completeCheckout` |
| `apps/commerce-api/src/modules/cart/cart.module.ts` (+ test) | `exports` |
| `apps/commerce-api/src/common/errors/api-error-codes.ts` | 3 codes |
| `apps/commerce-api/src/app.module.ts` | Import `OrderModule` |
| `docs/architecture/architecture-decisions.md` | ADR-0016; ADR-0004 → Accepted for Order; ADR-0011 note |
| `docs/architecture/system-architecture.md` | §8 gap 3, gap 4 |
| `docs/api/commerce-api.md` | Status line, §6 codes, Orders section, "does not cover" |
| `docs/api/contracts.md` | Order module; `PlaceOrder` candidate status |
| `docs/development/getting-started.md` | Routes, test counts |
| `docs/product/food-ordering-frontend-mvp.md` | §15 Phase 9 additions |
| `apps/commerce-api/README.md` | Routes |

Unchanged: `apps/web`, `packages/contracts/{common,ui-commands,agent-intents}`,
`all-exceptions.filter.ts`, `configure-app.ts`, `eslint.config.mjs`,
dependencies (`pnpm-lock.yaml` expected unchanged).

## 28. Acceptance criteria

AC1–AC16 in `requirements.md`.

## 29. Validation commands

| Check | Command |
| --- | --- |
| Regenerate schemas | `pnpm --filter @contracts/api-contracts build` |
| Lint | `pnpm turbo run lint` |
| Types | `pnpm turbo run typecheck` |
| Test | `pnpm turbo run test` |
| Build | `pnpm turbo run build` |
| Run (dev) | `pnpm --filter commerce-api dev` + `curl` |
| Run (built) | `pnpm --filter commerce-api build && pnpm --filter commerce-api start` + `curl` |

Format: `NOT_CONFIGURED`. Targeted `pnpm --filter <pkg> test` between
sub-phases; full set before `/review`.

## 30. Risks

| Risk | Impact | Handling |
| --- | --- | --- |
| Cart consumed, order write fails | Cart lost, no order | Programming-error-only in memory; DB phase uses a transaction; ADR-0016 |
| Order idempotency taken as the design for all intents | Wrong generalization | Scoped explicitly; §8 gap 3 stays open for others |
| Cart changes regress Phase 8 | Cart API behaviour changes | Additive only; pre-existing Cart tests unchanged (AC12) |
| Personal data leak via logs/errors | Privacy | Static messages; body never logged; security review |
| Phase 4 fields harden into a spec | Product drift | Recorded as inherited recommendation (OD6) |
| Single-status enum | Payment-phase contract change | Documented in ADR-0016 |
| Five sub-phases | Large review | Each independently green |

## 31. Open architectural decisions (approved as recommended)

| # | Decision |
| --- | --- |
| OD1 | Order-owned `CheckoutCart` port; additive `CartService.prepareCheckout`/`completeCheckout`; `priceCart` is the single pricing function |
| OD2 | `POST /v1/orders` + `GET /v1/orders/:orderId`; no list |
| OD3 | Status `placed` only |
| OD4 | No delivery information |
| OD5 | `subtotalCents` + separate `totalCents` (equal); no fees |
| OD6 | Phase 4 D4 customer rules as a strict schema; email optional and absent when blank |
| OD7 | Required body `idempotencyKey`, scoped (owner, key), stored with the order |
| OD8 | Replay returns the same 201 and body; no replay header |
| OD9 | New `ORDER_NOT_FOUND`, `CART_EMPTY`, `IDEMPOTENCY_KEY_REUSED`; reuse `MENU_ITEM_UNAVAILABLE`, `CART_CONFLICT` |
| OD10 | In-memory storage; ADR-0004 Accepted for Order; ADR-0016 |
| OD11 | Consume the cart (version-checked) before writing the order |
| OD12 | No price-change guard now |
| OD13 | Random UUID ids via an `OrderIdGenerator` port |

## 32. Implementation order

### 9.1 — Order contracts
- [x] `order.ts`; export; 2 `ARTIFACTS`; regenerate.
- [x] `order.test.ts`.
- **Done when:** `pnpm --filter @contracts/api-contracts test` passes, drift green.

### 9.2 — Pure Order domain
- [x] Types, `createOrder`, invariants, errors, four ports.
- [x] Unit tests.
- **Done when:** domain tests pass; no framework/cart imports.

### 9.3 — Cart integration, adapters, service
- [x] `CartService.prepareCheckout`/`completeCheckout` + tests; `CartModule` exports.
- [x] In-memory repository, Cart adapters, UUID generator.
- [x] `OrderService` + tests with fakes.
- **Done when:** `pnpm --filter commerce-api test` passes; pre-existing Cart/Menu tests unchanged.

### 9.4 — HTTP surface
- [x] Error codes; mapper; controller; `OrderModule`; `AppModule` import.
- [x] Module DI test; `test/order.e2e.test.ts`.
- **Done when:** full commerce-api tests pass; `dev` `curl` walk works.

### 9.5 — Documentation and full validation
- [x] §27 docs; ADR-0016.
- [x] Full lint/typecheck/test/build; `start` + `curl`.
- **Done when:** AC14–AC16 met and recorded.

## 33. Expected repository structure

```text
packages/contracts/api-contracts/
  src/{menu,cart,order}.ts  schema/{…,order,order-create-request}.v1.json
apps/commerce-api/src/modules/
  cart/   (cart.service.ts + 2 methods; cart.module.ts + exports)
  order/
    domain/          order.types.ts order.create.ts order.invariants.ts order.errors.ts
                     order.repository.ts checkout-cart.ts order-owner.resolver.ts order-id.generator.ts
    infrastructure/  in-memory-order.repository.ts cart-checkout.adapter.ts
                     cart-owner.adapter.ts uuid-order-id.generator.ts
    order.service.ts order.mapper.ts order.controller.ts order.module.ts *.test.ts
apps/commerce-api/test/order.e2e.test.ts
docs/features/phase-9-order-domain/{requirements,plan,test-plan}.md
```

---

## Assumptions

**Verified by reading:** `CartService.clearCart` exists with no caller;
`priceCart` drops lines whose item left the menu; `idempotencyKeySchema`
exists in `@contracts/common`; request logging excludes the body;
`node:crypto` `randomUUID` is already used; `AllExceptionsFilter` maps
`DomainError` status/code verbatim.

**Not verified:** that the suite passes at HEAD (not re-run during
planning); that a one-value `z.enum` and the customer regexes emit clean
JSON Schema (checked in 9.1).

## Not doing

Everything in `requirements.md` "Out of scope".

## Specialised review needed?

- **security: yes** — personal data handling, identity, price/total
  authority, error non-echo, idempotency misuse.
- **performance: no** — bounded data, in-memory.
- **data / migration: yes** — the §5 consumption ordering, the repository
  uniqueness contract, and the transaction requirement a database adapter
  inherits.
