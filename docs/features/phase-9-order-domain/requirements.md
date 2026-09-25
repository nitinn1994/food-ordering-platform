# Requirements — Phase 9: Order Domain & Order API

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the
full plan including OD1–OD13 and a recommendation on each; the recommendations
are therefore the decisions)
**Risk:** HIGH
**Path:** Full

## Problem

`system-architecture.md` §5 makes `apps/commerce-api` the authority for order
identity, status, prices and totals. Today no order exists anywhere except
`apps/web/src/lib/checkout/order.ts`, a client-side simulation that
knowingly violates that authority model (ADR-0011;
`food-ordering-frontend-mvp.md` §7 item 4). Phase 8 built the authoritative
Cart and left three things for this phase explicitly: snapshotting unit
prices at placement (ADR-0015 §2), refusing to place an order containing an
unavailable line (ADR-0015 consequences), and calling `CartService.clearCart`
as the internal mechanism of a placed order (Phase 8 OD5; ADR-0011). The
first real idempotency need — a retried order creation producing a
duplicate order — is `system-architecture.md` §8 gap 3.

## Goal

An Order domain in `apps/commerce-api`, layered controller → service → pure
domain → ports → in-memory adapters (the Phase 7/8 pattern), exposing
`POST /v1/orders` and `GET /v1/orders/:orderId` whose shapes are defined in
`@contracts/api-contracts`. Placing an order validates and consumes the
server-side cart, snapshots names, unit prices and quantities, fixes the
totals, records customer details, and is safe to retry through a required
idempotency key. No payment. No consumer is connected.

## Risk assessment (Full Path)

Carried from `/forge`: **HIGH**, set by four dimensions.

- **Data:** the first personal data in the system (customer name, phone,
  optional email).
- **User / business impact:** fixes the money figures (`totalCents`) a
  future payment will charge.
- **Architecture:** the first concrete idempotency design; the snapshot,
  status and cart-consumption decisions are inherited by Payment.
- **Scope:** modifies Phase 8's Cart module (additive methods and exports).

API compatibility is additive (new routes, a new contract module); no
infrastructure change.

- **Blast radius:** `apps/commerce-api` only; nothing calls it. The future
  blast radius is the Payment and integration phases building on these
  decisions.
- **Reversibility:** code is fully revertible (new module; additive Cart
  and contract changes). Orders are in-memory — no data to recover. The
  decisions (ADR-0016) are the hard-to-reverse part.
- **Detection:** unit, repository, service, module, contract and e2e tests;
  `curl` walk on `dev` and `start`; specialised security and data review.

## Existing requirements (inherited)

| Source | Requirement |
| --- | --- |
| `CLAUDE.md`, `system-architecture.md` §5 | commerce-api is authoritative for orders; AI never mutates order state directly |
| ADR-0015 §2 | Cart prices are live; Order snapshots unit prices at placement |
| ADR-0015 consequences | refusing to place an order with an unavailable line is Order's decision |
| Phase 8 OD5, ADR-0011, Phase 5 D7 | clearing the cart is the internal mechanism of a placed order; no user-facing clear |
| Phase 4 D2, D3 | no delivery/pickup selection, no address fields |
| Phase 4 D4 | full name required, phone required, email optional |
| Phase 4 D5 | no tax/fee/tip/discount; `totalCents === subtotalCents` |
| Phase 5 D2 | `PlaceOrder` intent is a declined candidate |
| Phase 5 D9 | timestamps on the wire are ISO-8601 |
| `@contracts/common` | `idempotencyKeySchema` (1–128), `quantitySchema`, `priceCentsSchema`, `menuItemIdSchema` |
| Phase 6 / `commerce-api.md` §1–§7 | `/v1`; strict schemas via `@Body/@Param({ schema })`; errors are exactly a `ContractError`; never echo input; 422 domain-rule; 409 conflict |
| Phase 6 request logging | method, path, status, duration only — never the body |
| `CLAUDE.md` deferred list | no auth, no database, no real payments, no AI |

## In scope

- `@contracts/api-contracts`: order request/response/params schemas, two
  committed JSON Schema artifacts, drift test.
- `apps/commerce-api/src/modules/order/`: pure domain, four ports, in-memory
  repository, Cart adapters, ID generator, service, mapper, controller,
  module.
- Additive `CartService.prepareCheckout` / `completeCheckout`; `CartModule`
  exports `CartService` and `CartOwnerResolver`.
- Three new error codes.
- Tests (contracts, domain, repository, adapters, service with fakes,
  module, e2e).
- Documentation listed in `plan.md` §27, including ADR-0016.

## Out of scope

Payment of any kind, authentication, authorization, customer accounts,
database/ORM, Python AI, LangChain, LangGraph, OpenAI, RAG, voice, MCP,
Redis, Kafka, RabbitMQ, microservices, Kubernetes, deployment, CORS, any
`apps/web` change, a `PlaceOrder` intent, an intent-execution endpoint,
`GET /v1/orders` (list/history), order status transitions or cancellation,
delivery/fulfilment information, fees/tax/discounts, a price-change guard
(`expectedTotalCents`), a human-readable order reference, order retention
or eviction, any change to `packages/contracts/{common,ui-commands,agent-intents}`.

## Acceptance criteria

- [x] **AC1** With a cart of `tiramisu ×2` and `garlic-bread ×1`,
      `POST /v1/orders` → 201; the body parses against `orderResponseSchema`;
      each line's `name`/`unitPriceCents` equal the Menu's values at
      placement; `lineSubtotalCents = unit × qty`; `subtotalCents = Σ lines`;
      `totalCents = subtotalCents`; `itemCount = Σ qty`; `status: "placed"`;
      `placedAt` is ISO-8601.
- [x] **AC2** After AC1, `GET /v1/cart` returns an empty cart.
- [x] **AC3** `GET /v1/orders/:orderId` returns a body equal to AC1's; an
      unknown well-formed UUID → 404 `ORDER_NOT_FOUND`; a malformed id → 400
      `INVALID_PAYLOAD`.
- [x] **AC4** Replaying the same `idempotencyKey` with the same `customer` →
      201 with the identical body (same `orderId`); exactly one order is
      stored; the cart is not touched (items added after the first placement
      remain).
- [x] **AC5** The same key with a different `customer` → 409
      `IDEMPOTENCY_KEY_REUSED`; no order is created and the cart is unchanged.
- [x] **AC6** Placing with an empty cart → 422 `CART_EMPTY`; no order stored.
- [x] **AC7** A cart with an unavailable line, or a line whose item is no
      longer on the menu → 422 `MENU_ITEM_UNAVAILABLE`; the cart is kept; no
      order stored (service level — unreachable over HTTP with the static
      seed).
- [x] **AC8** A cart that changes between pricing and consumption → 409
      `CART_CONFLICT`, no order stored; two interleaved placements yield
      exactly one order.
- [x] **AC9** A Menu price/name change after placement leaves the stored
      order unchanged (service level); returned orders are immutable
      (mutation throws).
- [x] **AC10** Any `items`, price, total, `status`, `cartId`, `ownerId` or
      other unknown key in the body → 400; customer-field rules enforced;
      no customer value or idempotency key appears in any error body.
- [x] **AC11** Layering: the controller has no branching; `OrderService`
      depends only on abstract ports (`OrderRepository`, `CheckoutCart`,
      `OrderOwnerResolver`, `OrderIdGenerator`); `order/domain/**` imports
      nothing from `@nestjs/*`, `express`, `infrastructure/`, or
      `modules/cart`; service tests pass with fakes.
- [x] **AC12** Every pre-existing test is unchanged in count and outcome;
      only additive Cart tests are added to Cart files.
- [x] **AC13** `@contracts/api-contracts` drift test green; no file in
      `common`, `ui-commands`, `agent-intents`, or `apps/web` changes.
- [x] **AC14** `pnpm turbo run lint`, `typecheck`, `test`, `build` pass.
- [x] **AC15** `dev` and `start` both serve the order routes (verified by
      `curl`), and a restart empties orders.
- [x] **AC16** Every document in `plan.md` §27 is updated in the same change.

AC4, AC5, AC8, AC9 and AC10 are the ones worth failing the phase over.

## Open decisions

OD1–OD13 in `plan.md` §31 were approved as recommended on 2026-09-25.
