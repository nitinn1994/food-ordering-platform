# ai-service HTTP API

**Status:** Phase 15. Routes: `GET /health` and `POST /v1/agent/turns`
(a LangGraph agent on a simulated model, with five Commerce API tools and
five presentation tools that return UI commands to `apps/web`).
**Source of truth:** `apps/ai-service/ai_service/` (the app is wired in
`main.py`, errors in `core/errors.py`, body limits in
`core/request_limits.py`, the agent in `agents/`, the tools in `tools/`, the
Commerce API client in `clients/commerce/`, the presentation tools in
`ui_commands/`). **Decisions:** ADR-0019, ADR-0020, ADR-0021, ADR-0022.

This service is deliberately built like commerce-api
([`commerce-api.md`](./commerce-api.md)). A caller sees the same error body,
the same correlation headers and the same health contract from both.

## 1. Style

JSON over HTTP. Listens on `127.0.0.1:3002` by default. There is no CORS:
browser access goes through `apps/web`'s same-origin proxy, as it does for
commerce-api (ADR-0018). Since Phase 15 that proxy forwards exactly one path,
`/api/ai/v1/agent/turns` → `POST /v1/agent/turns`. Every other path under
`/api/ai/` (including `/health` and `/docs`) is answered 404 by `apps/web`
and never reaches this service: the rewrite's source is that one exact path
and its destination is fixed (ADR-0022). There is no authentication yet
(`CLAUDE.md`).

## 2. Versioning

Business routes live under `/v1/...`, like commerce-api, not under
`/api/v1`. `/health` is unversioned.

## 3. Routes

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `200 {"status":"ok"}` |
| POST | `/v1/agent/turns` | `200 {"reply": "...", "uiCommands"?: {...}}` (§3.1) |
| GET | `/docs`, `/redoc`, `/openapi.json` | Generated API docs. Served **only when `APP_ENV=development`**. Otherwise `404 ROUTE_NOT_FOUND`. |

### 3.1 `POST /v1/agent/turns`

One conversational turn. The service runs its LangGraph agent on the message
and returns the reply:

```text
START → call_model ──(tool calls, rounds left)──▶ execute_tools ──▶ call_model …
                   └─(otherwise)────────────────▶ finalize_reply → END
```

The model may call the Commerce tools in §3.2, which call commerce-api
(ADR-0021), and the presentation tools in §3.3, which return UI commands to
`apps/web` (ADR-0022).

Both bodies are defined once, in Zod, in `@contracts/ui-commands`
(`agentTurnRequestSchema`, `agentTurnResponseSchema`), with committed JSON
Schema in `packages/contracts/ui-commands/schema/agent-turn-*.v1.json`. This
service uses Pydantic models generated from that schema
(`ai_service/contracts/ui_commands.py`), and `apps/web` validates the same
definition. Nothing about the turn is hand-written on either side.

```jsonc
// Request
{ "message": "show me the desserts" }
// 200 response: the turn produced UI commands
{
  "reply": "Here's that category.",
  "uiCommands": {
    "contractVersion": 1,
    "correlationId": "turn-7f3a",            // this turn's X-Correlation-Id (§6)
    "issuedAt": "2026-09-26T12:00:00.000Z",  // ISO-8601 UTC, always ending in Z
    "commands": [{ "type": "ShowMenuCategory", "categoryId": "desserts" }]
  }
}
// 200 response: no UI commands. The key is omitted, never null.
{ "reply": "Sorry, that item is currently unavailable. Your cart hasn't changed." }
```

| Field | Rule |
| --- | --- |
| `message` | Required string, 1–2000 characters, with at least one non-whitespace character. Any other key is rejected. |
| `reply` | String, 1–4000 characters. Always present on a 200. Untrusted wording: `apps/web` shows it as text only. |
| `uiCommands` | Optional. Present only when the turn produced at least one UI command: a `UiCommandBatch` envelope with `contractVersion` 1, the turn's correlation id, an ISO-8601 UTC `Z` timestamp and 1–8 commands in the order the model asked for them (the contract allows 10; the per-turn tool-call limit caps it at 8). |

**The model is still simulated** (ADR-0020): there is no provider. Since
Phase 15 it is a deterministic keyword table (`llm/simulated.py`, ADR-0022),
ported from the stand-in `apps/web` used before it called this route:

| Message | Tool calls | Reply |
| --- | --- | --- |
| `show me the desserts`, `…starters…`, `…mains…` | `show_menu_category` | `Here's that category.` |
| `search for X`, `find X` | `search_menu` (`X`, cut to 200 characters) | `Here's what I found.` |
| `…details…` | `show_item_detail` (`tiramisu`) | `Here are the details.` |
| `…tiramisu…` | `highlight_item` (`tiramisu`) | `Highlighting that item.` |
| `…cart…` | `open_cart_panel` (`open: true`) | `Here's your cart.` |
| `add <item>` (also `add a …`, `… to my cart`) | `add_cart_item` (`<item>` as a slug, quantity 1), then `open_cart_panel` **only if** the add returned `"ok": true` | `Added it to your cart.`, or a fixed explanation per error code and no UI command |
| anything else | none | a fixed help text |

Its replies are fixed strings. It never repeats the customer's text and
never states a price. commerce-api decides whether an item exists.

- **Stateless.** Every turn is independent: there is no conversation id, no
  session and no memory. The request's `X-Correlation-Id` (§6) is the only
  link between turns. A `conversationId` will be added, as an optional
  field, by the phase that adds memory.
- **UI commands, never intents.** The response carries UI commands only.
  Business intents never leave this service (§3.4,
  `system-architecture.md` §4.4). UI commands are delivered only when the
  turn is over, after every cart change in it has resolved.
- **Commerce access goes through tools only** (§3.2). A reply's wording
  about prices or a cart is still not authoritative
  (`system-architecture.md` §4.3). What the customer's cart holds is what
  commerce-api returns.
- **`apps/web` calls this route** from its chat (Phase 15), through the
  proxy in §1. It validates the response again, applies each accepted UI
  command, and re-reads the cart from commerce-api after every turn,
  including a failed one.

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | The body fails the rules above. `field` is `message`, or the unknown key. |
| 405 | `METHOD_NOT_ALLOWED` | Any method but `POST`. |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 16 KB (§5.1). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The body is not `application/json` (§5.1). |
| 500 | `AGENT_FAILED` | The agent could not produce a reply: the model or a graph step failed, the result (reply or UI command batch) failed validation, the model was still asking for tools after the round limit, or one model message asked for more than 16 tool calls (§3.2). The body is always `{"code":"AGENT_FAILED","message":"The assistant could not process this message."}`, never `uiCommands`. Cart changes made by tools earlier in the turn stay applied: commerce-api is the truth, and `apps/web` re-reads the cart after every turn. |

A tool failure (commerce-api down, an unavailable item, a bad argument) is
**not** a turn failure. It goes back to the model as data (§3.2), and the turn
answers 200 with the model's explanation.

### 3.2 Tools (Phase 14)

The agent can call exactly these five tools, a fixed allowlist
(`tools/registry.py`). Each one validates strict arguments and makes one call
to one fixed commerce-api route through the Commerce API client
(`clients/commerce/`), which is the only code in this service that speaks
HTTP.

| Tool | Kind | Arguments | commerce-api route |
| --- | --- | --- | --- |
| `get_menu` | read | none | `GET /v1/menu` |
| `get_cart` | read | none | `GET /v1/cart` |
| `add_cart_item` | write | `itemId`, `quantity` (1–99) | `POST /v1/cart/items` |
| `set_cart_item_quantity` | write | `itemId`, `quantity` (1–99), an absolute set | `PATCH /v1/cart/items/{itemId}` |
| `remove_cart_item` | write | `itemId` | `DELETE /v1/cart/items/{itemId}` |

- **Arguments are strict.** Unknown keys are rejected, there is no type
  coercion, and `itemId` and `quantity` carry the contract's own constraints
  (generated from `packages/contracts/api-contracts`). No argument can name a
  URL, a route, an HTTP method, a header, a cart, an owner or a price.
- **No order tools.** Placing or reading an order is not available to the
  agent (ADR-0021). The prompt sends the customer to checkout.
- **commerce-api decides.** Nothing in this service checks availability,
  quantities or prices. Every success result is the commerce-api resource,
  validated against its generated contract model.
- **Limits per turn:** at most 4 model messages asking for tools, and at most
  8 tool calls. Calls past 8 get `TOOL_CALL_LIMIT_EXCEEDED` and do not run.
  A single model message asking for more than 16 calls (well-formed or not)
  is unusable output: nothing runs and the turn fails with `AGENT_FAILED`.
  LangGraph's recursion limit is 12. Calls in one model message run one at a
  time, in order.
- **No retries.** A write whose response never arrives returns
  `COMMERCE_OUTCOME_UNKNOWN`, and the prompt tells the model to call
  `get_cart` first: a cart add is not idempotent (`system-architecture.md`
  §8 gap 3).
- **Identity:** none is sent. commerce-api resolves the one cart on the
  server, the same cart `apps/web` shows (ADR-0015).
- The turn's `X-Correlation-Id` (§6) is sent to commerce-api, so both
  services' log lines for one turn share it.

A tool returns `{"ok": true, "data": <resource>}` or
`{"ok": false, "error": {"code", "message", "field"?}}` to the model, never an
HTTP response. The error codes:

| Code | Meaning |
| --- | --- |
| `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_UNAVAILABLE`, `CART_ITEM_NOT_FOUND`, `CART_ITEM_QUANTITY_LIMIT_EXCEEDED`, `CART_CONFLICT` | commerce-api's own codes, passed through unchanged. |
| `UNKNOWN_TOOL` | The model named a tool that is not in the allowlist. Nothing ran. |
| `INVALID_TOOL_ARGUMENTS` | The arguments failed the tool's schema (`field` names a declared parameter). Nothing reached commerce-api. |
| `TOOL_CALL_LIMIT_EXCEEDED` | Over 8 calls this turn. Not run. |
| `COMMERCE_UNAVAILABLE` | commerce-api could not be reached, timed out on a read, answered 5xx or 503, or has no such route (a wrong `COMMERCE_API_URL`). |
| `COMMERCE_OUTCOME_UNKNOWN` | A write was sent but no response arrived. It may have been applied. |
| `COMMERCE_REQUEST_REJECTED` | commerce-api refused the request as malformed, which points to contract drift. Logged as a warning. |
| `COMMERCE_BAD_RESPONSE` | commerce-api's response did not match the contract, could not be decoded, or was a redirect. Logged as a warning. |

Messages are fixed per code. commerce-api's own message text never reaches
the model.

### 3.3 Presentation tools (Phase 15)

A second allowlist (`ui_commands/registry.py`), separate from the Commerce
tools, with one tool per `@contracts/ui-commands` command. A presentation
tool does no I/O and changes no state. It validates its arguments and
records one UI command for the response.

| Tool | Arguments | UI command |
| --- | --- | --- |
| `show_menu_category` | `categoryId` (slug, 1–64) | `ShowMenuCategory` |
| `highlight_item` | `itemId` (slug, 1–64) | `HighlightItem` |
| `open_cart_panel` | `open` (boolean) | `OpenCartPanel` |
| `show_item_detail` | `itemId` (slug, 1–64) | `ShowItemDetail` |
| `search_menu` | `query` (0–200 characters) | `SearchMenu` |

- **Arguments are the command's fields without `type`**, taken from the
  generated model. They are strict: unknown keys are rejected and there is
  no coercion (`"true"` is not a boolean). No argument can name a URL,
  route, selector, component, script or price.
- **What the model reads** is `{"ok": true}`, or the §3.2 error shape with
  `INVALID_TOOL_ARGUMENTS`, `UNKNOWN_TOOL` or `TOOL_CALL_LIMIT_EXCEEDED`.
  The command itself travels beside the tool message (as its `artifact`),
  never in the model's context.
- **Not adopted:** `OpenCheckout` (a declined candidate) and
  `ShowOrderConfirmation` (rejected outright). No command can claim a cart
  change succeeded.
- **Limits:** presentation calls count toward the same 8 calls per turn as
  Commerce calls. A refused call records nothing.
- **No overlap:** a tool name registered in both lists stops the graph from
  being built.
- `ui_commands/` never imports the Commerce client or registry
  (`tests/test_boundaries.py`).

### 3.4 Business intents (Phase 15)

Each write tool performs exactly one `@contracts/agent-intents` intent,
through a fixed map in `tools/intents.py`:

| Tool | Intent | Route |
| --- | --- | --- |
| `add_cart_item` | `AddItemToCart` | `POST /v1/cart/items` |
| `set_cart_item_quantity` | `SetCartItemQuantity` | `PATCH /v1/cart/items/{itemId}` |
| `remove_cart_item` | `RemoveItemFromCart` | `DELETE /v1/cart/items/{itemId}` |

A write's arguments are validated as the tool's input, then as that
generated intent (`ai_service/contracts/agent_intents.py`, strict), and the
handler receives the intent. Reads perform no intent. The model picks a tool
from the allowlist; it can never name an intent, and no intent has a tool
unless it is in this map (`PlaceOrder` and `ClearCart` have none). Intent
envelopes (`idempotencyKey`, …) are still not sent: no commerce-api route
accepts one.

## 4. Response body

A successful response is the resource itself. An error response is always
exactly a `@contracts/common` `ContractError`:

```jsonc
{ "code": "INVALID_PAYLOAD", "message": "text: missing", "field": "text" }
```

`code` is the only field a caller may branch on. `field` is present only for
a validation failure, and is at most 64 characters. `message` is for humans
and never contains the rejected value, an exception's text or a stack trace.
Every error body is tested against the committed
`packages/contracts/common/schema/error.v1.json`.

## 5. Status codes and error codes

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | A request failed validation. This is 400, not FastAPI's default 422, to match commerce-api. `field` is the path inside the body (`text`), or `query.<name>` / `path.<name>` for other locations. There is no `field` when the body is not valid JSON. |
| 404 | `ROUTE_NOT_FOUND` | No route matches. |
| 405 | `METHOD_NOT_ALLOWED` | The route exists but not for this method. `Allow` is set. |
| other 4xx/5xx | `HTTP_ERROR` | Any other framework-level HTTP error, returned with its own status. The message is the standard status phrase, or `HTTP error.` for a non-standard code such as 499. |
| 413 | `PAYLOAD_TOO_LARGE` | The request body is over 16 KB (§5.1). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The request has a body that is not `application/json` (§5.1). |
| 500 | `AGENT_FAILED` | `POST /v1/agent/turns` only: the agent failed (§3.1). Only the exception's class name is logged, never its text or traceback. |
| 500 | `INTERNAL_ERROR` | Anything unexpected. The body is always `{"code":"INTERNAL_ERROR","message":"Internal server error."}`. The detail is logged server-side with the request id. |

### 5.1 Request bodies

The same rules as commerce-api (`commerce-api.md` §3). A request with a body
(`POST`, `PUT`, `PATCH` or `DELETE` with a non-zero `Content-Length` or any
`Transfer-Encoding`) must be `application/json` (a `charset` parameter is
fine), or it is rejected with 415 before anything reads it. A body over
16 KB (16,384 bytes) is rejected with 413, whether it declares its length or
streams without one. Both responses carry the correlation headers (§6).

Further service-specific codes (a commerce-api outage, a model timeout, a
resource not found) arrive with the phase that can raise them, as
`AiServiceError` subclasses carrying their own code. A route must not use a bare
`HTTPException(404)` for "resource not found", because that maps to
`ROUTE_NOT_FOUND`.

## 6. Headers

The rules are the same as commerce-api's (§7 there):

| Header | Direction | Rule |
| --- | --- | --- |
| `X-Request-Id` | Response, always | Always generated by the server (UUID4). An inbound value is ignored. |
| `X-Correlation-Id` | Request + response | An inbound value of 1–64 **visible ASCII** characters (`0x21`–`0x7E`) is echoed back. A missing or invalid value (including one with spaces, control characters or non-ASCII bytes) is replaced with a UUID4, never rejected. This is stricter than `@contracts/common`'s `correlationIdSchema`, because the value is echoed into a header (ADR-0019). |

Both are on **every** response, including 400, 404, 405 and 500. The 500
case is handled deliberately: the request-context middleware sends that
response itself, because Starlette's own 500 would bypass it.

## 7. Logging

One JSON object per line on stdout, with `timestamp`, `level`, `logger`,
`message`, and `request_id` / `correlation_id` for any line written during a
request. Each request adds exactly one `request completed` line with
`method`, `path` (no query string), `status` and `duration_ms`. Uvicorn's
access log is off. Headers, bodies, query strings and configuration values
are never logged. `LOG_FORMAT=pretty` is for local reading only.

Each agent turn adds one line from the `ai_service.agent` logger:

| Message | Level | Fields |
| --- | --- | --- |
| `agent turn completed` | INFO | `outcome: "ok"`, `duration_ms`, `message_chars`, `reply_chars`, `tool_calls`, `tool_rounds`, `ui_commands` (how many were returned) |
| `agent turn failed` | WARNING | `outcome: "failed"`, `duration_ms`, `message_chars`, `error_type` (the exception's class name) |

Each tool call adds one line from the `ai_service.tools` logger: `tool call
completed` or `tool call failed`, with `tool`, `category`
(`read`/`write`/`ui`), `intent` (a write's intent name, such as
`AddItemToCart`; otherwise `null`), `outcome`, `error_code`,
`commerce_status` (the HTTP status when a failed call got a response,
otherwise `null`) and `duration_ms`. Presentation tools write the same line,
with category `ui`. It is logged at WARNING for
`COMMERCE_REQUEST_REJECTED`, `COMMERCE_BAD_RESPONSE` and a missing route (a
wrong `COMMERCE_API_URL`), and at INFO otherwise. A tool name that is not
registered is logged as `<unregistered>`.

The customer's message, the reply, prompts, model output, tool arguments and
results, commerce-api's response bodies and messages, and an agent failure's
exception text and traceback are never logged (ADR-0019, ADR-0020, ADR-0021).
The HTTP-client loggers (`httpx`, `httpcore`, `httpx2`, `httpcore2`) are set
to `WARNING`, so no request URL is logged.

There is no LangSmith or other tracing. The service refuses to start if a
LangSmith/LangChain tracing variable is switched on (`.env.example`).

## 8. Health

`GET /health` checks liveness only: it answers if the process is up. It has
no dependency check, and it will never depend on a model provider or on
commerce-api. Since Phase 14 the service has a commerce-api client, but it
connects only when a tool runs. There is no readiness endpoint, because there is nothing to be
ready for yet (ADR-0019).

## 9. Not covered

A real model provider, conversation memory, business-intent envelopes,
order tools, retries, streaming (turns are one synchronous request,
ADR-0022), authentication, rate limiting and CORS.
