# Test Plan — Phase 13: LangGraph Agent Foundation

All tests are pytest, deterministic, and run offline. They need no API key,
no `.env`, no commerce-api and no database. The model boundary is exercised
with `SimulatedChatModel` or the test-only fakes in `tests/fakes.py`:

- `RaisingChatModel`: raises with a sentinel in its exception text.
- `EmptyReplyChatModel`
- `NonTextReplyChatModel`: list content.
- `ToolCallChatModel`: an `AIMessage` with `tool_calls`.

Apps are built through `create_app(Settings(app_env="test"), agent_service=...)`,
as Phase 12's `conftest.py` already does.

`SENTINEL_MESSAGE` is a unique string sent as the customer message. It is
asserted absent from every response body and every captured log line
(ADR-0019 S2).

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --- | --- | --- |
| AC1 Dependencies | `test_boundaries.py`: runtime deps ⊆ `{fastapi, pydantic, uvicorn, langgraph, langchain-core}`, and `langgraph` and `langchain-core` are present; dev group unchanged. `uv sync` run and reported | automated + command |
| AC2 Import boundaries | `test_boundaries.py`: AST scan with location-scoped rules; matcher unit tests for each new rule (`langgraph.prebuilt`, `langgraph.checkpoint.memory`, `langchain_core.tools`, `langchain_openai`, `langsmith`, `langchain_core.messages` allowed only in `agents/` and `llm/`, `langgraph.graph` allowed only in `agents/`). Manual negative check: temporarily add a forbidden import, see the test fail, revert, and record it in the review | automated + manual |
| AC3 Tracing guard | `test_config.py`: `load_settings({"LANGSMITH_TRACING": "true"})` and `{"LANGCHAIN_TRACING_V2": "1"}` raise `ConfigError` naming the variable; the value is absent from the message; `"false"`, `"0"`, `""` and unset are accepted. Existing `__main__` exit-code test pattern reused for exit 1 | automated |
| AC4 State | `test_agent_state.py`: `set(AgentState.__annotations__) == {"messages", "reply"}`; `add_messages` appends rather than replaces | automated |
| AC5 Graph | `test_agent_graph.py`: `build_agent_graph(SimulatedChatModel())` compiles; `get_graph()` nodes == `{__start__, call_model, finalize_reply, __end__}`; edges == the three expected, none conditional; `checkpointer is None`; invoking with 1 `HumanMessage` yields 2 messages and a `reply` | automated |
| AC6 Nodes | `test_agent_nodes.py`: `make_call_model(model)` appends exactly one `AIMessage`; `finalize_reply` returns `{"reply": ...}`; it raises `AgentOutputError` for no messages, a last message that is not an `AIMessage`, empty content, list content, or `tool_calls` | automated |
| AC7 Service | `test_agent_service.py`: `run_turn("Hello")` → `AgentResult(reply=SIMULATED_REPLY)`, identical across calls; each fake → `AgentTurnFailedError` (`code == "AGENT_FAILED"`, `status_code == 500`, `__cause__ is None`/suppressed); a graph stub that raises `CancelledError` propagates it; the recursion limit is passed (stub graph records its config) | automated |
| AC8 Endpoint | `test_agent_api.py`: `200 {"reply": SIMULATED_REPLY}`; 400 `INVALID_PAYLOAD` for missing, `null`, number, `""`, `"   "`, 2001 chars, and an unknown key (`field` asserted); rejected value absent from the body; `GET` → 405 | automated |
| AC9 Request limits | `test_request_limits.py`: 16 KB + 1 body → 413 `PAYLOAD_TOO_LARGE` (by `Content-Length` and by a streamed body with no length); `text/plain` body → 415 `UNSUPPORTED_MEDIA_TYPE`; `application/json; charset=utf-8` accepted; both carry `X-Request-Id`/`X-Correlation-Id`; `GET /health` still 200. `test_errors.py` parametrisation extended with 413, 415 and `AGENT_FAILED`, all validated against `error.v1.json` | automated |
| AC10 Safe failure | `test_agent_api.py` with `RaisingChatModel`: `500 {"code":"AGENT_FAILED","message":"The assistant could not process this message."}`; `SENTINEL_MESSAGE`, the exception sentinel and `"Traceback"` are absent from the body and from all captured log output | automated |
| AC11 Logging | `test_agent_service.py` / `test_agent_api.py` capture JSON logs (the existing `test_logging.py` pattern). Success: exactly one `agent turn completed` with `outcome`, `duration_ms`, `message_chars`, `reply_chars`, `request_id` and `correlation_id`. Failure: one `agent turn failed` with `error_type` and no `exc_info`. Sentinel absent in both. `test_logging.py`: `httpx`/`httpcore` effective level is `WARNING` after `configure_logging` | automated |
| AC12 Injection | `test_agent_api.py`: an injected service with a fake model changes the reply; two apps built side by side keep separate services. `test_boundaries.py`-style AST check: no module-level call to `build_agent_graph`, `build_chat_model` or `AgentService(` in `ai_service/` | automated |
| AC13 Isolation | the full suite runs with no `.env` and no key; `/health` test builds the app with a service whose model raises and still gets 200 | automated |
| AC14 Checks | the four commands below, run and reported | command |
| AC15 Docs | reviewed against the implemented routes, codes and limits in `/review` | manual |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| simulated model determinism, `_llm_type`, never echoes input | AC7 (model part) | `tests/test_simulated_model.py` (new) |
| state keys, reducer | AC4 | `tests/test_agent_state.py` (new) |
| node behaviour and rejections | AC6 | `tests/test_agent_nodes.py` (new) |
| compile, topology, invocation | AC5 | `tests/test_agent_graph.py` (new) |
| mapping, errors, cancellation, recursion limit, logs, sentinel | AC7, AC11 | `tests/test_agent_service.py` (new) |
| route success, validation, 405, 500, sentinel, injection, health | AC8, AC10, AC12, AC13 | `tests/test_agent_api.py` (new) |
| 413, 415, headers, unaffected routes | AC9 | `tests/test_request_limits.py` (new) |
| fake chat models | helpers | `tests/fakes.py` (new) |
| allowlists, location rules, matcher | AC1, AC2 | `tests/test_boundaries.py` (modified) |
| tracing guard | AC3 | `tests/test_config.py` (modified) |
| httpx/httpcore level | AC11 | `tests/test_logging.py` (modified) |
| contract-schema rows 413/415/`AGENT_FAILED` | AC9, AC10 | `tests/test_errors.py` (modified) |
| `agent_client` fixture | helpers | `tests/conftest.py` (modified) |

## Validation commands

Declared in `apps/ai-service/README.md` and `docs/development/getting-started.md`.
Run from `apps/ai-service/`. There is no CI, and these are not part of
`pnpm turbo run`.

| Check | Command | Expected |
| --- | --- | --- |
| install | `uv sync` | PASS |
| format | `uv run ruff format --check .` | PASS |
| lint | `uv run ruff check .` | PASS |
| types | `uv run mypy` | PASS |
| test | `uv run pytest` | PASS |
| build | — | NOT_CONFIGURED (unpackaged application, `[tool.uv] package = false`) |

The TypeScript workspace (`pnpm turbo run …`) is NOT_APPLICABLE: no file
under `apps/web`, `apps/commerce-api` or `packages/contracts` changes.

## Manual checks

1. `uv run python -m ai_service`, then
   `curl -si -X POST localhost:3002/v1/agent/turns -H 'content-type: application/json' -d '{"message":"Hello"}'`.
   Expect 200 `{"reply": ...}` with correlation headers, and one
   `agent turn completed` log line without the text "Hello".
2. The same with `-H 'content-type: text/plain'` → 415.
3. `LANGSMITH_TRACING=true uv run python -m ai_service` → exits 1 and names
   `LANGSMITH_TRACING`.
4. The AC2 negative check: temporarily add
   `from langgraph.prebuilt import ToolNode` to `agents/graph.py` and
   `import langgraph` to `api/agent.py`. Run `uv run pytest tests/test_boundaries.py`,
   expect it to fail, then revert.

## Not covered

- **Real model behaviour.** There is no provider in Phase 13. The
  simulated model proves the wiring, not the quality of a reply.
- **Live LangSmith egress.** The guard is tested at config level. It is not
  tested by observing network traffic. This is acceptable because tests run
  offline, and the security review inspects the env handling.
- **Concurrency under load** of a shared compiled graph. It is stateless by
  design (no checkpointer); flagged as an assumption for review.
- **Web integration.** `apps/web` does not call this route in Phase 13.
