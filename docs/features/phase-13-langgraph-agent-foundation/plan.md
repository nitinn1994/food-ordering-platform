# Plan — Phase 13: LangGraph Agent Foundation

**Approval Status:** APPROVED (nitin, 2026-09-26; OD1–OD14 as recommended)
**Risk:** HIGH · **Path:** Full · **Requirements:** [`requirements.md`](./requirements.md)
· **Tests:** [`test-plan.md`](./test-plan.md)

## Approach

Add LangGraph to `apps/ai-service` in the shape ADR-0019 already reserved:
`ai_service/agents/` for orchestration and `ai_service/llm/` for the model,
beside `api/`. LangChain's `BaseChatModel` is the model boundary (ADR-0019
§4 names it as the expected abstraction). Phase 13 fills it with a
deterministic in-repo `SimulatedChatModel`, which keeps the project
simulation-first (CLAUDE.md) and the tests offline.

The graph is linear and minimal: `START → call_model → finalize_reply → END`.
An `AgentService` sits between the FastAPI route and the compiled graph, and
`create_app` constructs or accepts it (the ADR-0013/0019 "one factory"
pattern). The first body-accepting route brings the body limit and
content-type guard that ADR-0019 requires.

Everything follows Phase 12's rules:

- errors are `ContractError` bodies raised as `AiServiceError`
- logs are structured, carry no content, and keep correlation
- secrets are `SecretStr` (none are added)
- the boundary tests are widened in the same change as the dependency

---

## 1. Current Python AI service architecture (as inspected)

| Aspect | Finding | Source |
| --- | --- | --- |
| Python | 3.12, pinned (`.python-version`, `requires-python = ">=3.12,<3.13"`) | `pyproject.toml` |
| Dependency manager | uv 0.12.19, PEP 621, committed `uv.lock`, `[tool.uv] package = false` | ADR-0019 §1 |
| Runtime deps | `fastapi`, `pydantic`, `uvicorn` (`>=` lower bounds only, exact pins in `uv.lock`) | `pyproject.toml` |
| Dev deps | `httpx`, `jsonschema`, `mypy`, `pytest`, `ruff` | `pyproject.toml` |
| Layout | `ai_service/{__main__,main,config}.py`, `api/` (routes only), `core/` (errors, logging, request context), `schemas/` (HTTP models only) | README "Layout" |
| App wiring | `create_app(settings, extra_routers=())` is the single place HTTP behaviour is wired; nothing is registered at import time | `main.py` |
| Config | frozen Pydantic `Settings` over `os.environ`, 5 variables, validated before uvicorn starts; `ConfigError` names variables, never values | `config.py` |
| Errors | `AiServiceError(code, message, status_code)` → `ContractError` body; 400 `INVALID_PAYLOAD` (not 422), 404/405/`HTTP_ERROR`; last-resort 500 sent by the request-context middleware | `core/errors.py`, `core/request_context.py` |
| Logging | stdlib + `JsonFormatter`; `request_id`/`correlation_id` via contextvars; `extra={"fields": {...}}`; one `request completed` line per request | `core/logging.py` |
| Versioning | business routes under `/v1/...` (**not** `/api/v1`), `/health` unversioned | `docs/api/ai-service.md` §2 |
| Tests | pytest; `conftest.py` builds `Settings(app_env="test")` directly and apps via `create_app`; test-only routes in `tests/fixtures_routes.py`; error bodies validated against `packages/contracts/common/schema/error.v1.json` | `tests/` |
| Boundary guard | `test_boundaries.py`: dependency allowlists, AST import scan (forbids `langchain*`, `langgraph*`, `langsmith`, provider SDKs, DB drivers, HTTP clients), no credential-like setting names | `tests/test_boundaries.py` |
| Contracts | `agent-intents` (3 intents, enveloped with `idempotencyKey`), `ui-commands` (5 commands, batched). TypeScript/Zod with committed JSON Schema; **no Pydantic codegen yet** (deferred to the first phase that consumes a family) | `docs/api/contracts.md`, ADR-0019 §5 |
| Web | chat still driven by `apps/web/src/lib/commands/simulate.ts`; web does not call ai-service | `getting-started.md` |

**Rules ADR-0019 set for this phase**, quoted in short and all adopted:

- Provider SDKs are imported only under `ai_service/llm/`.
- Prompts, completions and customer utterances are never logged.
- Internal validation must not leak input into logs. The first phase that
  parses customer utterances adds a sentinel test (S2).
- When `httpx` becomes a runtime dependency, raise the `httpx`/`httpcore`
  loggers to `WARNING`.
- The first route that accepts a body adds a body-size limit and a JSON
  content-type guard.
- Liveness never depends on a model provider.
- Provider configuration arrives with the first provider (§10 of the Phase 12
  plan).

## 2. LangGraph dependency strategy

Queried from PyPI on 2026-09-26:

| Package | Latest | Required by | Brings |
| --- | --- | --- | --- |
| `langgraph` | 1.2.12 | us | `langchain-core>=1.4.7,<2`, `langgraph-checkpoint`, `langgraph-prebuilt`, `langgraph-sdk`, `pydantic`, `xxhash` |
| `langchain-core` | 1.6.5 | `langgraph` (**mandatory**) and us | `langsmith>=0.3.45` (**mandatory**), `httpx`, `jsonpatch`, `pyyaml`, `tenacity`, `packaging`, `uuid-utils`, `langchain-protocol` |
| `langsmith` | 0.14.1 | `langchain-core` (mandatory) | `requests`, `httpx2`, `orjson`, `websockets`, `zstandard`, … |

Conclusions:

- **LangChain core cannot be avoided.** `langgraph` depends on it. We also
  import it directly (`BaseChatModel`, `AIMessage`, `HumanMessage`), so it
  is declared as a **direct** dependency, not left transitive.
- **Nothing else is added:** no `langchain` (the full package), no
  `langchain-community`, no `langchain-openai` or `langchain-anthropic`, no
  provider SDK.
- **`langsmith` is installed transitively and cannot be excluded.** It sends
  traces only when tracing is switched on by environment variable. That
  would send customer messages to an external service without approval. See
  §17 for the tracing guard, OD7.
- `langgraph-prebuilt`, `langgraph-checkpoint` and `langgraph-sdk` are
  installed transitively. Importing them is forbidden by the boundary test
  (§18).
- **Versions (OD12):** add with `uv add langgraph langchain-core`. This
  follows the existing `>=` lower-bound convention, with exact versions in
  `uv.lock`. The expected result is `langgraph>=1.2.12` and
  `langchain-core>=1.6.5`.

## 3. Agent architecture

```text
HTTP  POST /v1/agent/turns
  │   api/agent.py          parse AgentTurnRequest, call service, map result
  ▼
AgentService                agents/service.py
  │   input mapping, invoke, output mapping, error translation, turn logging
  ▼
CompiledStateGraph          agents/graph.py   (built once per app, no checkpointer)
  │   START → call_model → finalize_reply → END
  ▼
BaseChatModel               llm/  (SimulatedChatModel in Phase 13)
```

Dependency direction is strictly downward. `api/` imports nothing from
LangGraph or LangChain (enforced, §18). `agents/` never imports FastAPI.
`llm/` imports neither `agents/` nor FastAPI.

## 4. Agent state design

```python
class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]  # this turn only
    reply: NotRequired[str]                              # set by finalize_reply
```

- **Conversation state (allowed):** the messages of the turn being processed,
  and the reply produced from them. In Phase 13 a turn starts with exactly
  one `HumanMessage`, because there is no memory.
- **Business state (forbidden):** cart contents, prices, totals, order status
  and availability are commerce-api's (`system-architecture.md` §4.2). They
  never appear as state keys. A later tool may put a commerce-api response
  into a `ToolMessage` for the model to read. That is context, not
  authoritative state, and it is never read back as truth.
- **Not added:** a session or conversation id (OD4), metadata, intent (OD5),
  a step counter or an error field (errors propagate as exceptions, §13).
- **Guard:** a test pins `AgentState.__annotations__` to exactly
  `{"messages", "reply"}`. Adding a key means changing that test in a
  reviewed diff.

## 5. Graph topology

```text
START ──► call_model ──► finalize_reply ──► END
```

- Built by `build_agent_graph(model: BaseChatModel) -> CompiledStateGraph`, a
  pure function. It is compiled with no checkpointer and no interrupts.
- Two nodes, not one or three (OD6):
  - `call_model` is the only node that touches the model.
  - `finalize_reply` is the validation step between free-form model output
    and a typed result. It is where structured output will be validated
    later.
  - A separate "receive input" node would only copy the request into state,
    which the service's input mapping already does.

## 6. Node responsibilities

| Node | Reads | Writes | Behaviour |
| --- | --- | --- | --- |
| `call_model` | `messages` | `messages` (+1 `AIMessage`) | `await model.ainvoke(state["messages"])`; returns `{"messages": [ai_message]}`. No prompt is prepended (none exists yet). The model is bound through a closure (`make_call_model(model)`), not read from a global. |
| `finalize_reply` | `messages` | `reply` | Takes the last message. Raises `AgentOutputError` unless it is an `AIMessage` with non-empty `str` content and no `tool_calls`. Returns `{"reply": content}`. |

Nodes are plain async and sync functions, testable without compiling a
graph. They do not log. Turn-level logging lives in the service (§14).

## 7. Edge and routing strategy

Static edges only. There are **no conditional edges**, because Phase 13 has
no decision to make: there are no tools to route to and no loop to exit. The
first routing arrives with tools (Phase 14+), most likely as a
`call_model → tools → call_model` loop gated by a condition function.

- `recursion_limit` is passed explicitly on every invocation
  (`RECURSION_LIMIT = 5`; the linear graph needs 2 steps). A future
  accidental loop then fails fast as `GraphRecursionError` → `AGENT_FAILED`,
  instead of running to LangGraph's default of 25.
- A test pins the exact node and edge set (§15).

## 8. Agent service boundary

`agents/service.py`:

```python
class AgentResult(BaseModel):            # frozen, extra="forbid"
    reply: Annotated[str, Field(min_length=1, max_length=MAX_REPLY_LENGTH)]

class AgentService:
    def __init__(self, graph: CompiledStateGraph) -> None: ...
    async def run_turn(self, message: str) -> AgentResult: ...
```

`run_turn`:

1. **Input mapping:** `{"messages": [HumanMessage(content=message)]}`.
2. **Invocation:** `await graph.ainvoke(state, config={"recursion_limit": RECURSION_LIMIT})`.
3. **Output mapping:** `AgentResult(reply=final_state["reply"])`. A
   `ValidationError` here is caught, never logged with input (S2), and
   becomes `AGENT_FAILED`.
4. **Error translation and logging** (§13, §14).

The service owns no HTTP concepts. The route owns no graph concepts.
`AgentResult` is the internal typed result, and `AgentTurnResponse` is its
wire form. They are kept separate so the graph's types never reach the API
schema.

## 9. API endpoint design (OD1)

`POST /v1/agent/turns`. It follows the repository's `/v1` convention, not the
brief's `/api/v1`. The resource is a *turn*, the unit
`@contracts/common`'s `correlationId` already groups.

Request (`schemas/agent.py`, `extra="forbid"`, camelCase wire names):

```json
{ "message": "Hello" }
```

`message`: string, 1–2000 characters, containing at least one non-whitespace
character (OD9).

Response `200`:

```json
{ "reply": "Ordering by chat isn't available yet. You can browse the menu and add items to your cart directly." }
```

| Status | Code | When |
| --- | --- | --- |
| 200 | — | Turn completed |
| 400 | `INVALID_PAYLOAD` | Body fails validation (existing handler; value never echoed) |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 16 KB (§13, OD10) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body present, `Content-Type` not `application/json` |
| 405 | `METHOD_NOT_ALLOWED` | e.g. `GET /v1/agent/turns` |
| 500 | `AGENT_FAILED` | Graph, node or model failure |
| 500 | `INTERNAL_ERROR` | Anything outside the agent (existing last resort) |

Why expose it now (OD1): the brief's API-level tests need a route. The route
also makes the body limit, content-type guard and utterance-safe logging real
now, rather than in the first tools phase. The simulated reply is honest: it
says chat ordering is unavailable, and it never claims to have changed a
cart. `apps/web` does not call the route in Phase 13.

## 10. Model-provider boundary (OD2, OD3)

- **Interface:** `langchain_core.language_models.BaseChatModel`, used through
  `ainvoke(list[BaseMessage]) -> AIMessage`. There is no hand-written
  `ModelProvider` protocol. ADR-0019 §4 rejected one because it would
  duplicate or fight LangChain's.
- **Implementation:** `llm/simulated.py: SimulatedChatModel(BaseChatModel)`.
  It is deterministic: `_generate` always returns one `AIMessage` with the
  fixed `SIMULATED_REPLY`, whatever the input. It never echoes the user's
  text. It makes no network call, holds no state, and has
  `_llm_type = "simulated"`.
- **Selection:** `llm/__init__.py: build_chat_model() -> BaseChatModel`
  returns `SimulatedChatModel()`. This is the single seam the provider phase
  replaces, for example with `init_chat_model(settings.ai_model, …)`, and it
  gains a `Settings` parameter then.
- **Not built:** provider config, keys, multi-provider routing, fallback,
  retries, timeouts, evaluation (brief §9; ADR-0019 §10).

## 11. Structured output strategy (OD5)

- **Now:** typed at every boundary. `AgentState` is a TypedDict,
  `finalize_reply` validates the model message, `AgentResult` is a frozen
  Pydantic model, and `AgentTurnResponse` is the wire model. The only field
  is `reply`.
- **Not now: `intent`.** `@contracts/agent-intents` already defines the
  intent vocabulary (3 intents plus an envelope). A Python intent model
  must be **generated** from `agent-intent.v1.json` (ADR-0003). ADR-0019
  explicitly forbids widening the hand-written exception. Adding
  `intent: null` now would force either a duplicate definition or the
  codegen pipeline, and both belong to the phase that first emits intents.
- **Future extension:** `finalize_reply` becomes the place where model output
  is parsed against the generated intent and UI-command models (for example
  via `model.with_structured_output(...)` in `call_model`, validated in
  `finalize_reply`). `AgentResult` gains `intent` and `ui_commands`, and
  `AgentTurnResponse` gains the matching wire fields, all additively.

## 12. Session and conversation strategy (OD4)

**Stateless, request-scoped execution.** Every turn is independent. There is
no conversation id, session id, checkpointer or memory.

- An id the service cannot honour would be a field that lies. Clients would
  reasonably expect it to carry context.
- Correlation already exists: `X-Correlation-Id` is echoed and attached to
  every log line.
- **Future extension:** the memory phase adds an optional `conversationId`
  (additive), maps it to LangGraph's `thread_id`, and compiles the graph with
  a checkpointer. No Redis, database or vector memory is added now.

## 13. Error handling

| Failure | Where caught | Result | Logged |
| --- | --- | --- | --- |
| Invalid body (shape, bounds, unknown key, bad JSON) | existing `RequestValidationError` handler | 400 `INVALID_PAYLOAD` | request line only |
| Body > 16 KB | new `core/request_limits.py` middleware | 413 `PAYLOAD_TOO_LARGE` | request line only |
| Non-JSON content type with a body | same middleware | 415 `UNSUPPORTED_MEDIA_TYPE` | request line only |
| Model raises | `AgentService.run_turn` | 500 `AGENT_FAILED` | `agent turn failed`, `error_type` only |
| Node raises (incl. `AgentOutputError`, `GraphRecursionError`) | `AgentService.run_turn` | 500 `AGENT_FAILED` | same |
| Result validation (`AgentResult`) fails | `AgentService.run_turn` | 500 `AGENT_FAILED` | same |
| Configuration invalid / tracing enabled | `load_settings` (startup) | exit 1, variable named | stderr, no value |
| Downstream (commerce-api) | n/a: no downstream calls in Phase 13 | codes arrive with the client phase | — |
| `asyncio.CancelledError` | not caught (it is a `BaseException`) | client disconnect / shutdown proceeds | — |
| Anything else | existing request-context middleware | 500 `INTERNAL_ERROR` | traceback (existing behaviour) |

- `AgentTurnFailedError(AiServiceError)`: code `AGENT_FAILED`, status 500,
  message `"The assistant could not process this message."`, raised
  `from None` so the chain does not carry the original.
- **No traceback is logged for agent failures (OD8).** Node and model
  exceptions can carry the customer's message or model output in their text
  or locals. A Pydantic `ValidationError` always does (S2). Only
  `type(exc).__name__` is logged. The cost is that debugging needs a local
  reproduction. The failure path is covered by tests.
- Body limit and content type are implemented as a pure ASGI middleware, the
  same style as `RequestContextMiddleware`. It is added *before* it in
  `create_app`, so it runs inside it and its responses get correlation
  headers. It uses commerce-api's 16 KB, its codes, and its "reject by
  `Content-Length`, and count streamed bytes too" behaviour. New codes are
  `PAYLOAD_TOO_LARGE` and `UNSUPPORTED_MEDIA_TYPE` in `core/errors.py`, the
  same names as commerce-api's.
- Never returned: exception text, stack traces, prompts, model output on
  failure, graph state, configuration and keys.

## 14. Logging

- **Turn line (service):** logger `ai_service.agent`.
  - Success: `agent turn completed` with
    `{outcome: "ok", duration_ms, message_chars, reply_chars}`.
  - Failure: `agent turn failed` at `WARNING` with
    `{outcome: "failed", duration_ms, message_chars, error_type}`.
  - `request_id` and `correlation_id` are attached automatically by the
    existing `ContextFilter`. The existing `request completed` line is
    unchanged.
- **Not logged:** message text, reply text, model messages, graph state,
  prompts (ADR-0019). Lengths are metadata, not content.
- **No per-node logging** in Phase 13. Two deterministic nodes would add
  noise and no information. The extension point is LangGraph's callback and
  `astream_events` hooks, added when routing makes the node path
  interesting.
- **`httpx`/`httpcore` loggers are raised to `WARNING`** in
  `configure_logging` (OD11). `httpx` is now a runtime dependency (through
  `langchain-core`/`langsmith`), and the ADR-0019 rule is triggered by it
  being present, not by our using it.
- No LangSmith and no observability platform. Tracing is refused at startup
  (§17).

## 15. Testing strategy

All tests are deterministic and offline. None needs a key or a network. The
model boundary uses `SimulatedChatModel`, or small fakes in `tests/fakes.py`
(a `BaseChatModel` subclass that raises, and one that returns empty,
non-text or tool-call output). Detail is in `test-plan.md`.

| Level | What |
| --- | --- |
| Graph construction | builds and compiles; exact node set; exact edge set; no conditional edges; no checkpointer |
| State | key allowlist; `add_messages` appends (input 1 msg → output 2 msgs); `reply` set only by `finalize_reply` |
| Nodes | `call_model` with simulated and fake models; `finalize_reply` happy path and each rejection |
| Routing | N/A. There is no routing; the edge-set test proves it stays linear. |
| Agent service | input → graph → `AgentResult`; each failure → `AgentTurnFailedError`; `CancelledError` propagates; recursion limit passed; log lines and fields; sentinel absent |
| API | 200 path; 400 cases; 413; 415; 405; 500 `AGENT_FAILED`; contract-schema validation of every error; correlation headers; sentinel absent from body and logs; `/health` unaffected |
| Boundaries | dependency allowlist; location-scoped import rules; new forbidden modules; matcher unit tests |
| Config | tracing env vars rejected (truthy), accepted (unset or falsy), value never printed |

## 16. Dependency injection

- **Model:** passed to `build_agent_graph(model)`, and bound into
  `call_model` by a closure.
- **Graph:** passed to `AgentService(graph)`.
- **Service:** `create_app(settings, extra_routers=(), agent_service=None)`.
  When it is `None`, `create_app` builds
  `AgentService(build_agent_graph(build_chat_model()))`. The service is
  stored on `app.state.agent_service`, and read by the route through a small
  `Depends(get_agent_service)` in `api/agent.py`.
- **Configuration:** `Settings` stays on `app.state.settings` as today. The
  agent reads no settings in Phase 13.
- **External clients:** none. The Commerce API client will be injected the
  same way later, into the graph builder, not imported by nodes.
- No module-level graph, model or service. Every app instance builds its
  own, so tests never share state. The compiled graph and the simulated model
  are stateless, so one instance per app is safe across concurrent requests.

## 17. Configuration changes

- **No new `Settings` fields** (ADR-0019 §10: provider config arrives with
  the provider).
- **Tracing guard (OD7):** `load_settings` also rejects a truthy
  `LANGSMITH_TRACING` or `LANGCHAIN_TRACING_V2` (`true`, `1`, `yes`, `on`,
  case-insensitive). It raises `ConfigError`, naming the variable and
  `(tracing_not_allowed)`. The variables are read by name only and never
  stored in `Settings`. This fails closed: an inherited shell variable cannot
  silently send customer messages to LangSmith.
- `.env.example`: the "deliberately absent" comment is updated. It records
  that provider settings are still absent and that tracing variables are
  refused.

## 18. Files to create

| File | Purpose |
| --- | --- |
| `apps/ai-service/ai_service/llm/__init__.py` | `build_chat_model()`; package docstring: the only place provider code may live |
| `apps/ai-service/ai_service/llm/simulated.py` | `SimulatedChatModel`, `SIMULATED_REPLY` |
| `apps/ai-service/ai_service/agents/__init__.py` | package docstring: orchestration only; no FastAPI, no commerce state |
| `apps/ai-service/ai_service/agents/state.py` | `AgentState` + the conversation-vs-business rule in its docstring |
| `apps/ai-service/ai_service/agents/nodes.py` | `make_call_model(model)`, `finalize_reply`, `AgentOutputError` |
| `apps/ai-service/ai_service/agents/graph.py` | `build_agent_graph(model)`, node-name constants, `RECURSION_LIMIT` |
| `apps/ai-service/ai_service/agents/service.py` | `AgentService`, `AgentResult`, `MAX_REPLY_LENGTH` |
| `apps/ai-service/ai_service/agents/errors.py` | `AgentTurnFailedError` (`AGENT_FAILED`) |
| `apps/ai-service/ai_service/api/agent.py` | `POST /v1/agent/turns`, `get_agent_service` |
| `apps/ai-service/ai_service/schemas/agent.py` | `AgentTurnRequest`, `AgentTurnResponse`, `MAX_MESSAGE_LENGTH` |
| `apps/ai-service/ai_service/core/request_limits.py` | 16 KB body limit + JSON content-type guard (ASGI middleware) |
| `apps/ai-service/tests/fakes.py` | failing / malformed fake chat models (test-only) |
| `apps/ai-service/tests/test_simulated_model.py` | simulated model |
| `apps/ai-service/tests/test_agent_state.py` | state allowlist + reducer |
| `apps/ai-service/tests/test_agent_nodes.py` | nodes |
| `apps/ai-service/tests/test_agent_graph.py` | construction + topology + invocation |
| `apps/ai-service/tests/test_agent_service.py` | service mapping, errors, logging |
| `apps/ai-service/tests/test_agent_api.py` | route |
| `apps/ai-service/tests/test_request_limits.py` | 413 / 415 |

**Boundary rules added to `test_boundaries.py`** (the matcher is extended
from top-level-only to dotted-prefix matching):

- `langgraph*` is allowed only under `ai_service/agents/`.
- `langchain_core*` is allowed only under `ai_service/agents/` and
  `ai_service/llm/`.
- These are forbidden everywhere: `langchain`, `langchain_community`,
  `langchain_openai`, `langchain_anthropic` (plus a `langchain_` prefix rule
  that excludes `langchain_core`), `langsmith`, `langgraph.prebuilt`,
  `langgraph.checkpoint`, `langgraph_sdk`, `langchain_core.tools`, and the
  existing provider, database and HTTP entries.

## 19. Files to modify

| File | Change |
| --- | --- |
| `apps/ai-service/pyproject.toml` | add `langgraph`, `langchain-core` (via `uv add`); description string updated |
| `apps/ai-service/uv.lock` | regenerated by `uv add` |
| `apps/ai-service/ai_service/main.py` | `agent_service` parameter; build default service; add request-limits middleware (inside request context) |
| `apps/ai-service/ai_service/api/__init__.py` | include `agent.router` |
| `apps/ai-service/ai_service/core/errors.py` | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` constants; docstring mapping table |
| `apps/ai-service/ai_service/core/logging.py` | `httpx`, `httpcore` loggers → `WARNING` |
| `apps/ai-service/ai_service/config.py` | tracing guard in `load_settings` |
| `apps/ai-service/ai_service/__init__.py` | docstring (no longer "no AI behaviour") |
| `apps/ai-service/tests/test_boundaries.py` | allowlists, location rules, new forbidden modules, matcher tests |
| `apps/ai-service/tests/test_config.py` | tracing guard tests |
| `apps/ai-service/tests/test_logging.py` | httpx/httpcore level test |
| `apps/ai-service/tests/test_errors.py` | add 413/415/`AGENT_FAILED` rows to the contract-schema parametrisation |
| `apps/ai-service/tests/conftest.py` | `agent_client` fixture factory (app with an injected `AgentService`) |
| `apps/ai-service/.env.example` | comment on absent provider settings / refused tracing vars |
| `apps/ai-service/README.md` | status, boundaries, layout (`agents/`, `llm/`) |
| `docs/api/ai-service.md` | route, request/response, errors, limits, logging |
| `docs/development/getting-started.md` | Phase 13 status, test count, "next phase" paragraph |
| `docs/architecture/system-architecture.md` | §1 stack row (LangGraph in use, provider still simulated) |
| `docs/architecture/architecture-decisions.md` | ADR-0020 |

Not modified: `apps/web`, `apps/commerce-api`, `packages/contracts`,
`infrastructure/`.

## 20. Dependencies to add

| Package | Kind | Constraint (expected from `uv add`) | Why |
| --- | --- | --- | --- |
| `langgraph` | runtime, direct | `>=1.2.12` | orchestration |
| `langchain-core` | runtime, direct | `>=1.6.5` | `BaseChatModel`, messages; imported directly, already required by `langgraph` |

Transitive (installed, import-forbidden): `langgraph-checkpoint`,
`langgraph-prebuilt`, `langgraph-sdk`, `langsmith`, `httpx`, `requests`,
`orjson`, `ormsgpack`, `xxhash`, `websockets`, … No dev dependency changes.

## 21. Acceptance criteria

AC1–AC15 in [`requirements.md`](./requirements.md#acceptance-criteria).

## 22. Validation commands

From `apps/ai-service/`. These are the commands declared in the README and
`getting-started.md`. There is no CI.

| Check | Command |
| --- | --- |
| install | `uv sync` |
| test | `uv run pytest` |
| lint | `uv run ruff check .` |
| format | `uv run ruff format --check .` |
| types | `uv run mypy` |
| manual run | `uv run python -m ai_service`, then `POST /v1/agent/turns` |

Targeted runs between sub-phases (named test files) are reported as
targeted. The full set runs before `/review`.

## 23. Risks

| Risk | Impact | How it is handled |
| --- | --- | --- |
| `langsmith` (mandatory transitive) sends messages off-machine if tracing env vars are set | customer data leaves the machine, unapproved | startup refuses truthy tracing vars (AC3); `langsmith` import forbidden; review checks no other egress path |
| Large transitive tree (~20 packages, incl. `requests`, `httpx`, `websockets`) | supply-chain surface; bigger lock diff | only two direct deps; import-forbidden in service code; lock diff reviewed |
| An exception carrying the utterance reaches a log (S2) | PII in logs | service catches all graph exceptions, logs class name only; sentinel tests on success and failure paths |
| mypy strict friction with LangGraph generics (`CompiledStateGraph[...]`, TypedDict state) | type errors or `Any` leaks | both packages ship `py.typed`, to be confirmed at 13.1; any `type: ignore` must be narrow and justified in review, no blanket override |
| LangGraph API drift (1.x minor releases) | build breaks on re-lock | `uv.lock` pins; only core APIs used (`StateGraph`, `START`, `END`, `add_messages`) |
| Body-limit middleware breaks existing tests or routes | regressions | applies only to requests with a body; existing suite must stay green; tested for `/health` and test routes |
| The simulated route is mistaken for a real conversation API | expectation mismatch | fixed honest reply; docs say simulated; web not wired |
| Logging and state rules erode in later phases | boundary decay | state-key allowlist test, location-scoped import tests, recorded in ADR-0020 |
| Scope creep toward tools or intents | phase grows | out-of-scope list; `langchain_core.tools` and `langgraph.prebuilt` import-forbidden |

**Specialised review (Full Path):**

- **Security: yes.** This adds a new untrusted-input route, a telemetry
  dependency, and a logging redaction path. Written as
  `security-review.md`, as in Phase 12.
- **Performance: no.** Nothing is persisted and the model is local and
  instant. The only relevant limit is the body size.
- **Data or migration: no.** There is no persistence.

## 24. Open decisions (each with a recommendation)

Approving the plan as written approves every recommendation.

| # | Decision | Recommendation | Alternative(s) |
| --- | --- | --- | --- |
| OD1 | Expose an HTTP route in Phase 13? | **Yes, `POST /v1/agent/turns`**, backed by the simulated model; web not wired | No route: graph and service tested in-process only; the route and body limit arrive with the first tools phase |
| OD2 | Model interface | **LangChain `BaseChatModel`** (ADR-0019 §4) | Own `ChatModel` Protocol wrapping it |
| OD3 | Model in Phase 13 | **Deterministic `SimulatedChatModel`, no provider, no provider config** | A real provider behind `AI_PROVIDER`/`AI_MODEL`/`SecretStr` key (conflicts with CLAUDE.md's "no real AI model integration" initial scope) |
| OD4 | Conversation identity | **Stateless; no `conversationId` field**; correlation via `X-Correlation-Id` | Optional `conversationId` accepted and ignored until memory exists |
| OD5 | Response shape | **`{"reply": string}` only** | `{reply, intent: null, metadata}` (needs codegen or a duplicate intent model) |
| OD6 | Topology | **Two nodes: `call_model` → `finalize_reply`** | One node (validation inside `call_model`); three nodes (+ `receive_input`) |
| OD7 | LangSmith tracing | **Fail at startup if a tracing var is truthy** | Force-disable silently at startup; document only |
| OD8 | Agent failure mapping | **500 `AGENT_FAILED`, log `error_type` only, no traceback** | Let it reach the last-resort 500 `INTERNAL_ERROR` (logs a traceback that may contain the utterance) |
| OD9 | `message` bounds | **1–2000 chars, not whitespace-only** | 4000 chars; no whitespace rule |
| OD10 | Request limits | **App-wide 16 KB + JSON content-type guard, commerce-api's codes** | Route-local limit only |
| OD11 | `httpx`/`httpcore` loggers | **Raise to `WARNING` now** | Wait until the Commerce API client phase |
| OD12 | Version constraints | **`>=` lower bounds (repo convention) + `uv.lock`** | Add `<2` upper caps on both |
| OD13 | Risk and path | **HIGH / Full** (security + architectural scope) | MEDIUM / Standard (no security review) |
| OD14 | Simulated reply text | **"Ordering by chat isn't available yet. You can browse the menu and add items to your cart directly."** | Any fixed text that claims no action |

**Decisions already established (not re-opened):**

- uv, Python 3.12 and the layout (ADR-0019)
- `/v1` versioning and `ContractError` bodies with 400 for validation
- `AiServiceError` as the error base
- the logging redaction rules and the S2 test requirement
- provider code only under `llm/`, and provider config only with a real
  provider
- `/health` independent of the agent
- the AI service never touches the database or mutates commerce state
- intents and UI commands come from `packages/contracts`, generated, never
  duplicated

## 25. Implementation order

Each sub-phase ends green (targeted tests plus ruff and mypy) before the
next starts.

### 13.1 — Dependencies and guards

- [ ] `uv add langgraph langchain-core`, and confirm `py.typed` in both.
- [ ] `test_boundaries.py`: allowlists, dotted-prefix matcher, location-scoped
      rules, new forbidden modules. Show each new rule failing once (manual
      negative check, recorded).
- [ ] Tracing guard in `config.py`, plus tests.
- [ ] `httpx`/`httpcore` log levels, plus a test.
- **Done when:** the full existing suite and the new guard tests pass, and
  `uv sync` is clean.

### 13.2 — Model boundary, state, nodes, graph

- [ ] `llm/simulated.py` and `llm/__init__.py`, plus tests.
- [ ] `agents/state.py`, `agents/nodes.py`, `agents/graph.py`, plus
      `tests/fakes.py`, and state, node and graph tests.
- **Done when:** the graph compiles and its topology is pinned, each node is
  tested alone, and mypy strict is clean.

### 13.3 — Agent service

- [ ] `agents/service.py` and `agents/errors.py`, plus service tests
      (mapping, each failure, cancellation, recursion limit, log lines,
      sentinel).
- **Done when:** AC6, AC7 and AC11 (service part) pass.

### 13.4 — HTTP route and request limits

- [ ] `core/request_limits.py`, `schemas/agent.py` and `api/agent.py`.
- [ ] `create_app` injection, the `conftest.py` fixture, and the new
      `test_errors.py` rows.
- [ ] API and limits tests.
- [ ] A manual run with `curl`.
- **Done when:** AC8–AC13 pass, and the full `pytest`, `ruff check`,
  `ruff format --check` and `mypy` pass.

### 13.5 — Documentation

- [ ] `docs/api/ai-service.md`, README, `.env.example`,
      `getting-started.md`, `system-architecture.md` §1.
- [ ] ADR-0020.
- **Done when:** AC15 is met, and no doc still says the service has "no AI
  behaviour" or "no body-accepting route".

Then `/validate` → `/review` → security review → `/final-review`. Nothing
is committed without an explicit request.

## 26. Expected directory structure

```text
apps/ai-service/
  ai_service/
    __init__.py
    __main__.py
    main.py                 create_app(settings, extra_routers, agent_service)
    config.py               + tracing guard
    api/
      __init__.py           + agent router
      health.py
      agent.py              NEW  POST /v1/agent/turns
    agents/                 NEW  orchestration (only place langgraph is imported)
      __init__.py
      state.py
      nodes.py
      graph.py
      service.py
      errors.py
    llm/                    NEW  model boundary (only place providers may live)
      __init__.py           build_chat_model()
      simulated.py
    core/
      errors.py             + PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE
      logging.py            + httpx/httpcore → WARNING
      request_context.py
      request_limits.py     NEW
    schemas/
      agent.py              NEW
      errors.py
      health.py
  tests/
    fakes.py                NEW
    test_simulated_model.py NEW
    test_agent_state.py     NEW
    test_agent_nodes.py     NEW
    test_agent_graph.py     NEW
    test_agent_service.py   NEW
    test_agent_api.py       NEW
    test_request_limits.py  NEW
    (existing files; boundaries/config/logging/errors/conftest modified)
```

---

## Assumptions

| Assumption | Verified? |
| --- | --- |
| `langgraph` 1.2.12 requires `langchain-core`, which requires `langsmith` | **Verified** (PyPI metadata, 2026-09-26) |
| Both support Python 3.12 (`requires_python >=3.10`) | **Verified** (PyPI metadata) |
| LangSmith tracing is off unless `LANGSMITH_TRACING`/`LANGCHAIN_TRACING_V2` is set | **Not verified.** Based on LangChain's documented behaviour; to confirm at 13.1 by reading the installed `langsmith` and `langchain_core` env handling. If other variables enable it, the guard covers them too |
| Both packages ship `py.typed` and type-check under mypy strict | **Not verified**; checked at 13.1 |
| A compiled graph without a checkpointer is safe to share across concurrent requests | **Not verified** in this repo; based on LangGraph's design (state is per invocation). A concurrency test is not planned; flagged for review |
| `uv add` can reach PyPI from this machine | **Verified** (PyPI API reachable) |
| Nothing outside `apps/ai-service` needs to change | **Verified** by inspection: web does not call ai-service; contracts are not consumed |

## Not doing

Commerce API client or tools, intents, UI commands, memory or checkpointer,
conversation id, a real provider, provider config, a system prompt,
streaming, LangSmith, per-node logging, web integration, Pydantic codegen,
CI. The full list is in `requirements.md`.

## Deferred to Phase 14+ (extension points)

| Capability | Where it plugs in |
| --- | --- |
| Real provider | `llm/build_chat_model(settings)` + `AI_PROVIDER`/`AI_MODEL`/`SecretStr` settings; boundary test allows provider SDK under `llm/` only |
| System prompt | `call_model` prepends a `SystemMessage` from `agents/prompts.py` |
| Commerce API tools | `clients/commerce/` (httpx, injected); tools bound in `build_agent_graph`; `call_model → tools → call_model` conditional loop; lift `langchain_core.tools` ban under `agents/` |
| Business intents | generated Pydantic from `agent-intent.v1.json`; validated in `finalize_reply`; submitted through the Commerce client, never applied locally |
| UI commands | generated from `ui-command.v1.json`; `AgentResult.ui_commands`; response field added |
| Memory | optional `conversationId` → `thread_id`; checkpointer (lift `langgraph.checkpoint` ban) |
| Web integration | `apps/web` proxy to ai-service replacing `simulate.ts` |
| Observability | LangGraph callbacks / `astream_events`; LangSmith only by explicit approval |
| Streaming, RAG, voice | later phases per CLAUDE.md |

## Specialised review needed?

- security: **yes.** First untrusted-body route, a transitive telemetry
  client, and utterance redaction in logs.
- performance: no (local deterministic model, no I/O).
- data / migration: no (no persistence).

## As built

The approved text above is unchanged. These are the places where the
implementation differs from it. Each was reported during `/implement`
(sub-phases 13.1–13.4), then reviewed in `review-report.md`.

| Plan says | As built | Why |
| --- | --- | --- |
| §17, AC3: refuse a *truthy* `LANGSMITH_TRACING` or `LANGCHAIN_TRACING_V2` (`true`, `1`, `yes`, `on`) | Refuses **five** variables (`LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_TRACING`, `LANGCHAIN_TRACING_V2`, `LANGCHAIN_HANDLER`) holding anything but `""`, `"0"`, `"false"` or `"False"` | Read from the installed `langsmith` and `langchain-core`: all five switch tracing on, and `langchain-core` counts any other value (`"no"`, `"FALSE"`) as on. Stricter and fail-closed; the plan's Assumptions table anticipated this. |
| §14, OD11: raise `httpx` and `httpcore` to `WARNING` | Also `httpx2` and `httpcore2` | `langsmith` installs `httpx2`/`httpcore2`, which have their own loggers. |
| §18/§19 file lists | Also modified: `tests/test_main.py` (tracing exit test; the tracing variables cleared in its fixture) and `tests/test_request_context.py:91` (header name as bytes) | Installing `httpx2` makes Starlette's `TestClient` use it, and its types reject a `(str, bytes)` header. That broke mypy (AC14), so the fix was required to compile. |
| — | `tests/conftest.py` clears the tracing variables in `pytest_configure` (13.2), and `log_stream` moved there from `test_logging.py` (13.4) | Tests build models directly, never through `load_settings`, and `langsmith` caches environment reads (AC13). The API tests need the real log configuration. |
| §6: node type as a `Callable` | `CallModelNode` is a `Protocol` | LangGraph's typed `add_node` requires a parameter named `state`, which a `Callable` type does not promise. |
| `test-plan.md`: fakes `RaisingChatModel`, `EmptyReplyChatModel`, `NonTextReplyChatModel`, `ToolCallChatModel` | `ScriptedChatModel` (returns a given message, records inputs) and `RaisingChatModel`, plus `empty_reply_model()`, `non_text_reply_model()` and `tool_call_model()` | Same cases, fewer classes. `finalize_reply` also rejects `invalid_tool_calls`. |
| §13: body limit rejects by `Content-Length`, and counts streamed bytes | Reads the body itself up to 16 KB, then hands the app a buffered copy | FastAPI turns an exception raised while it reads a body into a 400, so the middleware cannot stop a read partway through. |
| §18: `MAX_MESSAGE_LENGTH` in `schemas/agent.py` | `MAX_TURN_MESSAGE_LENGTH` | `schemas/errors.py` already has a `MAX_MESSAGE_LENGTH` (the error-message bound). |
| §18: boundary matcher extended to dotted-prefix matching | Also scans `from X import Y` as `X.Y`; an extra check that nothing builds a model, graph or service at import time (AC12) | Without the first, `from langgraph import prebuilt` would pass the rules. |
| — (security review S1–S2, fixed after the security review) | `config.ensure_tracing_disabled()`, called by `load_settings` and by `create_app`; `langchain_core.load` added to the forbidden imports | S1: the guard ran only in `load_settings`, so a composition root that built the agent directly could trace (shown by the egress probe). S2: LangChain's deserializer was the one unneeded LangChain surface not yet forbidden. |
| — (review findings 1–2, fixed after review) | The request-limits middleware reads the **first** value of a repeated header, and its docstring records that it relies on the server enforcing `Content-Length` | Review finding 1: it read the last value while FastAPI reads the first, so the status could be wrong. Review finding 2: documented as an assumption, not changed, to stay consistent with commerce-api. |
