# Contracts

**Status:** `packages/contracts/{common,ui-commands,agent-intents}` are
scaffolded and working (Phase 5). `packages/contracts/api-contracts` now has
its first producer, `commerce-api`'s Menu domain (Phase 7): `menu.ts`'s
`menuResponseSchema` and `menuItemResponseSchema`, consumed by
`apps/commerce-api/src/modules/menu`. This document's own scope is still the
two intent/command vocabularies below (§1–§9); `api-contracts`' schemas are
documented in [`docs/api/commerce-api.md`](./commerce-api.md) §11 instead,
next to the routes that return them.
**Related:** [`system-architecture.md`](../architecture/system-architecture.md) §6 ·
[`architecture-decisions.md`](../architecture/architecture-decisions.md)
ADR-0003, ADR-0012, ADR-0014 ·
[`docs/features/phase-5-contract-foundation/`](../features/phase-5-contract-foundation/),
[`docs/features/phase-7-menu-domain/`](../features/phase-7-menu-domain/)

This document is a working reference for the contract layer: how to name a
new field, what a valid message actually looks like on the wire, and which
business intents or UI commands were considered and declined, so the next
person who wants one of them finds a recorded answer instead of a blank
slate.

Every schema shape and validation rule shown below is exercised by a real
test (`envelope.test.ts`, `boundary.test.ts`, `intents.test.ts`,
`commands.test.ts` in each package) — this file explains behaviour the test
suite already asserts, not a separate claim about it. §4's literal examples
are copied verbatim from those tests where noted, so they are not just
representative — they are the exact input a passing test already sends
through the parser.

## 1. Two vocabularies, never one

| | Business intent | UI command |
| --- | --- | --- |
| Answers | *What should happen to commerce state?* | *What should the screen do?* |
| Package | `@contracts/agent-intents` | `@contracts/ui-commands` |
| Executed by | `commerce-api` | `apps/web`'s renderer |
| May change cart or order state | Yes — that is its purpose | **Never** |
| Batched? | No — one intent per request | Yes — up to 10 per turn |
| Idempotency | Required (`idempotencyKey`) | Not required |

**The test, restated from `system-architecture.md` §4.4:** if a UI command
could change what the user is charged, it is an intent wearing a costume —
move it. `apps/web` is restricted by ESLint from importing
`@contracts/agent-intents` at all, so this is enforced, not just written
down.

## 2. Naming conventions

- **Types are PascalCase verbs or verb phrases**: `AddItemToCart`,
  `ShowMenuCategory`. Not `ADD_ITEM_TO_CART` — that style was considered
  for this phase and declined (see D1 below) because it would have renamed
  a shipped, tested contract for no functional gain.
- **Fields are camelCase.** `itemId`, `categoryId`, `correlationId`.
- **Identifiers are opaque strings**, lowercase kebab-case
  (`menuItemIdSchema`'s pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`), matching the
  ids the menu fixture already uses (`tiramisu`, `garlic-bread`). A
  consumer validates shape, never meaning — whether an id exists is
  `commerce-api`'s answer, never a schema's.
- **Money is integer cents**, never a float, never a string.
- **Error codes are `SCREAMING_SNAKE_CASE`**, validated by pattern, not by
  `z.enum` — so `commerce-api` can introduce a domain error code later
  without a contract major bump.

## 3. Envelopes

Both packages share three fields, defined once in `@contracts/common`'s
`envelopeBaseShape`, spread into each package's own envelope:

| Field | Type | Purpose |
| --- | --- | --- |
| `contractVersion` | integer literal (currently `1`) | A consumer that doesn't understand a major version must refuse it, not guess |
| `correlationId` | string, 1–64 chars | Groups everything one conversational turn produced |
| `issuedAt` | ISO-8601 UTC string | When the producer created this message — not epoch millis (see §6) |

**UI command batch** (`@contracts/ui-commands`'s `uiCommandBatchSchema`)
adds `commands`, an array of 1–10 UI commands, each validated individually.

**Agent intent request** (`@contracts/agent-intents`'s
`agentIntentRequestSchema`) adds `idempotencyKey` (1–128 chars, opaque) and
`intent`, exactly one business intent.

## 4. Worked examples

```jsonc
// ACCEPTED — a UI command batch, one turn producing two commands.
// Verbatim from ui-commands/src/envelope.test.ts, "accepts every command
// in a fully valid batch".
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "issuedAt": "2026-09-19T10:04:11.000Z",
  "commands": [
    { "type": "ShowMenuCategory", "categoryId": "desserts" },
    { "type": "HighlightItem", "itemId": "tiramisu" }
  ]
}
```

```jsonc
// PARTIALLY ACCEPTED — command 1 renders, command 2 is dropped and logged.
// parseBatch validates the envelope as a whole, then each command on its
// own, so the malformed second command does not discard the valid first.
// Verbatim from ui-commands/src/envelope.test.ts, "drops a business intent
// masquerading as a UI command inside a batch".
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "issuedAt": "2026-09-19T10:04:11.000Z",
  "commands": [
    { "type": "HighlightItem", "itemId": "tiramisu" },
    { "type": "AddToCart", "itemId": "tiramisu", "quantity": 1 }
  ]
  //          ^ a business intent wearing a UI costume — exactly the §4.4
  //            failure this boundary exists to catch, now inside a batch.
}
```

```jsonc
// REJECTED — an unknown key, under strict objects (every schema rejects
// one, it is never silently stripped). Verbatim from
// ui-commands/src/commands.test.ts, "rejects a ShowMenuCategory carrying
// an extra field".
{
  "type": "ShowMenuCategory",
  "categoryId": "desserts",
  "onSelect": "javascript:alert(1)"
}
```

```jsonc
// ACCEPTED — a business intent request. Verbatim from
// agent-intents/src/envelope.test.ts, "accepts a well-formed request".
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "idempotencyKey": "01HQ8ZK9",
  "issuedAt": "2026-09-19T10:04:09.000Z",
  "intent": { "type": "AddItemToCart", "itemId": "tiramisu", "quantity": 1 }
}
```

```jsonc
// REJECTED by parseIntent — a UI command is not a valid business intent.
// The boundary in the other direction: system-architecture.md §4.4 in
// reverse. Composed from two separately-tested facts, not one literal
// fixture: the envelope shape above (envelope.test.ts) and the rejection
// itself, asserted directly against the bare intent by
// agent-intents/src/boundary.test.ts, "ShowMenuCategory is not a valid
// business intent".
{
  "contractVersion": 1,
  "correlationId": "turn_7f3a",
  "idempotencyKey": "01HQ8ZK9",
  "issuedAt": "2026-09-19T10:04:09.000Z",
  "intent": { "type": "ShowMenuCategory", "categoryId": "desserts" }
}
```

```jsonc
// A contract-layer error (@contracts/common's contractErrorSchema).
// Defined for a future service-level rejection (a commerce-api response
// body, or api-contracts once it has a producer) — not yet constructed by
// any parser in this repository. parseCommand, parseBatch, parseIntent, and
// parseIntentRequest all keep their own pre-existing {accepted, reason,
// received} shape (D8), which is correct for them; this schema is designed
// ahead of the service that will need it, not retrofitted onto them.
// QUANTITY_OUT_OF_RANGE is not one of the four contract-layer codes this
// package defines — it illustrates a domain code commerce-api could
// introduce on its own, which contractErrorCodeSchema's pattern (not a
// z.enum) accepts without a contract change. Confirmed to parse against
// the real schema, not just written to look plausible.
{
  "code": "QUANTITY_OUT_OF_RANGE",
  "message": "Quantity must be between 1 and 99.",
  "field": "quantity"
}
```

## 5. Adopted business intents

Each mirrors a cart mutation `apps/web`'s `cartReducer` already implements —
none is invented (`packages/contracts/agent-intents/src/intents.ts`):

| Intent | Payload | Mirrors |
| --- | --- | --- |
| `AddItemToCart` | `itemId`, `quantity` (1–99) | `cartReducer`'s `ADD_ITEM` |
| `RemoveItemFromCart` | `itemId` | `cartReducer`'s `REMOVE_ITEM` |
| `SetCartItemQuantity` | `itemId`, `quantity` (1–99) | An absolute set, not a delta — a retried delta double-counts on a network retry; a retried set does not |

## 6. Adopted UI commands

Unchanged in shape since Phase 2, now strict and (for `SearchMenu`) bounded:
`ShowMenuCategory`, `HighlightItem`, `OpenCartPanel`, `ShowItemDetail`,
`SearchMenu` (`packages/contracts/ui-commands/src/commands.ts`).

## 7. Candidate register — considered, not adopted

Recorded so each is re-proposed deliberately later, rather than
rediscovered from scratch or silently smuggled in as "obviously fine."

| Candidate | Kind | Why not now | Revisit when |
| --- | --- | --- | --- |
| `PlaceOrder` / `CreateOrder` | Business intent | Needs customer fields Phase 4 admittedly invented with no product basis, and an idempotency design `system-architecture.md` §8 still calls undesigned | `commerce-api` is planned and idempotency semantics are designed |
| `ClearCart` | Business intent | ADR-0011 makes `CLEAR_CART` the internal mechanism of a placed order only, explicitly not a user-facing feature | A real "empty my cart" feature is proposed as its own product decision |
| `OpenCheckout` | UI command | Reverses `food-ordering-frontend-mvp.md` §11's decision that `/checkout` is reachable only from a non-empty `/cart` | That routing decision is revisited on its own terms |
| `ShowOrderConfirmation` | UI command | **Rejected outright, not deferred.** The confirmation is reachable only by having placed an order; a command that renders it lets an agent show a user an order that never happened | Not expected to be revisited — this is a standing rule, not a gap |
| `ApplyPromotion` | Business intent | Named only as an example in `system-architecture.md` §4.4; no promotion concept exists anywhere in the product | A promotions feature is actually proposed |

## 8. Open architectural questions (D1–D13)

Posed and decided during Phase 5 planning, with the reasoning that decided
each. Full detail in
[`requirements.md`](../features/phase-5-contract-foundation/requirements.md).

| # | Question | Decision |
| --- | --- | --- |
| D1 | `SHOW_CATEGORY`-style naming or PascalCase? | PascalCase — matches the shipped, tested contract |
| D2 | Adopt `PlaceOrder` now? | No — candidate (§7) |
| D3 | A fourth `common` package? | Yes — ADR-0012 |
| D4 | Batch UI commands, single intents? | Yes — matches idempotency and turn semantics |
| D5 | Semver or integer major? | Integer major — lockstep monorepo |
| D6 | `OpenCheckout` UI command? | No — candidate (§7) |
| D7 | `ClearCart` intent? | No — candidate (§7) |
| D8 | Strict objects on the shipped `ui-commands`? | Yes — closes a real TS/Python divergence |
| D9 | ISO-8601 or epoch millis? | ISO-8601 on the wire |
| D10 | Commit generated schema, or generate on demand? | Commit, guarded by a freshness test |
| D11 | Forbid `apps/web` from importing `agent-intents`? | Yes — ESLint `no-restricted-imports` |
| D12 | Write `api-contracts` now? | No — no producer exists yet (superseded by Phase 7 / ADR-0014, once `commerce-api`'s Menu domain became a real producer) |
| D13 | Include `cartId` in intents? | Omit — single-user assumption; revisit with authorization |

## 9. Contract tests as documentation

Every example in §4 is asserted by a real test (`envelope.test.ts`,
`boundary.test.ts`, `intents.test.ts`, `commands.test.ts` — one file per
concern, in each package). Reading the tests is reading the contract's
actual behaviour; this document explains *why*, the tests prove *that*.
