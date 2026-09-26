# Requirements — Phase 15: AI → UI Commands & Business Intent Integration

**Approval Status:** APPROVED
**Approved by:** user, in conversation, 2026-09-26 — all recommended decisions (OD1–OD12) accepted; one phase set, no 15a/15b split
**Risk:** HIGH
**Path:** Full

Risk rationale (`.claude/commands/forge.md` table): cross-cutting across all
three apps and `packages/contracts` (Scope: HIGH); agent output crossing into
the browser is the input-trust boundary `system-architecture.md` §4.3 exists
for (Security: HIGH); a new browser → ai-service network path through the
web proxy (Infrastructure: MEDIUM); additive changes to published contracts
(API: MEDIUM). Any one HIGH dimension makes the task HIGH.

## Problem

Phases 1–14 built both halves of an AI → UI pipeline that are not connected:

- `apps/web` has a validated UI-command dispatcher
  (`src/lib/commands/dispatch.ts`) and a closed allowlist
  (`@contracts/ui-commands`), but its only producer is
  `src/lib/commands/simulate.ts`, a hardcoded keyword table marked
  *TEMPORARY — stands in for apps/ai-service*.
- `apps/ai-service` runs a LangGraph agent with five allowlisted Commerce
  tools, but `POST /v1/agent/turns` returns `{"reply": "..."}` only. It emits
  no UI commands, and `apps/web` does not call it at all
  (`docs/api/ai-service.md` §3.1).
- `@contracts/agent-intents` defines three business intents, and the three
  Phase 14 write tools execute exactly those operations, but nothing in
  ai-service validates against or even names the intent contract
  (Phase 14 plan OD11 deferred it "to the phase that submits intents").
- The agent-turn request/response is hand-written Pydantic
  (`ai_service/schemas/agent.py`), with no Zod source. That breaks ADR-0003
  the moment a TypeScript consumer appears.

## Goal

A customer types in the web chat. The message goes to ai-service. The agent
may change the cart through the existing tools, each validated as a business
intent from the contract. It returns a reply plus a bounded batch of
allowlisted UI commands. `apps/web` validates that batch again, applies each
accepted command through the existing dispatcher, and re-reads the cart from
commerce-api after every turn.

## Existing contracts reused (not duplicated)

| Contract | Package | Change |
| --- | --- | --- |
| UI command union (5 commands) | `@contracts/ui-commands` `commands.ts` | **None.** Reused as-is. |
| UI command batch envelope (≤10, 2-stage parse) | `@contracts/ui-commands` `envelope.ts`, `parse.ts` | **None.** Becomes the `uiCommands` field of the turn response. |
| Business intent union (3 intents) | `@contracts/agent-intents` `intents.ts` | **None.** Gains its first runtime consumer (generated Pydantic). |
| Intent request envelope (`idempotencyKey`) | `@contracts/agent-intents` `envelope.ts` | **None.** Still unused. No endpoint accepts it (see Out of scope). |
| Envelope metadata, ids, `ContractError` | `@contracts/common` | **None.** |
| Cart/menu API contracts | `@contracts/api-contracts` | **None.** |

## Contracts that require changes

| Change | Why |
| --- | --- |
| **New** `agentTurnRequestSchema` / `agentTurnResponseSchema` / `parseAgentTurnResponse` in `@contracts/ui-commands` (`src/agentTurn.ts`) plus committed JSON Schema | The turn response is the AI → web payload. Today it exists only as hand-written Pydantic. It must come from Zod (ADR-0003), so TS and Python cannot drift. |
| `POST /v1/agent/turns` response gains optional `uiCommands` (a `UiCommandBatch`) | Additive, within contract version 1 (`version.ts`: "a new optional field"). `docs/api/ai-service.md` §3.1 already reserves this. |
| `ai_service/schemas/agent.py` hand-written `AgentTurnRequest`/`AgentTurnResponse` **replaced** by generated models | Called out explicitly, not silent. The request's wire rules stay identical (1–2000 chars, one non-whitespace). The response adds only the optional field. |

## In scope

1. The agent-turn contract in Zod, with its JSON Schema and a two-stage
   parser. One bad command drops alone; a bad envelope drops the batch.
2. Pydantic generation (`scripts/generate_contracts.py`) extended to
   `ui-commands` (turn request, response, batch, commands) and
   `agent-intents` (the three intents).
3. ai-service **presentation tools**: a second allowlisted registry, one tool
   per UI command type, separate from the Commerce tool registry. Calling one
   validates the arguments against the generated UI command model and records
   the command. It touches nothing else.
4. ai-service business-intent binding. Each write tool's arguments are
   validated as the matching generated `AgentIntent` before its one client
   call, through a fixed tool ↔ intent map.
5. `finalize_reply` collects the turn's accepted UI commands. The response
   carries them in a `UiCommandBatch` envelope (correlation id, ISO-8601 `Z`
   timestamp, contract version 1).
6. The simulated model becomes a deterministic keyword model. It ports
   `simulate.ts`'s phrases to presentation tool calls, and runs
   `add <item>` → `add_cart_item` → show the cart **only if** the tool
   returned `ok: true`.
7. System prompt rules for presentation tools.
8. `apps/web`:
   - a same-origin proxy `/api/ai/v1/agent/turns` → `AI_SERVICE_URL`
     (exact path only)
   - an agent service in `lib/`
   - a batch dispatch helper
   - `ChatInput` rewired to ai-service: shows the reply, re-reads the cart,
     then applies commands in order
   - deletes `simulate.ts`
9. Documentation the change makes wrong, plus ADR-0022.

## Out of scope

- **New UI commands.** `OpenCheckout` stays a candidate, because it reverses
  the `/checkout`-only-from-`/cart` routing decision (`contracts.md` §7).
  `ShowOrderConfirmation` stays **rejected outright**: it would let an agent
  show an order that never happened.
- **New business intents.** `ClearCart` has no route and was declined
  (ADR-0011, ADR-0015). `PlaceOrder`/`CreateOrder` awaits a product
  decision (Phase 14 OD2). `START_CHECKOUT` is navigation, not a business
  operation. No renames either: the brief's `UPDATE_CART_ITEM_QUANTITY` is the
  existing `SetCartItemQuantity`, and the brief's `productId` is the
  existing `itemId`.
- **Reshaping contracts to `{type, payload, metadata}`.** The existing shape is
  flat, with metadata on the envelope. Changing it is a breaking change and a
  major-version bump. See OD1.
- **An intent-envelope endpoint on commerce-api.** The REST cart routes are
  the intent executors (Phase 14 plan §3).
- Streaming, SSE, WebSocket.
- Conversation memory or `conversationId`.
- A real model provider.
- Voice or LiveKit (Phase 16).
- MCP, RAG, embeddings, vector databases, Redis, multi-agent designs.
- Payments, delivery, notifications, deployment, Kubernetes.
- An idempotency key on `POST /v1/cart/items`. It is an existing follow-up
  (system-architecture §8 gap 3). This phase leaves it unchanged and does not
  retry.
- Validating command ids against the live menu (see Risks and Follow-up).

## Acceptance criteria

### Contracts
- [ ] **AC1** `@contracts/ui-commands` exports `agentTurnRequestSchema`,
  `agentTurnResponseSchema` and `parseAgentTurnResponse`. The files
  `schema/agent-turn-request.v1.json` and `schema/agent-turn-response.v1.json`
  are committed. The package's freshness test fails if either drifts.
- [ ] **AC2** The UI command union is unchanged: exactly `ShowMenuCategory`,
  `HighlightItem`, `OpenCartPanel`, `ShowItemDetail`, `SearchMenu`.
  `git diff` of `ui-commands/src/commands.ts`, `envelope.ts`, `parse.ts` and
  `schema/ui-command.v1.json` is empty.
- [ ] **AC3** The business intent union is unchanged: exactly
  `AddItemToCart`, `RemoveItemFromCart`, `SetCartItemQuantity`. `git diff`
  of `packages/contracts/agent-intents/` is empty.
- [ ] **AC4** `parseAgentTurnResponse`:
  - It **accepts** a response with no `uiCommands`, and one with 1–10 valid
    commands.
  - It **rejects the response** when a top-level key is unknown (for example
    `execute`), when `reply` is missing, empty, or over 4000 characters.
  - It **rejects the batch but keeps the reply** when `uiCommands` has 11
    commands, when `contractVersion ≠ 1`, or when `correlationId` is missing.
  - It **rejects only the offending command, keeping its siblings**, when the
    command has an unknown `type`, an unknown key (for example
    `{"type":"OpenCartPanel","open":true,"execute":"alert(1)"}`), or an
    invalid payload.

### ai-service
- [ ] **AC5** Pydantic models are generated from committed JSON Schema by
  `scripts/generate_contracts.py`, for:
  - the agent-turn request and response
  - the UI command batch and each command
  - the three intents

  No hand-written counterpart remains. `tests/test_generated_contracts.py`
  fails on drift in every generated module.
- [ ] **AC6** `POST /v1/agent/turns`:
  - The request rules and every existing 400/405/413/415/500 behaviour are
    unchanged.
  - Every 200 body validates against `agent-turn-response.v1.json`.
  - `uiCommands` is omitted when the turn produced no commands.
  - When `uiCommands` is present:
    - `correlationId` equals the turn's `X-Correlation-Id`
    - `issuedAt` passes the contract's ISO-8601 `Z` pattern
    - `contractVersion` is `1`
- [ ] **AC7** Exactly five presentation tools exist, in a one-to-one mapping
  with `UI_COMMAND_TYPES` (bijection test).
  - Each call is validated against the generated command model.
  - Invalid arguments are answered `INVALID_TOOL_ARGUMENTS` and are **not**
    recorded as a command. That covers an unknown key, a wrong type, and a
    non-slug id.
  - The presentation-tool module does not import the Commerce client (test).
- [ ] **AC8** The Commerce tool registry is unchanged: the same five names,
  the same routes. Tool names are disjoint across the two registries, checked
  when the graph is built.
- [ ] **AC9** Each write tool maps to exactly one `AgentIntent` type and
  each intent to exactly one write tool (bijection test). A write tool's
  arguments are validated as that generated intent before its client call.
  Read tools map to no intent. The tool log line names the intent type.
- [ ] **AC10** UI commands appear only in the final response.
  - They keep the order in which the model requested them.
  - A presentation call in the same model message as a write is delivered
    only after the write's result exists.
  - Tested with a scripted model.
- [ ] **AC11** Presentation calls count toward `MAX_TOOL_CALLS_PER_TURN`
  (8). A call over the limit is refused and not recorded. A response never
  carries more than `MAX_COMMANDS_PER_BATCH` (10) commands.
- [ ] **AC12** On `AGENT_FAILED`, the body is the error only, never
  `uiCommands`.
- [ ] **AC13** The simulated model:
  - On `add tiramisu`, with commerce answering OK, the response carries
    `OpenCartPanel{open:true}`.
  - On `add` of an unavailable or unknown item, the reply explains the
    failure and the response carries **no** `uiCommands`.
  - Its reply never contains the customer's text.
  - It only ever names registered tools.

### apps/web
- [ ] **AC14** `ChatInput` sends turns through a `lib/` service. Components
  never call `fetch` directly.
  - The reply is rendered as a React text node (no
    `dangerouslySetInnerHTML`).
  - Accepted commands are applied in array order through the existing
    `commandToUiAction`.
  - Every accepted or rejected command is written to the command log.
  - An invalid envelope logs one rejection and applies nothing.
- [ ] **AC15** After **every** turn, success or failure, `ChatInput` awaits
  `useCart().refresh()` **before** applying any UI command.
- [ ] **AC16** Only one turn is in flight at a time: Send is disabled and
  guarded while it runs.
  - A turn is never retried.
  - Timeout, network failure or `AGENT_FAILED` shows fixed user-facing copy,
    never the backend message.
- [ ] **AC17** The proxy forwards only `/api/ai/v1/agent/turns`. Any other
  `/api/ai/*` path, including dot segments and encoded variants, gets 404.
  `AI_SERVICE_URL` is server-only (not `NEXT_PUBLIC_`), with default
  `http://127.0.0.1:3002`.
- [ ] **AC18** Existing boundaries hold:
  - `dispatch.ts` still has no `cartStore` import.
  - `apps/web` still has no `@contracts/agent-intents` import.
  - The `no-eval` / `no-implied-eval` / `no-new-func` lint rules pass.
- [ ] **AC19** `simulate.ts` is deleted, and no reference to it remains.

### Documentation and validation
- [ ] **AC20** These documents are updated:
  - `docs/api/ai-service.md`
  - `docs/api/contracts.md`
  - `docs/architecture/system-architecture.md`
  - ADR-0022 in `architecture-decisions.md`
  - `docs/development/getting-started.md`
  - `apps/web/.env.example`
  - `apps/ai-service/README.md`
- [ ] **AC21** Every command in `test-plan.md` → Validation commands was
  run, and its real result is reported.

## Open questions

See `plan.md` §27 (OD1–OD12). Each has a recommendation, and all need
approval.
