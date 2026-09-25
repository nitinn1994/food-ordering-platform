# Commerce API

**Status:** Foundation (Phase 6), a read-only Menu domain (Phase 7), a
Cart domain (Phase 8), and an Order domain (Phase 9). `GET /health`,
`GET /v1/menu`, `GET /v1/menu/items/:itemId`, the four `/v1/cart` routes
(§12), and `POST /v1/orders` / `GET /v1/orders/:orderId` (§13) exist. No
consumer calls any of them yet.
**Related:** [`system-architecture.md`](../architecture/system-architecture.md)
§1, §5 · [`architecture-decisions.md`](../architecture/architecture-decisions.md)
ADR-0013, ADR-0014, ADR-0015, ADR-0016 ·
[`docs/features/phase-6-commerce-api-foundation/`](../features/phase-6-commerce-api-foundation/),
[`docs/features/phase-7-menu-domain/`](../features/phase-7-menu-domain/),
[`docs/features/phase-8-cart-domain/`](../features/phase-8-cart-domain/),
[`docs/features/phase-9-order-domain/`](../features/phase-9-order-domain/)
· [`docs/api/contracts.md`](./contracts.md)

This document is a working reference for `apps/commerce-api`'s HTTP surface:
what a request and response actually look like on the wire, what every error
code means, and which conventions a future Cart or Order route must follow
rather than invent — Menu (§11), Cart (§12) and Order (§13) are the domains that follow them so far.
Every behaviour described below is exercised by a real test
(`src/common/**/*.test.ts`, `src/modules/**/*.test.ts`, `test/*.e2e.test.ts`)
— this file explains why the tests assert what they do, not a separate claim
about it.

## 1. Style

REST, JSON only. Resource nouns, not verbs (`/v1/cart/items`, not
`/v1/addToCart`) — recorded ahead of the first business route, and now
exercised by Cart (§12).

## 2. Versioning

Business routes are served under `/v1` (Nest's URI versioning,
`defaultVersion: "1"`, set once in `configure-app.ts`). `GET /health` is the
one exception: it opts out via `@Controller({ version: VERSION_NEUTRAL })`,
because a liveness check has no contract to version. A future route opts out
the same way if it ever needs to.

The URL version (`/v1`) and `@contracts/*`'s `contractVersion` field
(`packages/contracts/common`) are independent numbers answering different
questions — the URL version is this HTTP surface's shape, `contractVersion`
is the wire schema's major version — and are not expected to move in lockstep.

## 3. Request body

`application/json` only. A request carrying a body with any other
`Content-Type` (or none) is rejected with `415` before any parsing is
attempted. A body larger than 16 KB is rejected with `413`. Both limits are
enforced by `configure-app.ts`; see §6 for their response shape.

## 4. Request validation

Every request body validated against a schema uses `@Body({ schema })`
with the schema drawn straight from `packages/contracts` — never a
hand-written `class-validator` DTO (ADR-0003, ADR-0013). Validation is
registered once, globally, via Nest 12's built-in
`StandardSchemaValidationPipe`, and runs **before** any handler: a rejected
request never reaches domain code.

- **Strict objects only.** An unknown key is rejected, not silently
  stripped — the same rule `packages/contracts` already enforces
  (ADR-0012).
- **The rejected payload is never echoed back.** Only the failing field's
  path and the schema's own message appear in the response.
- **`contractVersion` gets its own code.** If the envelope's
  `contractVersion` itself is what fails validation, the response is
  `UNSUPPORTED_CONTRACT_VERSION`, not the generic `INVALID_PAYLOAD` — a
  caller can tell "you're speaking a version I don't support" apart from
  "this payload doesn't parse."

## 5. Response body

A successful response is the resource itself — no envelope, no wrapper.

An error response is always exactly a `@contracts/common` `ContractError`:

```jsonc
{
  "code": "INVALID_PAYLOAD",
  "message": "intent.itemId: Required",
  "field": "intent.itemId"
}
```

`code` is the only field a caller may branch on — this holds for `apps/web`,
`ai-service`, and any future tool-calling consumer, the same rule
`docs/api/contracts.md` §1 states for the contract layer generally.
`message` is for humans; `field` is present only for a validation failure
and is truncated to 64 characters; `details` is reserved by the contract
schema but nothing in this service populates it yet.

## 6. Status codes and error codes

| Status | Code | When |
| --- | --- | --- |
| 200 / 201 | — | Success. The response body is the resource, not a `ContractError`. |
| 400 | `INVALID_PAYLOAD` | The request body failed schema validation (shape, unknown key, bounds). |
| 400 | `UNSUPPORTED_CONTRACT_VERSION` | The envelope's `contractVersion` is one this consumer does not implement. |
| 404 | `ROUTE_NOT_FOUND` | No route matches — Nest's own automatic 404, mapped to this shape. |
| 413 | `PAYLOAD_TOO_LARGE` | The request body exceeds 16 KB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The request has a body but its `Content-Type` is not `application/json`. |
| 404 | `MENU_ITEM_NOT_FOUND` | A well-formed `itemId` names no item (Phase 7) — distinct from `ROUTE_NOT_FOUND`, which means no route matched at all. Also returned when a cart add or set-quantity names an item that is not on the menu (Phase 8). |
| 404 | `CART_ITEM_NOT_FOUND` | A cart set-quantity or remove names an item that has no line in the cart (Phase 8). Never an upsert, never a silent no-op. |
| 422 | `MENU_ITEM_UNAVAILABLE` | A cart add or set-quantity names an item whose `available` is `false` (Phase 8). Also returned by `POST /v1/orders` when a cart line is unavailable or no longer on the menu (Phase 9). |
| 422 | `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` | Adding to an existing line would take it above 99 (Phase 8). Rejected, not clamped; the cart is unchanged. |
| 409 | `CART_CONFLICT` | Another write changed the cart between this request's read and its save (optimistic version check, Phase 8). Re-read and retry. Also returned by `POST /v1/orders` when the cart changed between being priced and being consumed (Phase 9) — nothing was ordered. |
| 404 | `ORDER_NOT_FOUND` | A well-formed `orderId` names no order of the caller's (Phase 9). Another owner's order is indistinguishable from a missing one. |
| 422 | `CART_EMPTY` | `POST /v1/orders` with an empty cart (Phase 9). |
| 409 | `IDEMPOTENCY_KEY_REUSED` | `POST /v1/orders` with an `idempotencyKey` this owner already used for an order with different customer details (Phase 9). Nothing changes. |
| 500 | `INTERNAL_ERROR` | Anything unexpected. The response never contains a stack trace, the original exception's message, or the request payload — the full detail is logged server-side instead, tagged with the request's id. |
| 422 | *(in use)* | A domain-rule failure — a request that is well-formed but that the business refuses. First used by Cart (Phase 8): `MENU_ITEM_UNAVAILABLE`, `CART_ITEM_QUANTITY_LIMIT_EXCEEDED`; Order (Phase 9) adds `CART_EMPTY`. |
| 409 | *(in use)* | A conflict. Cart (Phase 8) uses it for a concurrency conflict (`CART_CONFLICT`); Order (Phase 9) uses it for the first idempotency conflict (`IDEMPOTENCY_KEY_REUSED`), the case it was originally reserved for. |
| 503 | *reserved* | A future readiness check, once there is a dependency (e.g. a database) to report on. |

`INVALID_PAYLOAD` and `UNSUPPORTED_CONTRACT_VERSION` are
`@contracts/common`'s own codes (`CONTRACT_ERROR_CODES`), reused here rather
than redefined — `packages/contracts/common/src/errors.ts` says explicitly
that a domain error code "arrives with the service that owns them," and
this is that service. Every other code in the table is commerce-api's own
(`src/common/errors/api-error-codes.ts`). `contractErrorCodeSchema` matches
by pattern, not by a closed `z.enum`, precisely so a service can introduce a
code like this without a contract change.

## 7. Headers

| Header | Direction | Rule |
| --- | --- | --- |
| `X-Request-Id` | Response, always | Always server-generated. An inbound value is never trusted or echoed. |
| `X-Correlation-Id` | Request + response | A valid inbound value (`@contracts/common`'s `correlationIdSchema`) is echoed back; a missing or invalid one is replaced with a generated id, never rejected outright. |

Both headers are present on **every** response, including every error
status in §6 — this was not true by construction once already (a real 413
response was missing both, found by a live check, fixed, and is now
asserted directly in `test/validation.e2e.test.ts` and
`test/app.e2e.test.ts`; see ADR-0013).

## 8. Logging

One structured JSON line per log entry (Nest's `ConsoleLogger`, `json:
true`), and one additional line per request once it finishes, carrying
method, path, status, and duration. Every line produced while a request is
in flight carries that request's `requestId` and `correlationId`
automatically — a call site never passes them explicitly. A request's body,
headers, and query string are never logged, by any code path.

## 9. Health

```jsonc
// GET /health — always this shape, unversioned, no dependency check.
{ "status": "ok" }
```

Liveness only. There is nothing to be ready for yet — no database, no
downstream call — so there is no separate readiness endpoint.

## 10. Worked examples

```jsonc
// A well-formed request to a future business route, validated against a
// real @contracts/agent-intents schema. Verbatim from
// test/validation.e2e.test.ts's fixture — the exact input a passing test
// sends through the pipe, at /v1/... (a business route is versioned).
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "idempotencyKey": "01HQ8ZK9",
  "issuedAt": "2026-09-19T10:04:09.000Z",
  "intent": { "type": "AddItemToCart", "itemId": "tiramisu", "quantity": 1 }
}
```

```jsonc
// REJECTED — the same request, but `intent` is missing itemId/quantity.
// Rejected before the handler runs; asserted directly by a spy in
// test/validation.e2e.test.ts.
// → 400 { "code": "INVALID_PAYLOAD", "message": "intent.itemId: Required; …", "field": "intent.itemId" }
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "idempotencyKey": "01HQ8ZK9",
  "issuedAt": "2026-09-19T10:04:09.000Z",
  "intent": { "type": "AddItemToCart" }
}
```

```jsonc
// REJECTED — contractVersion the consumer doesn't implement.
// → 400 { "code": "UNSUPPORTED_CONTRACT_VERSION", "message": "contractVersion: …", "field": "contractVersion" }
{
  "contractVersion": 2,
  "correlationId": "turn_7f3a",
  "idempotencyKey": "01HQ8ZK9",
  "issuedAt": "2026-09-19T10:04:09.000Z",
  "intent": { "type": "AddItemToCart", "itemId": "tiramisu", "quantity": 1 }
}
```

## 11. Menu (Phase 7)

The first domain route. Read-only: no write, update, or delete of any kind.

```jsonc
// GET /v1/menu → 200, always this shape.
{
  "categories": [
    {
      "id": "desserts",
      "name": "Desserts",
      "items": [
        {
          "id": "tiramisu",
          "categoryId": "desserts",
          "name": "Tiramisu",
          "description": "Espresso-soaked ladyfingers, mascarpone.",
          "longDescription": "Espresso-soaked ladyfingers layered with mascarpone cream, dusted with cocoa. Made in-house, rested overnight.",
          "priceCents": 750,
          "available": true,
          "dietaryTags": ["vegetarian"],
          "allergens": ["gluten", "dairy", "egg"],
          "calories": 450
        }
      ]
    }
  ]
}
```

```jsonc
// GET /v1/menu/items/:itemId → 200, the item alone (same shape as above).
// A well-formed but unknown itemId → 404 { "code": "MENU_ITEM_NOT_FOUND", "message": "Menu item not found." }
// A malformed itemId (e.g. "Bad_ID") → 400 { "code": "INVALID_PAYLOAD", "field": "itemId", "message": "..." }
```

- **Unavailable items are returned, not hidden.** `available: false` is a
  display flag here (`apps/web` already renders it as "Unavailable"). It is
  enforced by Cart (§12, Phase 8): an unavailable item cannot be added or
  re-quantified.
- **No `GET /v1/menu/categories` and no query filtering.** Categories arrive
  nested inside `/v1/menu`; nothing in the product yet needs a
  server-side filter over six items. See ADR-0014, `docs/features/phase-7-menu-domain/requirements.md`.
- **Response shapes** are defined in `@contracts/api-contracts`
  (`menuResponseSchema`, `menuItemResponseSchema`), not locally to this
  service — see `docs/api/contracts.md`.

## 12. Cart (Phase 8)

The first domain with writes. There is one cart, the caller's own, resolved
server-side: no route, body, query, or header ever names a cart or an
owner, and one fixed owner exists while the system is single-user
(ADR-0015). Every route returns the **whole cart with 200**, including
`POST`. An add may merge into an existing line rather than create
anything, so it is not a 201.

| Method | Route | Body | Executes intent |
| --- | --- | --- | --- |
| `GET` | `/v1/cart` | — | — |
| `POST` | `/v1/cart/items` | `{ "itemId", "quantity" }` | `AddItemToCart` |
| `PATCH` | `/v1/cart/items/:itemId` | `{ "quantity" }` | `SetCartItemQuantity` |
| `DELETE` | `/v1/cart/items/:itemId` | — | `RemoveItemFromCart` |

```jsonc
// Any /v1/cart route → 200, always this shape. A cart always logically
// exists: an owner who has added nothing gets { "items": [], "itemCount": 0, "subtotalCents": 0 }.
{
  "items": [
    {
      "itemId": "tiramisu",
      "name": "Tiramisu",
      "unitPriceCents": 750,
      "quantity": 2,
      "lineSubtotalCents": 1500,
      "available": true
    }
  ],
  "itemCount": 2,
  "subtotalCents": 1500
}
```

- **Merging.** Adding an item already in the cart adds to its existing line,
  in place (first-add order is kept). A merge above 99 is rejected with 422
  `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` and the cart is unchanged.
- **`PATCH` sets, it does not add.** `quantity` must be an integer from 1 to
  99. `0` is a 400 `INVALID_PAYLOAD`, not a removal: `DELETE` is the only
  way to remove a line.
- **Validation against the menu.** Add and set-quantity require the item to
  exist (else 404 `MENU_ITEM_NOT_FOUND`) and be available (else 422
  `MENU_ITEM_UNAVAILABLE`). Remove requires neither. It only requires the
  line to exist (else 404 `CART_ITEM_NOT_FOUND`).
- **Prices are live and never accepted from the caller.** `name`,
  `unitPriceCents` and `available` are the menu's current values, recomputed
  on every response. A request carrying a price (or any unknown key) is a
  400. `lineSubtotalCents = unitPriceCents × quantity`,
  `subtotalCents = Σ lineSubtotalCents`, `itemCount = Σ quantity`. There is
  no tax, fee, or discount. What a customer is charged is fixed by the
  future Order domain at placement, not by the cart.
- **No `DELETE /v1/cart`.** Clearing a cart is the internal mechanism of a
  placed order, not a user-facing feature (ADR-0011, Phase 5 D7).
  The route returns 404 `ROUTE_NOT_FOUND`. A placed order (§13) is what
  empties the cart.
- **Retries.** A retried `PATCH` is harmless (it is an absolute set). A retried
  `DELETE` returns 404 `CART_ITEM_NOT_FOUND`, which a caller may treat as
  "already removed". A retried `POST` **double-counts**: there is no
  idempotency key yet (`system-architecture.md` §8 gap 3).
- **Concurrency.** A write based on a stale read is rejected with 409
  `CART_CONFLICT`; nothing retries internally. The version is not exposed
  (no `ETag` / `If-Match`).
- **In-memory.** Cart state lives in the process and is lost on restart
  (ADR-0015; ADR-0004 is now `Accepted` for Cart).
- **Shapes** are defined in `@contracts/api-contracts` (`cart.ts`:
  `addCartItemRequestSchema`, `updateCartItemRequestSchema`,
  `cartItemParamsSchema`, `cartResponseSchema`), with committed JSON Schema
  for the response and both request bodies.
- **Phase 9 note:** the Order domain consumes the cart through two
  additive `CartService` methods (`prepareCheckout`, `completeCheckout`), not
  through `clearCart` and not through any HTTP route — see §13.

## 13. Orders (Phase 9)

Placing an order turns the caller's server-side cart into an immutable
snapshot and empties the cart. There is no payment: a new order's status is
`placed`, meaning commerce-api accepted it and nothing was charged
(ADR-0016).

| Method | Route | Body | Success |
| --- | --- | --- | --- |
| `POST` | `/v1/orders` | `{ "idempotencyKey", "customer": { "fullName", "phone", "email"? } }` | 201 `OrderResponse` |
| `GET` | `/v1/orders/:orderId` | — | 200 `OrderResponse` |

```jsonc
// POST /v1/orders → 201 (a replay returns this same body, also 201);
// GET /v1/orders/:orderId → 200, the same shape.
{
  "orderId": "9d3a5a7b-3458-41c1-8585-871e24db8cfd",
  "status": "placed",
  "placedAt": "2026-09-25T14:06:15.712Z",
  "customer": { "fullName": "Ada Lovelace", "phone": "5551234" },
  "items": [
    {
      "itemId": "tiramisu",
      "name": "Tiramisu",
      "unitPriceCents": 750,
      "quantity": 2,
      "lineSubtotalCents": 1500
    }
  ],
  "itemCount": 2,
  "subtotalCents": 1500,
  "totalCents": 1500
}
```

- **The request carries only a key and customer details.** Items, prices,
  totals, status, and any cart, owner or order id are the server's; any of
  them in the body is a 400 (strict schema). The order is built from the
  caller's cart, resolved server-side exactly as for §12.
- **Customer details** (Phase 4 D4's rules): `fullName` 1–100 characters
  with no leading or trailing whitespace; `phone` up to 32 characters, an
  optional leading `+`, then 7–20 digits separated by spaces, `-`, `(` or
  `)`; `email` optional — omit it rather than sending `""`. The caller
  trims; the server rejects rather than normalizes. These are personal
  data: never logged, never echoed in an error — a 400 names the field
  (e.g. `customer.phone`), never the value.
- **Snapshot.** Each line's `name`, `unitPriceCents` and `quantity` are the
  values the cart showed at placement, and never change afterwards,
  whatever later happens to the menu. `totalCents` equals `subtotalCents`
  (no tax, fee, tip or discount) but is its own field, because it is what
  a future payment charges.
- **Refusals** (nothing is ordered and the cart is unchanged): an empty cart
  → 422 `CART_EMPTY`; a line whose item is unavailable or no longer on the
  menu → 422 `MENU_ITEM_UNAVAILABLE`; a cart changed between being priced
  and being consumed → 409 `CART_CONFLICT`.
- **Idempotency.** `idempotencyKey` (1–128 characters) is required and
  scoped per owner. Sending the same key with the same customer details
  returns the original order — same 201 and body — and does not touch the
  cart, even if it has been refilled since. The same key with different
  details → 409 `IDEMPOTENCY_KEY_REUSED`. A new key is a new request: once
  an order has emptied the cart, it gets 422 `CART_EMPTY`. A retry made
  while the first attempt is still in flight may see 409 `CART_CONFLICT`
  or 422 `CART_EMPTY`; retrying again replays the order. Two concurrent
  placements can never both succeed.
- **Reads.** `orderId` must be a lowercase UUID (else 400, field
  `orderId`). An unknown id, or another owner's order, is 404
  `ORDER_NOT_FOUND`. There is no `GET /v1/orders` list — order history is
  out of scope (404 `ROUTE_NOT_FOUND`).
- **In-memory.** Orders live in the process and are lost on restart
  (ADR-0016; ADR-0004 is now `Accepted` for Order).
- **Shapes** are defined in `@contracts/api-contracts` (`order.ts`:
  `createOrderRequestSchema`, `orderParamsSchema`, `orderResponseSchema`,
  `customerDetailsSchema`, `orderIdSchema`, `orderStatusSchema`), with
  committed JSON Schema for the response and the create request.

## 14. What this document does not cover

- **Order status changes, cancellation, payment, delivery or order
  history** — none exist (ADR-0016).
- **Authentication or authorization** — deferred per `CLAUDE.md`;
  `system-architecture.md` §8 gap 4 remains open.
- **Idempotency beyond order creation** — `POST /v1/orders` is the only
  route that uses an idempotency key (§13). Everywhere else, including
  `POST /v1/cart/items`, is still `system-architecture.md` §8 gap 3.
- **Rate limiting, CORS** — not configured; `apps/web` does not call this
  service yet.
