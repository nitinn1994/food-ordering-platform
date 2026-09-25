# Requirements — Phase 8: Cart Domain & Cart API

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the
full plan including OD1–OD14 and a recommendation on each; the recommendations
are therefore the decisions)
**Risk:** HIGH
**Path:** Full

## Problem

`system-architecture.md` §5 makes `apps/commerce-api` the authority for cart
contents, quantities, prices and totals. Today none of that authority exists:
the only cart is `apps/web/src/lib/state/cartStore.tsx` (client state) priced
by `apps/web/src/lib/cart/pricing.ts` (client math), both marked temporary in
`food-ordering-frontend-mvp.md` §7 items 2 and 3. Phase 5 adopted three cart
business intents (`AddItemToCart`, `RemoveItemFromCart`,
`SetCartItemQuantity`) that have no executor. Phase 7 left availability
enforcement explicitly to "whichever phase adds a Cart" (`commerce-api.md`
§11; Phase 7 open question 3) and left the storage decision for Cart open
(ADR-0004 still `Proposed` for Cart; ADR-0014).

## Goal

A Cart domain in `apps/commerce-api`, layered controller → service → pure
domain → repository port → in-memory adapter, exposing a `/v1/cart` HTTP
surface whose request and response shapes are defined in
`@contracts/api-contracts`, validating every item against the Menu domain and
pricing every line from the current menu price. No consumer is connected.

## Risk assessment (Full Path)

Carried from `/forge`: **HIGH**, set by two dimensions.

- **Security / trust boundary:** the first mutable state in the API, with a
  cart identity and no authentication behind it.
- **Architecture:** the pricing strategy and the repository contract chosen
  here are inherited by the Order domain; ADR-0004 is decided for Cart here.

Other dimensions are MEDIUM or lower: data impact is new writes with no
schema/migration (there is no database); API compatibility is additive (new
routes, a new contract module, no change to shipped contracts); no
infrastructure change.

- **Blast radius:** `apps/commerce-api` only. No consumer calls it — `apps/web`
  keeps its local cart; `ai-service` does not exist. A defect is invisible to
  users today; it becomes visible when the integration phase wires a caller.
  The real blast radius is *future*: a wrong pricing or identity decision
  gets built upon by Order and by integration.
- **Reversibility:** code is fully revertible (new module + additive
  contract). Cart data is in-memory and lost on restart, so there is no data
  to recover. The *decisions* (ADR-0015) are the hard-to-reverse part — which
  is why they are listed as open decisions below for explicit approval.
- **Detection:** automated unit, service, contract and e2e tests; a manual
  `curl` walk against `dev` and `start`. Specialised security review before
  `/final-review`.

## Existing requirements (not decided here — inherited)

| Source | Requirement |
| --- | --- |
| `CLAUDE.md`, `system-architecture.md` §5 | commerce-api is authoritative for cart and prices; AI never mutates cart state directly |
| `@contracts/common` `quantitySchema` | quantity is an integer, `1 ≤ q ≤ 99` (`MAX_QUANTITY`, mirrors web `MAX_LINE_QUANTITY`) |
| `@contracts/common` `menuItemIdSchema` | item ids are bounded lowercase kebab-case slugs |
| `@contracts/common` `priceCentsSchema`, `money.ts` | money on the wire is integer cents |
| Phase 3 (`food-ordering-frontend-mvp.md` §10) | one line per item; adding an existing item increases its quantity; Remove is the only path to deleting a line; item count = sum of quantities; subtotal only — no tax/fees/tips/discounts |
| Phase 5 D1, D13 | intents are PascalCase; intents carry no `cartId` — commerce-api resolves the cart (single-user) |
| Phase 5 D7, ADR-0011, `contracts.md` §7 | `ClearCart` is **not** a user-facing feature; it is the internal mechanism of a placed order |
| Phase 5 `setCartItemQuantitySchema` | quantity change is an absolute set, not a delta |
| Phase 6 / `commerce-api.md` §1–§7 | `/v1` URI versioning; REST nouns; strict schemas from `packages/contracts` via `@Body/@Param({ schema })`; errors are exactly a `ContractError`; never echo input; 422 reserved for domain-rule failures; 409 reserved for conflicts |
| Phase 7 (ADR-0014, OD2, OD7) | `items` not `products`; `itemId` naming; `DomainError` subclasses for domain errors; domain is HTTP-free |
| `CLAUDE.md` deferred list | no auth, no database, no real payments, no AI |

## In scope

- `@contracts/api-contracts`: cart request/response schemas, params schema,
  committed JSON Schema artifact(s), drift test.
- `apps/commerce-api/src/modules/cart/`: pure domain (types, operations,
  pricing, errors), repository port, in-memory adapter, catalog port and its
  Menu adapter, owner resolver, service, mapper, controller, module.
- One additive read method on `MenuService` (domain-typed item lookup) for the
  catalog adapter.
- New error codes in `api-error-codes.ts`.
- Tests: contracts, domain, repository, service with fakes, module, intent
  compatibility, e2e over real HTTP.
- Documentation listed in `plan.md` §28, including ADR-0015 and ADR-0004's
  status line.

## Out of scope

Order domain/API, checkout backend, payment, authentication, authorization,
customer accounts, database/ORM, Python AI, LangChain, LangGraph, OpenAI, RAG,
voice, MCP, Redis, Kafka, RabbitMQ, microservices, Docker, Kubernetes,
deployment, CORS, any `apps/web` change, an intent-execution endpoint, a
`ClearCart` intent, idempotency-key handling, tax/fees/discounts/promotions,
cart lifecycle states (checked-out/locked), cart expiry, any change to
`packages/contracts/{common,ui-commands,agent-intents}`.

## Acceptance criteria

- [x] **AC1** `GET /v1/cart` with no prior mutation → 200, body parses against
      `cartResponseSchema`, `items: []`, `itemCount: 0`, `subtotalCents: 0`.
- [x] **AC2** `POST /v1/cart/items {itemId:"tiramisu",quantity:2}` → 200, body
      is the full cart with one line: `quantity 2`, `unitPriceCents 750`,
      `lineSubtotalCents 1500`, `subtotalCents 1500`, `itemCount 2`.
- [x] **AC3** Adding the same item again with `quantity 3` yields one line with
      `quantity 5` (merge, not a second line). Line order is first-add order.
- [x] **AC4** A merge that would exceed 99 → 422 `CART_ITEM_QUANTITY_LIMIT_EXCEEDED`;
      the cart is unchanged (verified by a following GET).
- [x] **AC5** Adding a well-formed unknown `itemId` → 404 `MENU_ITEM_NOT_FOUND`;
      adding `gelato` (`available: false`) → 422 `MENU_ITEM_UNAVAILABLE`; the
      cart is unchanged in both cases.
- [x] **AC6** `PATCH /v1/cart/items/:itemId {quantity}` sets (not adds) the
      quantity; `quantity: 0`, negative, non-integer, `> 99`, or a missing
      field → 400 `INVALID_PAYLOAD` with `field: "quantity"` and the handler is
      never invoked (spy).
- [x] **AC7** `PATCH` or `DELETE` for an item that is on the menu but not in the
      cart → 404 `CART_ITEM_NOT_FOUND`.
- [x] **AC8** `DELETE /v1/cart/items/:itemId` removes the whole line and returns
      the full cart; subtotal and item count recompute.
- [x] **AC9** Malformed `itemId` in a path or body, an unknown body key, or a
      non-JSON body → the existing Phase 6 errors (400 `INVALID_PAYLOAD` /
      415), no input echoed; every response (success and error) carries
      `X-Request-Id` and `X-Correlation-Id`.
- [x] **AC10** No client-supplied value selects a cart: no cart id in any
      route, body, query or header is read. Cart ownership is resolved only
      by the server-side owner resolver (tested).
- [x] **AC11** Prices are never accepted from the caller: the request schemas
      have no price field (strict objects reject one), and every returned
      price equals the current Menu price for that item.
- [x] **AC12** Layering: the controller has no branching; `CartService`
      depends only on abstract ports (`CartRepository`, `CartCatalog`,
      `CartOwnerResolver`); the domain folder imports nothing from
      `@nestjs/*`, `express`, or `infrastructure/`; a service test passes with
      fakes for all three ports.
- [x] **AC13** A stale write is rejected by the repository (version check) and
      surfaces as 409 `CART_CONFLICT` — tested at repository and service
      level; returned carts are immutable (mutation throws).
- [x] **AC14** Contract compatibility: a test proves every `AddItemToCart` and
      `SetCartItemQuantity` intent payload maps field-for-field onto the Cart
      request schemas (and `RemoveItemFromCart` onto the params schema), and
      `@contracts/agent-intents` is unchanged.
- [x] **AC15** `@contracts/api-contracts` has the cart schemas with a passing
      drift test; no file in `common`, `ui-commands`, `agent-intents`, or
      `apps/web` changes.
- [x] **AC16** Clear-cart handling matches the approved OD5 decision (default
      recommendation: `CartService.clearCart` exists and is tested; **no**
      HTTP route and **no** intent).
- [x] **AC17** `pnpm turbo run lint`, `typecheck`, `test`, `build` pass; the
      pre-existing 375 tests are unchanged in count and outcome except the
      additive `MenuService` test(s) named in the test plan.
- [x] **AC18** `dev` and `start` both serve the cart routes (verified by `curl`).
- [x] **AC19** Every document listed in `plan.md` §28 is updated in the same
      change.

AC4, AC5, AC10, AC11 and AC12 are the ones worth failing the phase over: the
business rules, the trust boundary, price authority, and the layering the
Order domain will copy.

## Open decisions

OD1–OD14 in `plan.md` §33 were approved as recommended on 2026-09-25. The
acceptance criteria above reflect those decisions.
