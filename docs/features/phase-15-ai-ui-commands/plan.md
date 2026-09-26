# Plan — Phase 15: AI → UI Commands & Business Intent Integration

**Approval Status:** APPROVED (2026-09-26, OD1–OD12 as recommended)
**Risk:** HIGH · **Path:** Full · Requirements: `requirements.md`

## Approach

Connect two pieces that already exist: the Phase 1/5 UI-command pipeline in
`apps/web`, and the Phase 13/14 agent in `apps/ai-service`. The plan invents
as little as possible.

- **UI commands.** The agent emits them through a second allowlisted tool
  registry, the *presentation tools*. Each one is validated against Pydantic
  generated from the existing Zod union. `finalize_reply` collects them, and
  they travel in the existing `UiCommandBatch` envelope in the synchronous
  HTTP response.
- **Business intents.** These are the existing `agent-intents` union. The
  three Phase 14 write tools already execute them, so this phase makes the
  link structural: a fixed map, and runtime validation against the generated
  intent models.
- **The web side** reuses the proxy pattern (ADR-0018), the API client, the
  two-stage `parseBatch`, and `commandToUiAction`. It re-reads the cart after
  every turn (ADR-0005).

---

## 1. Existing contract architecture

`packages/contracts/*`: Zod is the source. JSON Schema is committed under
`schema/*.v1.json` and guarded by freshness tests. Python generates Pydantic
from that JSON (ADR-0003, ADR-0012).

| Family | Producer → consumer | Status |
| --- | --- | --- |
| `common` | primitives: `contractVersion` (literal 1), slug ids, correlation id, idempotency key, ISO `Z` timestamp, `ContractError` | used everywhere |
| `ui-commands` | ai-service → web | 5 strict commands, a batch envelope capped at 10, `parseCommand`/`parseBatch` (never throw) |
| `agent-intents` | ai-service → commerce-api | 3 strict intents, a one-intent request envelope with `idempotencyKey`, no runtime consumer yet |
| `api-contracts` | commerce-api ↔ web/ai-service | menu, cart, order; ai-service generates 4 models (Phase 14) |

Structural guards already in place:

- `apps/web` cannot import `agent-intents` (ESLint).
- `commerce-api` cannot import `ui-commands` (ESLint).
- `dispatch.ts` has no `cartStore` import.
- `eval`, `new Function` and implied eval are lint errors.

## 2. Existing business intent contracts

They exist, so they are **reused and not changed**.

| Intent | Payload | Executed today by |
| --- | --- | --- |
| `AddItemToCart` | `itemId` (slug ≤64), `quantity` (int 1–99) | `add_cart_item` → `POST /v1/cart/items` (a delta) |
| `SetCartItemQuantity` | `itemId`, `quantity` (an absolute set) | `set_cart_item_quantity` → `PATCH /v1/cart/items/{itemId}` |
| `RemoveItemFromCart` | `itemId` | `remove_cart_item` → `DELETE /v1/cart/items/{itemId}` |

Declined candidates stay declined (`docs/api/contracts.md` §7): `ClearCart`
and `PlaceOrder`. The brief's `START_CHECKOUT` is navigation, not a
commerce operation. Only the brief's naming differs from the contract
(`UPDATE_CART_ITEM_QUANTITY` is `SetCartItemQuantity`, `productId` is
`itemId`). The contract's names win, and nothing is renamed.

## 3. Existing frontend state/query architecture

- `uiStore` (a reducer) holds UI-only state: `selectedCategory`,
  `highlightedItemId`, `cartPanelOpen`, `searchQuery`, `detailItemId`, and
  `commandLog` (the last 20).
- `cartStore` is a *holder* of the last `CartResponse` from commerce-api. It
  has no optimistic updates. Requests are sequenced so a stale response cannot
  win. It exposes `refresh()`, which never throws.
- `lib/api/client.ts` is the only HTTP code. It validates responses against
  the contract, never retries mutations, and raises `ApiError` with
  kind/code only.
- Commerce access goes browser → `/api/commerce/v1/*` → Next rewrite →
  commerce-api. `middleware.ts` rejects dot segments.
- `ChatInput` → `simulateCommand` (hardcoded) → `dispatchCommand` →
  `uiStore`. The reply text comes from a fixed `OUTCOME_MESSAGES` table.
- Unknown ids already fail safe. An unknown `HighlightItem` or
  `ShowItemDetail` id is a no-op (`findMenuItemIn` returns null). An unknown
  category filters the list to empty, and the "All" button recovers.

## 4. UI command model

Reuse the existing model, which is flat and strict:
`{ "type": "<Name>", ...fields }`. Metadata (`contractVersion`,
`correlationId`, `issuedAt`) lives once on the batch envelope, not on each
command. This departs from the brief's `{type, payload, metadata}` sketch,
deliberately. Reshaping would be a breaking change to a contract that four
phases depend on (OD1).

## 5. Business intent model

Reuse as well: a flat, strict `{ "type": "<Name>", ...fields }`. The
request envelope (`idempotencyKey`) stays unused. No endpoint accepts
envelopes, and the REST routes are the executors (Phase 14 plan §3). Inside
ai-service, an intent is the **typed, validated form of a write-tool call**
(§12).

The two vocabularies stay separate in four ways:

- They are separate Zod unions.
- They generate separate Python modules.
- They are served by separate ai-service registries.
- They cross separate transport boundaries. Intents never leave ai-service
  toward web: ESLint forbids web from importing them, and the response has no
  intent field.

## 6. UI command allowlist

These are the five existing commands, and each already maps to a working
`uiStore` action. None is added (OD2).

| Brief's name | Contract command | Presentation tool | Web action |
| --- | --- | --- | --- |
| SHOW_CATEGORY | `ShowMenuCategory` | `show_menu_category` | `SELECT_CATEGORY` |
| SHOW_PRODUCT | `ShowItemDetail` | `show_item_detail` | `SHOW_ITEM_DETAIL` |
| HIGHLIGHT_ITEM | `HighlightItem` | `highlight_item` | `HIGHLIGHT_ITEM` |
| SHOW_CART | `OpenCartPanel` | `open_cart_panel` | `SET_CART_PANEL_OPEN` |
| — (exists already) | `SearchMenu` | `search_menu` | `SET_SEARCH_QUERY` |
| OPEN_CHECKOUT | *not adopted*: a candidate, which would reverse a routing decision | — | — |
| SHOW_ORDER_CONFIRMATION | *rejected outright*: it would show an order that never happened | — | — |

None of the five can assert that a commerce operation succeeded (this matters
for §17).

## 7. Payload schemas

These are the existing fields, which the agent must not extend:

| Command | Fields (besides `type`) |
| --- | --- |
| `ShowMenuCategory` | `categoryId`: slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–64 |
| `HighlightItem` | `itemId`: slug, 1–64 |
| `OpenCartPanel` | `open`: boolean |
| `ShowItemDetail` | `itemId`: slug, 1–64 |
| `SearchMenu` | `query`: string, 0–200 (empty clears the search) |

The new agent-turn contract lives in `ui-commands/src/agentTurn.ts`:

```ts
agentTurnRequestSchema  = z.strictObject({
  message: z.string().min(1).max(2000).regex(/\S/),   // unchanged wire rules
});
agentTurnResponseSchema = z.strictObject({
  reply: z.string().min(1).max(4000),                  // AgentResult's existing bound
  uiCommands: uiCommandBatchSchema.optional(),         // omitted when none (OD12)
});
```

## 8. Validation strategy

The command is validated in depth. No layer trusts the one before it.

```text
model tool call ──► presentation registry lookup (name allowlist; else UNKNOWN_TOOL)
                ──► generated Pydantic command model (strict, extra=forbid)   [Python]
                ──► per-turn call limit (8)                                   [Python]
                ──► response model validation (batch ≤10, envelope)           [Python]
  HTTP ─────────►
                ──► parseAgentTurnResponse: strict outer object               [TS]
                ──► parseBatch: envelope, then each command on its own        [TS]
                ──► commandToUiAction: exhaustive switch → uiStore action     [TS]
```

LLM instructions (the prompt) are guidance only. Every rule above is enforced
in code.

## 9. Python-side validation

- **Generated models.** `scripts/generate_contracts.py` is generalised from
  one output to three modules:
  - `contracts/api_contracts.py`, unchanged
  - `contracts/ui_commands.py`, from `agent-turn-response.v1.json` and
    `agent-turn-request.v1.json`
  - `contracts/agent_intents.py`, from the `intent` subtree of
    `agent-intent.v1.json`

  The branches of `oneOf` get titles, which are names only (for example
  `ShowMenuCategory`).
- **Presentation tools.** `ai_service/ui_commands/`: a registry of five
  `PresentationToolDefinition(name, description, command_model)`, where the
  input model is the command model minus `type`. `execute(name, args)` does
  three things. It validates strictly: no coercion, extra keys forbidden. It
  builds the command, for example `ShowMenuCategory(type=..., **args)`. It
  returns a `ToolResult`-shaped `{"ok": true}` to the model and carries the
  validated command as the `ToolMessage.artifact`, which is never sent to the
  model.
- **The response.** `AgentService` builds the generated
  `AgentTurnResponse(reply, uiCommands=UiCommandBatch(...))`. Validation
  happens inside the existing try, so a `ValidationError` becomes
  `AGENT_FAILED` and never a traceback (ADR-0019 S2).

## 10. TypeScript-side validation

- `parseAgentTurnResponse(input)` works in two stages, like `parseBatch`.
  - Stage 1: a strict outer `{reply, uiCommands?: unknown}`.
  - Stage 2: `parseBatch(uiCommands)` when present.
  - It returns
    `{accepted: true, reply, uiCommands: BatchParseResult | null}` or
    `{accepted: false, reason, received}`. It never throws.
- `apps/web` `lib/agent/agentService.ts` calls `request()` with a
  `ResponseSchema` adapter over `parseAgentTurnResponse`. A failure at stage 1
  becomes `ApiError{kind: "invalid-response"}`.
- `lib/commands/dispatch.ts` gains `dispatchBatch(result: BatchParseResult)`,
  which returns `{entries, uiActions}`. It reuses `commandToUiAction`. The
  existing `dispatchCommand` stays.

## 11. AI response schema

```jsonc
// 200 — commands produced
{
  "reply": "Added Tiramisu. Here's your cart.",
  "uiCommands": {
    "contractVersion": 1,
    "correlationId": "<the turn's X-Correlation-Id>",
    "issuedAt": "2026-09-26T12:00:00.000Z",
    "commands": [ { "type": "OpenCartPanel", "open": true } ]
  }
}
// 200 — no commands: key omitted
{ "reply": "Sorry, Tiramisu is currently unavailable." }
// 500 — unchanged ContractError, never uiCommands
{ "code": "AGENT_FAILED", "message": "The assistant could not process this message." }
```

There is one schema, authored in Zod and generated for Python. The web's type
is `z.infer` of it.

## 12. Business intent → tool mapping

The map is fixed and literal, in `ai_service/tools/intents.py`:

| Tool | Category | Intent (generated model) | Client call | Route |
| --- | --- | --- | --- | --- |
| `get_menu` | read | — | `get_menu()` | `GET /v1/menu` |
| `get_cart` | read | — | `get_cart()` | `GET /v1/cart` |
| `add_cart_item` | write | `AddItemToCart` | `add_cart_item(itemId, quantity)` | `POST /v1/cart/items` |
| `set_cart_item_quantity` | write | `SetCartItemQuantity` | `set_cart_item_quantity(...)` | `PATCH /v1/cart/items/{itemId}` |
| `remove_cart_item` | write | `RemoveItemFromCart` | `remove_cart_item(itemId)` | `DELETE /v1/cart/items/{itemId}` |

Flow of a write in `ToolService.execute`:

1. Registry lookup.
2. Validate the tool input model (unchanged).
3. `intent = INTENT_MODELS[name].model_validate({"type": ..., **args})`.
4. The handler receives the intent.
5. Make one client call.

Tests pin three things:

- The map is a bijection between write tools and `AGENT_INTENT_TYPES`.
- Tool input fields equal intent fields minus `type`, which guards drift.
- Each intent reaches exactly its route.

The model cannot create an operation: the tool name is looked up, never
dispatched dynamically. commerce-api remains the final authority. Nothing
here checks availability or price.

## 13. Tool result → UI command flow

```text
call_model ─► AIMessage.tool_calls = [add_cart_item{tiramisu,1}]
execute_tools ─► ToolService (intent AddItemToCart) ─► commerce-api ─► ToolMessage{"ok":true,data:cart}
call_model ─► reads the result ─► tool_calls = [open_cart_panel{open:true}]
execute_tools ─► PresentationTools ─► ToolMessage{"ok":true} + artifact=OpenCartPanel
call_model ─► final text
finalize_reply ─► reply + ui_commands = [artifacts of ok presentation ToolMessages, in order]
AgentService ─► AgentTurnResponse(reply, UiCommandBatch)
```

The model decides which commands to emit after it has seen the authoritative
tool result. It can also call a presentation tool in the same message as a
write. That is still safe. Commands are delivered only when the graph ends,
after every write has resolved, and none of them can claim success (§17).

## 14. Transport mechanism

**Decision: a synchronous HTTP JSON response.** It uses the existing
`POST /v1/agent/turns`, reached from the browser through a new same-origin
rewrite, `/api/ai/v1/agent/turns` → `${AI_SERVICE_URL}/v1/agent/turns`.
This is the ADR-0018 pattern, and `ai-service.md` §1 already prescribes it:
"any future browser access goes through apps/web's same-origin proxy".

- **Why not SSE, streaming or WebSocket.** Turns are request/response. The
  simulated model answers in milliseconds, and a turn's commands are known
  only when it ends. Nothing needs to be pushed from the server. Streaming
  becomes a question with a real provider or with voice (Phase 16).
- **Only one exact path** is rewritten. `middleware.ts` extends its matcher
  to `/api/ai/:path*` and answers 404 for anything but exactly
  `/api/ai/v1/agent/turns`, checking both the raw and the parsed path.
- `AI_SERVICE_URL` is server-only. The default is `http://127.0.0.1:3002`
  in development and in the rewrite. It is required at runtime in production,
  mirroring `COMMERCE_API_URL`.
- The web client uses a 30 s timeout, because the worst case with commerce-api
  hanging is 8 × 3 s. Turns are never retried: a turn may have changed the
  cart.

## 15. Frontend dispatcher architecture

The existing structure stays and is extended:

```text
ChatInput.handleSubmit
  └─ sendAgentTurn(message)                    lib/agent/agentService.ts → lib/api/client.ts
       └─ parseAgentTurnResponse               @contracts/ui-commands
  └─ await cart.refresh()                      always (§16, §19)
  └─ transcript += reply (text node)
  └─ dispatchBatch(uiCommands)                 lib/commands/dispatch.ts
       └─ per command: accepted → commandToUiAction (exhaustive switch)
                       rejected → log entry only
  └─ ui.logCommand(entry) / ui.applyUiAction(action), in order
```

Unknown types never reach the switch, because `parseBatch` rejects them. The
switch is exhaustive over the `UiCommand` type (a compile error otherwise).
There is no registry keyed by an agent string, no `window[...]`, no
`eval`/`new Function` (a lint error), no navigation, URL, selector, or
component name taken from agent output, and no rendering of HTML. `ChatInput`
may use `useCart().refresh()` as a read. `dispatch.ts` stays unable to reach
`cartStore`.

## 16. Command execution ordering

| Case | Rule |
| --- | --- |
| 0 commands | `uiCommands` omitted. Only the reply is shown. |
| 1 to N commands | Applied in array order, which is the model's call order. |
| Independence | Each command is independent. A rejected command is logged and skipped, and its siblings still apply (`parseBatch`). Conflicting commands, such as two categories, resolve last-wins, as reducer semantics already do. |
| Bad envelope | Nothing applies. One rejected log entry. The reply is still shown. |
| Maximum | ≤8 per turn from ai-service (the shared tool-call limit). The contract cap of 10 is enforced again in web. |
| Turn sequence in web | 1. Response received. 2. `await cart.refresh()`. 3. Show the reply. 4. Apply commands. So an `OpenCartPanel` opens a cart that commerce-api has just confirmed. |
| Turn sequence in ai-service | Every commerce write resolves inside the graph before `finalize_reply` collects commands. The frontend never receives a command before the commerce outcome exists. |

## 17. Error handling

| Situation | ai-service | Web |
| --- | --- | --- |
| Write succeeds | The model sees `ok:true` and the cart, and may emit `OpenCartPanel` | Refresh, reply, commands |
| Write fails (for example `MENU_ITEM_UNAVAILABLE`) | The model sees `ok:false` and explains. The simulated model emits no command. A real model *may* still open the cart, which only ever shows the true cart. | Refresh (the cart is unchanged), reply |
| Write outcome unknown | Existing rule: the model must call `get_cart` first | Refresh shows the truth |
| Invalid presentation arguments | `INVALID_TOOL_ARGUMENTS` goes to the model, and the command is not recorded | — |
| Over the call limit | `TOOL_CALL_LIMIT_EXCEEDED`, not recorded | — |
| The turn fails (`AGENT_FAILED`, 500) | Error body only. Earlier cart writes stay applied (documented today). | Fixed copy "The assistant couldn't handle that…", **refresh anyway**, no commands |
| ai-service is down or times out | — | `UNREACHABLE_MESSAGE`-style copy, refresh, no commands |
| The response fails the contract | — | `invalid-response` → generic copy, refresh, no commands |

**No false success.** This is guaranteed three ways, not by the prompt:

1. The allowlist contains no command that asserts an outcome.
   `ShowOrderConfirmation` stays rejected, and no toast or "added" command
   exists.
2. What the cart panel shows always comes from commerce-api, re-read after
   every turn.
3. The reply text is untrusted wording (§4.3). The number on screen comes from
   the backend.

OD9 offers an extra programmatic gate if you want one.

## 18. Security model

| Threat | Control |
| --- | --- |
| The model emits JS, URLs, selectors, component names, or an arbitrary `type` | Closed union plus `extra=forbid` in Python and `strictObject` in TS. No field in any command can hold a route, URL, selector or code. Only `SearchMenu.query` is free text (≤200), rendered as an input value, which React escapes. |
| `{"execute": "..."}` or extra keys | Rejected in Python (never recorded) and again in TS (only that command is dropped) |
| Unbounded output | ≤16 calls per message (existing), ≤8 per turn, a batch of ≤10, a reply of ≤4000 |
| Prompt injection moves the UI | Bounded to five harmless presentation actions on ids the store already knows. An unknown id is a no-op or an empty list. |
| Prompt injection mutates the cart | The existing Phase 14 bounds (8 calls, 99 per line, no order tool). This phase adds intent validation, not new capability. |
| A UI command reaches commerce state | `dispatch.ts` cannot import `cartStore`. Presentation tools cannot import the Commerce client (test). Web cannot import intents (lint). |
| The proxy exposes more of ai-service | One exact path. Everything else is 404, including `/health`, `/docs` and dot segments. Loopback binding stays. |
| A reply renders as HTML | A text node only. A test asserts that markup is shown literally. |
| Logs leak content | Presentation tools log tool name, category `ui` and outcome, never arguments. The turn log adds `ui_commands` (a count). |

Specialised security review is **required** (Full Path). See the end of this
document.

## 19. State ownership

| State | Owner | Phase 15 change |
| --- | --- | --- |
| Cart, prices, order, inventory, order status | commerce-api | none |
| Cart as displayed | `cartStore` (a holder of the last commerce response) | refreshed after each turn |
| UI presentation state | `uiStore` | now also driven by real agent commands |
| Turn messages | graph state, discarded after the turn | new optional key `ui_commands` (UI commands only, never commerce data), set by `finalize_reply` only |
| Chat transcript | `ChatInput` local state, for display only | shows AI replies |

ai-service keeps no copy of the cart. A tool result is context for the model
within one turn and is never read back as truth.

## 20. Testing strategy

See `test-plan.md`. It covers:

- contract accept and reject matrices, in TS and in Python against the same
  JSON Schema
- the allowlist bijections, for UI tools and for intents
- the dispatcher mapping every command, with unknown and malformed input
  failing safely
- intent → tool → route
- failure flow with no command
- the combined scripted flow
- the web `ChatInput` flow with a stubbed `fetch`
- the proxy path rules
- manual end-to-end checks across the three running services

## 21. Files to create

| File | Purpose |
| --- | --- |
| `packages/contracts/ui-commands/src/agentTurn.ts` (+ `agentTurn.test.ts`) | Turn request/response schemas and `parseAgentTurnResponse` |
| `packages/contracts/ui-commands/schema/agent-turn-request.v1.json`, `agent-turn-response.v1.json` | Generated, committed |
| `apps/ai-service/ai_service/contracts/ui_commands.py`, `agent_intents.py` | Generated Pydantic |
| `apps/ai-service/ai_service/ui_commands/{__init__,registry,service}.py` | Presentation tool allowlist and executor |
| `apps/ai-service/ai_service/tools/intents.py` | The write-tool ↔ intent map |
| `apps/ai-service/tests/test_ui_command_tools.py`, `test_business_intents.py`, `test_agent_ui_commands.py` | New tests |
| `apps/web/src/lib/agent/agentService.ts` (+ test) | Sends a turn and parses the response |
| `apps/web/src/components/chat/ChatInput.test.tsx` | Chat flow tests (none exist today) |

## 22. Files to modify

| File | Change |
| --- | --- |
| `packages/contracts/ui-commands/src/index.ts`, `scripts/emit-schema.ts`, `src/schema.test.ts` | Export and emit the new schemas, and add freshness checks |
| `apps/ai-service/scripts/generate_contracts.py` | Three outputs and titles for the `oneOf` branches |
| `apps/ai-service/ai_service/schemas/agent.py` | Re-export the generated `AgentTurnRequest` and `AgentTurnResponse` in place of the hand-written ones |
| `apps/ai-service/ai_service/api/agent.py` | Return `uiCommands`, with `response_model_exclude_none` |
| `apps/ai-service/ai_service/agents/{state,nodes,graph,service,prompts}.py` | Add the `ui_commands` key. `execute_tools` routes presentation calls. `finalize_reply` collects the commands. Bind both registries (check they are disjoint). Build the batch. Add prompt rules. Add the log field. |
| `apps/ai-service/ai_service/tools/{registry,service}.py` | Write handlers take the intent, and the log line gains `intent` |
| `apps/ai-service/ai_service/llm/simulated.py` | A deterministic keyword model (OD6) |
| `apps/ai-service/ai_service/main.py` | Build the presentation service and inject it |
| `apps/ai-service/tests/…` | Update: `test_agent_state` (keys), `test_simulated_model`, `test_generated_contracts`, `test_agent_api`, `test_agent_tool_loop`, `test_tool_service`, `test_tool_logging`, `test_boundaries` |
| `apps/web/next.config.ts` | Rewrite `/api/ai/v1/agent/turns` |
| `apps/web/src/middleware.ts`, `lib/api/proxyPath.ts` (+ tests) | Exact-path rule for AI |
| `apps/web/src/lib/api/config.ts` (+ test) | `AI_SERVICE_URL` and the browser base `/api/ai` |
| `apps/web/src/lib/api/userMessages.ts` (+ test) | An `"agent"` message context |
| `apps/web/src/lib/commands/dispatch.ts` (+ test) | `dispatchBatch` |
| `apps/web/src/components/chat/ChatInput.tsx` | Use ai-service, refresh, dispatch the batch, pending state. Remove `OUTCOME_MESSAGES`. |
| `apps/web/.env.example` | `AI_SERVICE_URL` |
| Docs: `docs/api/ai-service.md`, `docs/api/contracts.md`, `docs/architecture/system-architecture.md` (§3, §6, the ADR-0012 open question on `oneOf`), `architecture-decisions.md` (ADR-0022), `docs/development/getting-started.md`, `apps/ai-service/README.md` | Documents this change would otherwise leave wrong |

**Delete:** `apps/web/src/lib/commands/simulate.ts`. It is replaced by the
real producer (OD11).

## 23. Dependencies to add

**None.**

- `apps/web` already depends on `@contracts/ui-commands`.
- ai-service already has `datamodel-code-generator` and `jsonschema` (dev).
- The new contract lives in `ui-commands`, which already depends only on
  `common` and `zod`.
- `pnpm install` is not required.

## 24. Acceptance criteria

AC1–AC21 in `requirements.md`.

## 25. Validation commands

These all come from `docs/development/getting-started.md`, and each is run in
the phase that touches its area. Run the full set before `/review`.

| Area | Command |
| --- | --- |
| Contract JSON Schema | `pnpm --filter @contracts/ui-commands build` |
| TS typecheck, lint, test, build | `pnpm turbo run typecheck`, `pnpm turbo run lint`, `pnpm turbo run test`, `pnpm turbo run build` |
| Python codegen | `cd apps/ai-service && uv run python scripts/generate_contracts.py` (no diff after the second run) |
| Python test, lint, format, types | `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy` |
| Live (optional, needs commerce-api) | `AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 uv run pytest tests/test_live_commerce.py` |

## 26. Risks

| Risk | Impact | Handling |
| --- | --- | --- |
| `datamodel-code-generator` turns a `oneOf` with no `discriminator` into a plain `Union` (the ADR-0012 open question) | Noisy errors, or a wrong branch chosen | Strict literal plus `extra=forbid` means only one branch can match. It is verified by tests in Phase 2. If unusable, the script adds a names-only discriminator hint, and I **stop and ask** before any other workaround. |
| Replacing the hand-written `AgentTurnRequest` changes the 400 `field` or message behaviour | A regression in the error contract | The existing `test_agent_api` 400 tests must pass unchanged |
| An agent command names an unknown category, which empties the menu list | A confusing UI | Recoverable through "All". Recorded as a follow-up (validate against the menu, or ignore unknown ids in web). |
| The simulated model's `add <item>` now mutates the real shared cart from chat | New behaviour in the demo | Intended. It is visible and reversible. It is bounded by the Phase 14 limits. |
| Double add on a duplicate call (gap 3) | Wrong quantity | Unchanged by this phase. No retries anywhere. It stays the recorded follow-up before a real model. |
| The Next rewrite proxy times out before 30 s | A spurious turn failure | Checked in Phase 4. If the default is shorter, set Next's proxy timeout (config within its existing shape). |
| `issuedAt` is formatted `+00:00`, not `Z` | Web rejects every batch | A test pins the `Z` form against the committed JSON Schema |
| Size: three apps plus contracts in one phase | A long review | Five small phases, each independently green. The split option is below. |

## 27. Open decisions (all need approval)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| OD1 | Command and intent shape | (a) keep the flat, existing contract · (b) `{type, payload, metadata}` (breaking, v2) | **(a)** |
| OD2 | Allowlist | (a) reuse the five, add none · (b) also add `OpenCheckout` | **(a)**. `OpenCheckout` reverses a routing decision, and `ShowOrderConfirmation` stays rejected. |
| OD3 | How the model emits commands | (a) presentation tools (a second allowlisted registry) · (b) structured JSON in the final message · (c) derived in code from tool results | **(a)**. It works with `bind_tools` and any provider, gives per-call validation and feedback, and needs no JSON parsing of free text. |
| OD4 | Where the agent-turn contract lives | (a) `ui-commands` · (b) an `api-contracts` subpath · (c) a new package | **(a)**. It is the AI → web family. The `commerce-api` import ban already covers it, and no new dependency is needed. |
| OD5 | Intent integration | (a) validate write tools as generated intents, with a fixed map · (b) a documented map plus a drift test only · (c) an intent-envelope endpoint on commerce-api | **(a)**. It enforces the contract at runtime. (c) is out of scope. |
| OD6 | Simulated model | (a) a deterministic keyword model: `simulate.ts` phrases → presentation tools, `add <item>` → `add_cart_item` → `open_cart_panel` only if `ok` · (b) keep the fixed reply | **(a)**. Under (b), switching web to ai-service would regress the working chat demo to a fixed reply. |
| OD7 | Transport | (a) synchronous HTTP via the same-origin rewrite · (b) SSE · (c) WebSocket | **(a)** |
| OD8 | Cart freshness after a turn | (a) web always refreshes · (b) a `cartChanged` flag in the response | **(a)**. It needs no contract field and is right even after `AGENT_FAILED`. |
| OD9 | A false-success gate | (a) none: the allowlist cannot express success, and the cart is re-read · (b) drop `OpenCartPanel` when the turn's last write failed | **(a)**. Showing the true cart after a failure is not a false claim. |
| OD10 | Command limit | (a) share the 8-per-turn tool-call limit, with the contract cap of 10 still checked in web · (b) a separate UI cap | **(a)** |
| OD11 | `simulate.ts` and its adversarial hooks | (a) delete, with the reject paths covered by unit tests · (b) keep as a dev fallback | **(a)**. There is one producer, not two. |
| OD12 | Zero commands | (a) omit `uiCommands` · (b) `null` | **(a)**. "A new optional field" is additive under `version.ts`. |

## 28. Implementation order (phases)

### Phase 1 — Contract
- [ ] Add `agentTurn.ts` with its schemas and `parseAgentTurnResponse`.
- [ ] Export them, emit the JSON Schema, and extend the freshness test.
- [ ] Add accept/reject matrix tests (AC4), including an `execute` key and
  11 commands.
- **Done when:** AC1–AC4 hold, and `pnpm --filter @contracts/ui-commands`
  `build`, `test`, `lint` and `typecheck` pass.

### Phase 2 — Python generation
- [ ] Generalise `generate_contracts.py` to three modules.
- [ ] Generate the models, and replace the hand-written turn models with them.
- [ ] Verify union behaviour (Risk 1).
- **Done when:** AC5 holds. All existing ai-service tests pass unchanged in
  outcome. `ruff`, `mypy` and `pytest` pass.

### Phase 3 — ai-service: intents, presentation tools, response
- [ ] Add `tools/intents.py` and switch the write handlers to intents (AC9).
- [ ] Add the `ui_commands/` registry and service (AC7), with the
  disjointness check (AC8).
- [ ] `execute_tools` routing, collection in `finalize_reply`, the state key,
  and building the batch in `AgentService` (AC6, AC10–AC12).
- [ ] Prompt rules and log fields.
- [ ] The deterministic simulated model (AC13).
- **Done when:** AC6–AC13 hold, and the full ai-service check set passes.

### Phase 4 — Web integration
- [ ] Config, rewrite, middleware and path rule (AC17).
- [ ] `agentService`, the `"agent"` user-message context, and
  `dispatchBatch`.
- [ ] Rewire `ChatInput` (AC14–AC16) and delete `simulate.ts` (AC19).
- **Done when:** AC14–AC19 hold, and `pnpm turbo run` typecheck, lint, test
  and build pass.

### Phase 5 — Docs and full validation
- [ ] The AC20 documents, plus ADR-0022.
- [ ] The full validation set, and the manual end-to-end checks.
- **Done when:** AC20–AC21 hold.

**Split option.** If you prefer two reviews, 15a is Phases 1–3 (ai-service
produces commands; web unchanged) and 15b is Phases 4–5. 15a is safe to merge
alone: the field is additive, and web does not call the route yet.

## 29. Expected final architecture

```text
 Browser (Next.js)
   ChatInput ──POST /api/ai/v1/agent/turns──► middleware (exact path) ──rewrite──► ai-service
      ▲                                                                              │
      │                                                                   LangGraph turn
      │                                                        ┌──────────┴───────────┐
      │                                           Commerce tools (5)          Presentation tools (5)
      │                                           write ⇒ AgentIntent          ⇒ UiCommand (Pydantic)
      │                                                 │                            │ (artifact only;
      │                                     Commerce API client ──► commerce-api      │  no I/O)
      │                                                 │               │            │
      │                                          ToolMessage(ok/err) ◄──┘            │
      │                                                        └──────► finalize_reply ◄┘
      │                                                                  reply + ui_commands
      │   { reply, uiCommands: UiCommandBatch }  ◄─────────────────────────────┘
   parseAgentTurnResponse → await cart.refresh() (GET /api/commerce/v1/cart) → reply → dispatchBatch
                                                                                    → commandToUiAction → uiStore
```

## Assumptions

| # | Assumption | Verified? |
| --- | --- | --- |
| A1 | Generated Pydantic from `oneOf` of strict const-typed objects accepts each valid command and rejects everything else | **No.** Phase 2 verifies it (Risk 1). |
| A2 | `correlation_id_var` is always set during a request (the middleware generates one when absent) | **No.** Read in Phase 3. If it can be `None`, generate one in `AgentService`. |
| A3 | `ToolMessage.artifact` exists in the pinned `langchain-core` and is not sent to the model | **No.** Checked in Phase 3. The fallback is to rebuild commands from the tool-call arguments. |
| A4 | `cartStore.refresh()` never throws | **Yes.** `load()` catches. |
| A5 | `ChatInput` has no existing test file | **Yes** (file listing) |
| A6 | Unknown command ids are a no-op or give an empty list in the current UI | **Yes** (`findMenuItemIn`, `filterMenu`) |
| A7 | No new npm or Python dependency is needed | **Yes** (manifests read) |
| A8 | The Next dev rewrite proxy allows a 30 s request | **No.** Checked in Phase 4. |

## Not doing (deferred to Phase 16+)

- Voice or LiveKit (Phase 16).
- Streaming or SSE.
- Conversation memory or `conversationId`.
- A real model provider.
- Order tools, `PlaceOrder`, `OpenCheckout`, `ClearCart`.
- An idempotency key on `POST /v1/cart/items`.
- A per-turn deadline.
- Validating command ids against the menu.
- Correlating web and ai-service logs with a web-generated `X-Correlation-Id`.

## Follow-up (not done)

- FOLLOW-UP (not done): `apps/web/src/lib/menu/filter.ts:20` — an unknown
  `categoryId` filters the menu to empty — ignore unknown categories, or
  validate command ids against the menu — LOW.
- FOLLOW-UP (not done): `apps/web/src/lib/api/errors.ts` `describe()` says
  "Commerce API request failed" even for an agent turn. The text is
  developer-facing only — generalise it — LOW.

## Specialised review needed?

- **Security: yes.** This phase opens a new trust boundary: agent output
  reaching the browser, and a new browser → ai-service proxy path. Review §18,
  the proxy path rules, and the strictness of the generated models.
- **Performance: no.** It adds one synchronous request per turn and one cart
  GET. The existing timeouts apply.
- **Data or migration: no.** It has no schema, storage or persistence change.

## As built (2026-09-27)

All five phases were implemented as approved. Deviations and findings,
each reported in its phase:

- **Phase 2: generator option `type_mappings=["string+date-time=string"]`.**
  As generated, `issuedAt` was an `AwareDatetime` carrying the contract's
  regex. Pydantic cannot apply a pattern to a datetime, so every batch
  raised `TypeError`. The fix is a generator setting; the schema files are
  not edited and `api_contracts.py` is byte-identical. Documented in
  `scripts/generate_contracts.py`.
- **Phase 2: `response_model_exclude_none=True` moved from Phase 3 to
  Phase 2.** Without it the generated response would have serialized
  `"uiCommands": null` straight away, which the contract rejects.
- **A1 resolved.** The generated unions are plain unions. Each branch has a
  `Literal` type and forbids extra keys, so at most one can match. This is
  tested in both languages. The generated models coerce types by default, so
  the presentation tools validate with `strict=True`.
- **A2 confirmed** (with a UUID fallback outside a request). **A3
  confirmed** by langchain-core 1.6.5's documentation of
  `ToolMessage.artifact`. **A8 confirmed**: Next 15.5.25's rewrite proxy
  defaults to 30 s.
- **Phase 3: `COMMAND_CLASSES`,** a literal tuple of the five generated
  command classes, is needed so that mypy narrows `isinstance`. A test pins
  it to the generated union.
- **Phase 4: no server-side `AI_SERVICE_URL` resolver.** Only the browser
  calls ai-service, so a runtime production check would be dead code.
  `AI_SERVICE_URL` is needed at build time for the rewrite, like
  `COMMERCE_API_URL`.
- **Phase 4: the planned `NEXT_PUBLIC_` source-read test was dropped.**
  `config.test.ts` runs under jsdom, where a `file://` read is unreliable. A
  grep verified it instead.
- **Phase 5 manual check: with ai-service down, Next's proxy answers 500.**
  The chat therefore shows the generic "Something went wrong on our side",
  not the "can't reach" copy. ADR-0022's Consequences say so.
- **Existing tests changed** (each for a planned behaviour change):
  `test_main.py` was split, because the default model now reaches
  commerce-api for `add <item>`. `test_simulated_model.py` was rewritten.
  These now pin the new state key, the log fields and the bound tool list.
  `middleware.test.ts` (matcher) and `config.test.ts` (rewrites) were
  extended.

- **Security review S1 (HIGH), fixed at the human's request.** The Phase 4
  middleware branch for `/api/ai` was removed, and `middleware.ts`,
  `proxyPath.ts` and their tests are back to HEAD. At runtime Next hands
  middleware an already-normalized URL, so that branch let
  `/api/commerce/v1/../../ai/v1/agent/turns` through to the commerce rewrite.
  The AI rewrite's exact source and fixed destination confine it without
  middleware. §14's and §18's "`middleware.ts` … answers 404" is superseded:
  Next answers 404 because nothing matches. Verified by a live probe
  (`security-review.md`).

**Follow-up (not done)**

- FOLLOW-UP (not done): `apps/web/src/lib/menu/filter.ts:20` — an unknown
  `categoryId` from a command filters the menu to empty — ignore unknown
  categories, or validate command ids against the menu — LOW.
- FOLLOW-UP (not done): `apps/web/src/lib/api/errors.ts` `describe()` —
  says "Commerce API request failed" for agent turns too (developer-facing
  only) — generalise it — LOW.
- FOLLOW-UP (not done): the chat has no AI-specific copy for "the assistant
  is unavailable" (it shows the generic server-error copy) — add a
  code/status-specific agent message — LOW.
- FOLLOW-UP (not done): `docs/development/getting-started.md`, repository
  layout block for `apps/web`. It already listed files deleted in Phase 11
  (`pricing.ts`, `fixtures/menu.ts`, `order.ts`), which is pre-existing
  staleness; Phase 15 changed only its own lines — refresh the block — LOW.
- FOLLOW-UP (not done): `docs/architecture/system-architecture.md` header
  still reads "Nothing described here is implemented yet" (Last updated
  2026-09-14), which is pre-existing — update the status line — LOW.
- FOLLOW-UP (not done): `apps/web/src/middleware.ts` matcher and the
  `next.config.ts` commerce rewrite — a case variant
  (`/API/COMMERCE/v1/../health`) skips middleware and reaches commerce-api
  outside `/v1`. This is pre-existing since Phase 11, not caused by Phase 15
  (`security-review.md` S2) — use a case-insensitive matcher, or a Route
  Handler that builds the upstream path from validated segments, verified by
  a live probe — MEDIUM.
- Carried forward, unchanged: an idempotency key on `POST /v1/cart/items`
  before a real model (system-architecture §8 gap 3), and a per-turn
  deadline.
