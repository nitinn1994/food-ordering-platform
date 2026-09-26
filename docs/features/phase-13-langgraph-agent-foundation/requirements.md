# Requirements — Phase 13: LangGraph Agent Foundation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-26 (in conversation, "approved", given after the full plan including OD1–OD14 with a recommendation on each; the recommendations are therefore the decisions)
**Risk:** HIGH
**Path:** Full

## Problem

`apps/ai-service` (Phase 12, ADR-0019) has configuration, errors, logging,
request correlation and `GET /health`. It has no AI behaviour. The target
architecture (`system-architecture.md` §3, steps 3–7) says the service reasons
with LangGraph, but nothing decides yet:

- how a graph is structured, built, injected and tested
- what agent state may hold, and what it must never hold (commerce state)
- where the model boundary sits, so a provider is never hardcoded
- how a customer utterance enters the service, and how a failure leaves it
  without leaking the utterance, a prompt or a traceback

If these are decided inside the first phase that adds Commerce API tools,
they are decided under pressure from tool work. That is how commerce-api got
its middleware-ordering bug (ADR-0013). Phase 12 deferred them on purpose.

## Goal

A minimal, deterministic LangGraph agent inside `apps/ai-service`. It has a
narrow conversation-only state, a two-node linear graph, a LangChain
chat-model boundary filled by an in-repo simulated model, an agent
application service between HTTP and the graph, and one route,
`POST /v1/agent/turns`. It runs and tests with no model provider, no API key,
no commerce-api, no database and no network. It has no tools, no intents, no
UI commands and no memory.

## Risk assessment (Full Path)

- **Classification: HIGH.** Two dimensions set it:
  - **Security — HIGH (by the table's definition):** the service's first
    route that accepts a body, and that body is untrusted customer text. It
    is a new input trust boundary. The new dependency tree also brings in
    `langsmith`, a telemetry client that can send data off the machine when
    its environment variables are set.
  - **Scope — HIGH:** it is architectural. It fixes the orchestration layer,
    the model boundary and the state rules that every later AI phase builds
    on.
- Other dimensions: data none (no persistence, no schema); API compatibility
  additive (a new route); infrastructure MEDIUM (new runtime dependencies, no
  new service or port); user impact internal (`apps/web` does not call it
  yet); reversibility revertible with care.
- **Specialised review:** security (see `plan.md` §23).

## In scope

1. **Dependencies:** `langgraph` and `langchain-core` as direct runtime
   dependencies, `uv.lock` updated. No other LangChain package, no provider
   SDK.
2. **Boundary guards (`tests/test_boundaries.py`):** allowlists widened for
   exactly those two packages. Location rules: `langgraph` is imported only
   under `ai_service/agents/`, and `langchain_core` only under
   `ai_service/agents/` and `ai_service/llm/`. Tools, prebuilt agents,
   checkpointers, the LangGraph SDK, `langsmith`, `langchain` and every
   provider package stay forbidden.
3. **Tracing guard:** the process refuses to start if LangSmith/LangChain
   tracing is switched on by environment variable.
4. **Model boundary (`ai_service/llm/`):** LangChain's `BaseChatModel` is the
   interface. `SimulatedChatModel` is a deterministic implementation, and
   `build_chat_model()` is the one place a model is chosen.
5. **Agent (`ai_service/agents/`):** `AgentState`, two nodes (`call_model`,
   `finalize_reply`), `build_agent_graph(model)`, `AgentService`,
   `AgentResult`, and `AgentTurnFailedError`.
6. **HTTP:** `POST /v1/agent/turns`, request `{"message": ...}`, response
   `{"reply": ...}`.
7. **Request limits (ADR-0019 rule for the first body route):** app-wide 16
   KB JSON body limit (413 `PAYLOAD_TOO_LARGE`) and a JSON content-type guard
   (415 `UNSUPPORTED_MEDIA_TYPE`), matching commerce-api.
8. **Dependency injection:** `create_app` builds or accepts the
   `AgentService`. No module-level graph, model or service.
9. **Logging:** one turn-level log line with no content. `httpx`/`httpcore`
   loggers raised to `WARNING`, since `httpx` is now a runtime dependency
   (transitively).
10. **Tests** for every acceptance criterion below, including the ADR-0019 S2
    sentinel test (a customer utterance never reaches a log).
11. **Docs:** `docs/api/ai-service.md`, the service `README.md`,
    `.env.example`, `getting-started.md`, `system-architecture.md` §1, and a
    new ADR-0020.

## Out of scope

Everything in the brief's §19, restated: Commerce API client and tools
(cart, menu, order), business-intent generation or execution, UI commands,
RAG, embeddings, Qdrant or any vector store, memory or checkpoint
persistence, Redis, a conversation database, MCP, voice or LiveKit, payment,
authentication, notifications, delivery tracking, multi-agent graphs,
autonomous or tool-calling loops, planner/executor, reflection, production
deployment, Kubernetes, microservices.

Also out of scope here:

- A real model provider, provider configuration (`AI_PROVIDER`, `AI_MODEL`,
  keys), model timeouts, retries or fallbacks (ADR-0019 §10: provider config
  arrives with the first provider).
- A system prompt or any prompt engineering. There is no model that reads
  one.
- Pydantic codegen from `packages/contracts` (ADR-0019 defers it to the first
  phase that consumes a contract family; this phase consumes none).
- Wiring `apps/web`'s chat to this route. The chat keeps using
  `src/lib/commands/simulate.ts`.
- Streaming responses, LangSmith, per-node tracing, CORS, rate limiting.

## Acceptance criteria

- [ ] **AC1 — Dependencies.** `pyproject.toml` runtime dependencies are
  exactly `fastapi`, `pydantic`, `uvicorn`, `langgraph` and `langchain-core`.
  `uv.lock` is updated and `uv sync` succeeds. The dev group is unchanged.
- [ ] **AC2 — Import boundaries.** `test_boundaries.py` fails if:
  - `langgraph` is imported outside `ai_service/agents/`
  - `langchain_core` is imported outside `ai_service/agents/` or
    `ai_service/llm/`
  - anything under `ai_service/api/` imports either one
  - the service imports `langchain`, `langchain_community`, any
    `langchain_<provider>`, `langsmith`, `langgraph.prebuilt`,
    `langgraph.checkpoint`, `langgraph_sdk`, `langchain_core.tools` or a
    provider SDK

  Each new rule is shown able to fail (matcher unit tests plus a manual
  negative check recorded in the review).
- [ ] **AC3 — Tracing guard.** With `LANGSMITH_TRACING` or
  `LANGCHAIN_TRACING_V2` set to a truthy value, `load_settings` raises
  `ConfigError`, and `python -m ai_service` exits 1 naming the variable, not
  the value. Unset or falsy values start normally. *As built: stricter —
  five variables, and only `""`, `"0"`, `"false"` or `"False"` count as off
  (`plan.md`, "As built").*
- [ ] **AC4 — State.** `AgentState`'s keys are exactly `messages` and
  `reply`. A test fails if a key is added without changing that allowlist.
  The module docstring states that commerce state (cart, prices, order
  status, availability) never lives in agent state.
- [ ] **AC5 — Graph.** `build_agent_graph(model)` compiles without a
  checkpointer. Its nodes are exactly `call_model` and `finalize_reply`, and
  its edges are exactly `START → call_model → finalize_reply → END`, with no
  conditional edges. It is invoked with an explicit recursion limit.
- [ ] **AC6 — Nodes.** Each node is tested on its own.
  - `call_model` appends the model's `AIMessage` to `messages`.
  - `finalize_reply` sets `reply` from the last `AIMessage`. It raises
    `AgentOutputError` for a missing message, empty or non-text content, or
    any tool call.
- [ ] **AC7 — Agent service.** `AgentService.run_turn(message)` returns an
  `AgentResult(reply=...)`.
  - With `SimulatedChatModel` the reply is the same fixed text on every call.
  - Any exception raised while the graph runs becomes `AgentTurnFailedError`
    (`AGENT_FAILED`, 500). `asyncio.CancelledError` is not swallowed.
- [ ] **AC8 — Endpoint.** `POST /v1/agent/turns` with
  `{"message": "Hello"}` returns `200 {"reply": "<simulated text>"}`. A
  missing, non-string, empty, whitespace-only or over-2000-character
  `message`, or an unknown key, returns `400 INVALID_PAYLOAD`. The rejected
  value is never echoed.
- [ ] **AC9 — Request limits.**
  - A body over 16 KB returns `413 PAYLOAD_TOO_LARGE`.
  - A body whose `Content-Type` is not `application/json` returns
    `415 UNSUPPORTED_MEDIA_TYPE`.
  - Both are `ContractError` bodies (validated against `error.v1.json`) and
    carry `X-Request-Id` and `X-Correlation-Id`.
  - `GET /health` and the existing test routes are unaffected.
- [ ] **AC10 — Safe failure.** When the model raises (injected through a test
  fake carrying a sentinel in its exception text and in the message), the
  route returns
  `500 {"code":"AGENT_FAILED","message":"The assistant could not process this message."}`.
  Neither the response nor any captured log line contains the sentinel
  message, the exception text or a traceback.
- [ ] **AC11 — Logging.** A successful turn writes exactly one
  `agent turn completed` line with `outcome`, `duration_ms`, `message_chars`
  and `reply_chars`, plus the request's `request_id` and `correlation_id`. A
  failed turn writes one `agent turn failed` line with `error_type` (class
  name only). The message or reply text appears in no log line (sentinel
  test, ADR-0019 S2).
- [ ] **AC12 — Injection.** `create_app(settings, agent_service=...)` uses
  the given service. Without it, `create_app` builds one from
  `build_chat_model()`. No module in `ai_service/` holds a graph, a model or
  a service at import time.
- [ ] **AC13 — Isolation.** The whole suite runs with no network, no API key,
  no `.env`, no commerce-api and no database. `/health` does not construct or
  call the agent.
- [ ] **AC14 — Checks.** `uv run pytest`, `uv run ruff check .`,
  `uv run ruff format --check .` and `uv run mypy` all pass.
- [ ] **AC15 — Docs.** `docs/api/ai-service.md` documents the route, its
  errors and its limits. README, `.env.example`, `getting-started.md` and
  `system-architecture.md` §1 are corrected, and ADR-0020 records the
  decisions in `plan.md` §24.

## Open questions

See `plan.md` §24 (OD1–OD14). Each has a recommendation. Approving the plan
as written approves the recommendations.
