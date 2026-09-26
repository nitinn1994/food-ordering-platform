# ai-service HTTP API

**Status:** Phase 14. Routes: `GET /health` and `POST /v1/agent/turns`
(a LangGraph agent on a simulated model, with five Commerce API tools).
**Source of truth:** `apps/ai-service/ai_service/` (the app is wired in
`main.py`, errors in `core/errors.py`, body limits in
`core/request_limits.py`, the agent in `agents/`, the tools in `tools/`, the
Commerce API client in `clients/commerce/`). **Decisions:** ADR-0019,
ADR-0020, ADR-0021.

This service is deliberately built like commerce-api
([`commerce-api.md`](./commerce-api.md)). A caller sees the same error body,
the same correlation headers and the same health contract from both.

## 1. Style

JSON over HTTP. Listens on `127.0.0.1:3002` by default. There is no CORS: any
future browser access goes through `apps/web`'s same-origin proxy, as it
already does for commerce-api (ADR-0018). There is no authentication yet
(`CLAUDE.md`).

## 2. Versioning

Business routes live under `/v1/...`, like commerce-api, not under
`/api/v1`. `/health` is unversioned.

## 3. Routes

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `200 {"status":"ok"}` |
| POST | `/v1/agent/turns` | `200 {"reply": "..."}` (§3.1) |
| GET | `/docs`, `/redoc`, `/openapi.json` | Generated API docs. Served **only when `APP_ENV=development`**. Otherwise `404 ROUTE_NOT_FOUND`. |

### 3.1 `POST /v1/agent/turns`

One conversational turn. The service runs its LangGraph agent on the message
and returns the reply:

```text
START → call_model ──(tool calls, rounds left)──▶ execute_tools ──▶ call_model …
                   └─(otherwise)────────────────▶ finalize_reply → END
```

The model may call the tools in §3.2, which call commerce-api (ADR-0021).

**The model is still simulated.** There is no model provider yet
(ADR-0020), and the simulated model never calls a tool, so today the reply is
always the same fixed text and no turn calls commerce-api:

```jsonc
// Request
{ "message": "Hello" }
// 200 response
{ "reply": "Ordering by chat isn't available yet. You can browse the menu and add items to your cart directly." }
```

| Field | Rule |
| --- | --- |
| `message` | Required string, 1–2000 characters, with at least one non-whitespace character. Any other key is rejected. |
| `reply` | String. Always present on a 200. |

- **Stateless.** Every turn is independent: there is no conversation id, no
  session and no memory. The request's `X-Correlation-Id` (§6) is the only
  link between turns. A `conversationId` will be added, as an optional
  field, by the phase that adds memory.
- **Text only.** There is no `intent` or UI-command field yet. Both will be
  generated from `packages/contracts`, and added to the response
  additively, by the phases that produce them.
- **Commerce access goes through tools only** (§3.2). A reply's wording
  about prices or a cart is still not authoritative
  (`system-architecture.md` §4.3). What the customer's cart holds is what
  commerce-api returns.
- `apps/web` does not call this route yet.

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | The body fails the rules above. `field` is `message`, or the unknown key. |
| 405 | `METHOD_NOT_ALLOWED` | Any method but `POST`. |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 16 KB (§5.1). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The body is not `application/json` (§5.1). |
| 500 | `AGENT_FAILED` | The agent could not produce a reply: the model or a graph step failed, the result failed validation, the model was still asking for tools after the round limit, or one model message asked for more than 16 tool calls (§3.2). The body is always `{"code":"AGENT_FAILED","message":"The assistant could not process this message."}`. Cart changes made by tools earlier in the turn stay applied: commerce-api is the truth, and `apps/web` shows them on its next refresh. |

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
| `agent turn completed` | INFO | `outcome: "ok"`, `duration_ms`, `message_chars`, `reply_chars`, `tool_calls`, `tool_rounds` |
| `agent turn failed` | WARNING | `outcome: "failed"`, `duration_ms`, `message_chars`, `error_type` (the exception's class name) |

Each tool call adds one line from the `ai_service.tools` logger: `tool call
completed` or `tool call failed`, with `tool`, `category` (`read`/`write`),
`outcome`, `error_code`, `commerce_status` (the HTTP status when a failed
call got a response, otherwise `null`) and `duration_ms`. It is logged at WARNING for
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

A real model provider, conversation memory, business-intent envelopes, UI
commands, order tools, retries, streaming, authentication, rate limiting and
CORS.
