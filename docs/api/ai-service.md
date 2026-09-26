# ai-service HTTP API

**Status:** Phase 13. Routes: `GET /health` and `POST /v1/agent/turns`
(a LangGraph agent on a simulated model).
**Source of truth:** `apps/ai-service/ai_service/` (the app is wired in
`main.py`, errors in `core/errors.py`, body limits in
`core/request_limits.py`, the agent in `agents/`). **Decisions:** ADR-0019,
ADR-0020.

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

One conversational turn. The service runs its LangGraph agent
(`START → call_model → finalize_reply → END`) on the message and returns the
reply.

**Phase 13 runs on a simulated model.** There is no model provider yet
(ADR-0020), so the reply is always the same fixed text:

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
- **No commerce access.** The agent has no tools and does not call
  commerce-api in Phase 13, so it cannot read or change a cart or an order.
  Anything a reply says about prices or a cart is not authoritative
  (`system-architecture.md` §4.3).
- `apps/web` does not call this route yet.

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | The body fails the rules above. `field` is `message`, or the unknown key. |
| 405 | `METHOD_NOT_ALLOWED` | Any method but `POST`. |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 16 KB (§5.1). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The body is not `application/json` (§5.1). |
| 500 | `AGENT_FAILED` | The agent could not produce a reply (the model, a graph step, or the result failed validation). The body is always `{"code":"AGENT_FAILED","message":"The assistant could not process this message."}`. |

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
| `agent turn completed` | INFO | `outcome: "ok"`, `duration_ms`, `message_chars`, `reply_chars` |
| `agent turn failed` | WARNING | `outcome: "failed"`, `duration_ms`, `message_chars`, `error_type` (the exception's class name) |

The customer's message, the reply, prompts, model output, and an agent
failure's exception text and traceback are never logged (ADR-0019, ADR-0020).
The HTTP-client loggers (`httpx`, `httpcore`, `httpx2`, `httpcore2`) are set
to `WARNING`, so no request URL is logged.

There is no LangSmith or other tracing. The service refuses to start if a
LangSmith/LangChain tracing variable is switched on (`.env.example`).

## 8. Health

`GET /health` checks liveness only: it answers if the process is up. It has
no dependency check, and it will never depend on a model provider or on
commerce-api. There is no readiness endpoint, because there is nothing to be
ready for yet (ADR-0019).

## 9. Not covered

A real model provider, conversation memory, intents, UI commands, tools,
Commerce API calls, streaming, authentication, rate limiting and CORS.
