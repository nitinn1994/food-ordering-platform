# Commerce API

**Status:** Foundation (Phase 6) plus a read-only Menu domain (Phase 7).
`GET /health`, `GET /v1/menu`, and `GET /v1/menu/items/:itemId` all exist.
Cart and Order routes do not.
**Related:** [`system-architecture.md`](../architecture/system-architecture.md)
§1, §5 · [`architecture-decisions.md`](../architecture/architecture-decisions.md)
ADR-0013, ADR-0014 ·
[`docs/features/phase-6-commerce-api-foundation/`](../features/phase-6-commerce-api-foundation/),
[`docs/features/phase-7-menu-domain/`](../features/phase-7-menu-domain/)
· [`docs/api/contracts.md`](./contracts.md)

This document is a working reference for `apps/commerce-api`'s HTTP surface:
what a request and response actually look like on the wire, what every error
code means, and which conventions a future Cart or Order route must follow
rather than invent — Menu (§11) is the first domain to actually follow them.
Every behaviour described below is exercised by a real test
(`src/common/**/*.test.ts`, `src/modules/**/*.test.ts`, `test/*.e2e.test.ts`)
— this file explains why the tests assert what they do, not a separate claim
about it.

## 1. Style

REST, JSON only. Resource nouns, not verbs (`/v1/cart/items`, not
`/v1/addToCart`) — a convention recorded ahead of the first business route,
not yet exercised by one.

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
| 404 | `MENU_ITEM_NOT_FOUND` | A well-formed `itemId` names no item (Phase 7) — distinct from `ROUTE_NOT_FOUND`, which means no route matched at all. |
| 500 | `INTERNAL_ERROR` | Anything unexpected. The response never contains a stack trace, the original exception's message, or the request payload — the full detail is logged server-side instead, tagged with the request's id. |
| 422 | *reserved* | A future domain-rule failure (e.g. an out-of-range quantity a schema bound alone can't express). Not used by anything yet. |
| 409 | *reserved* | A future idempotency conflict. `system-architecture.md` §8 still calls idempotency undesigned. |
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

The first, and so far only, domain route. Read-only: no write, update, or
delete of any kind.

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
  display flag (`apps/web` already renders it as "Unavailable"); nothing in
  this phase enforces it — that belongs to whichever phase adds a Cart.
- **No `GET /v1/menu/categories` and no query filtering.** Categories arrive
  nested inside `/v1/menu`; nothing in the product yet needs a
  server-side filter over six items. See ADR-0014, `docs/features/phase-7-menu-domain/requirements.md`.
- **Response shapes** are defined in `@contracts/api-contracts`
  (`menuResponseSchema`, `menuItemResponseSchema`), not locally to this
  service — see `docs/api/contracts.md`.

## 12. What this document does not cover

- **Any Cart or Order route** — neither exists yet. §11 covers the one
  domain that does.
- **Authentication or authorization** — deferred per `CLAUDE.md`;
  `system-architecture.md` §8 gap 4 remains open.
- **Idempotency semantics** — `idempotencyKey` is carried by the contract
  layer (`docs/api/contracts.md` §3); how commerce-api uses it on retry is
  still `system-architecture.md` §8 gap 3.
- **Rate limiting, CORS** — not configured; `apps/web` does not call this
  service yet.
