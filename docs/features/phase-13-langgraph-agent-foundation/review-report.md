# Review Report — Phase 13: LangGraph Agent Foundation

**Reviewed:** `requirements.md`, `plan.md` and `test-plan.md` first, then
every changed and new file under `apps/ai-service/`. `uv.lock` was checked
through `uv sync --locked` and the exact-dependency test, not line by line.
The docs under review were `docs/api/ai-service.md`,
`architecture-decisions.md` (ADR-0020), `system-architecture.md` and
`getting-started.md`.

There were two passes:

- **My own.** I implemented the phase, so this is a self-review.
- **An independent `implementation-reviewer` agent.** It re-ran `uv sync`,
  `pytest` (224 passed), `ruff check`, `ruff format --check` and `mypy`
  itself, and probed `RequestLimitsMiddleware` directly at the ASGI level.

Findings 1 and 2 were confirmed by running code. The other findings were
found by reading.

**Path:** Full

## Verdict

Sound, and within the approved scope. All acceptance criteria (AC1–AC15)
are met in code and tests. Nothing is BLOCKER, HIGH or MEDIUM. **Findings
1–3 were fixed after the review, at the human's request** (see each row).

- Findings 1–3 are LOW. Two are edge cases in the request-limits middleware
  that cannot bypass the 16 KB limit or the JSON rule through the real
  server. One is drift in this feature's own planning documents.
- The rest are notes.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | LOW — **FIXED** (after review, at the human's request) | `apps/ai-service/ai_service/core/request_limits.py` (`_first_header`) | `headers = dict(scope["headers"])` keeps the **last** copy of a repeated header, while Starlette's `Headers.get` (used by FastAPI's body parsing) returns the **first**. **Confirmed by probe:** with `Content-Type: text/plain` followed by `Content-Type: application/json`, the middleware passes the request, FastAPI then treats the body as bytes, and the response is `400 INVALID_PAYLOAD` (`body: model_attributes_type`) instead of `415`. In the reverse order the response is `415`, which is correct. Nothing is bypassed: the body never reaches the handler as JSON. It is only a misleading status for a malformed request. The same "last wins" rule applies to a repeated `Content-Length`, but the byte count while reading still enforces the limit (the reviewer agent confirmed a 20 KB body still gets 413). | Read the first value of each header, the same rule as Starlette (for example `next((v for k, v in scope["headers"] if k == name), None)`). Alternatively, reject a request that repeats `Content-Type` or `Content-Length` with 400. Add a test for each ordering. **Done:** `_first_header` returns the first value of a header, and the middleware uses it for `Content-Length`, `Transfer-Encoding` and `Content-Type`. `test_repeated_content_type_is_judged_by_its_first_value` covers both orderings (415 and 200). It failed when the helper was temporarily made to return the last value, and passes with the fix. `test_repeated_content_length_cannot_lift_the_limit` pins the 413 with a small first `Content-Length`. |
| 2 | LOW — **FIXED** (documented as an assumption, at the human's request) | `apps/ai-service/ai_service/core/request_limits.py` (module docstring, has-body rule) | A request that declares `Content-Length: 0` counts as having no body, so neither check runs. **Confirmed by the reviewer agent's probe at the ASGI level only:** a fake `receive()` that still yields 200 KB after declaring length 0 reaches the app untouched. It could not be reproduced through uvicorn/h11, which does not deliver body bytes beyond a declared length (extra bytes would belong to the next request). This rule is copied on purpose from commerce-api's `hasBody` (`json-body.middleware.ts:15-24`, plan OD10). It matters only if the service one day runs behind something that does not enforce `Content-Length` (another ASGI server, HTTP/2 termination, a proxy). | Record it as an explicit assumption ("relies on the server enforcing `Content-Length`") in the middleware's docstring. Or, when a deployment topology exists, count what `receive()` actually delivers even on the no-body path. Keep commerce-api and ai-service consistent: whichever change is made, apply it to both. **Done:** the module docstring now states the assumption, why it holds under uvicorn/h11, and what to change (in both services) if the topology changes. Behaviour is unchanged, deliberately. |
| 3 | LOW — **FIXED** (at the human's request) | `docs/features/phase-13-langgraph-agent-foundation/requirements.md` (AC3), `plan.md` §17/§18, `test-plan.md` | This feature's own planning documents describe the plan, not what was built. **AC3 and §17** name 2 tracing variables and a "truthy" set, where the implementation refuses 5 variables with an exact "off" list (stricter; ADR-0020 §10 and `.env.example` are correct). **§18/§19** omit `tests/test_main.py` (tracing exit test and env scrub) and `tests/test_request_context.py` (the httpx2 typing fix). **`test-plan.md`** names four fake classes, but the fakes are `ScriptedChatModel`, `RaisingChatModel` and helpers. Each deviation was reported during implementation and judged justified by both passes, but a reader of the plan alone would be misled. | Add a short "As built" section to `plan.md` listing the deviations (they are in the 13.1–13.4 reports), rather than rewriting the approved text. **Done:** `plan.md` has an "As built" table with each deviation and its reason, including these fixes. AC3 in `requirements.md` has a one-line pointer to it. The approved text is unchanged. |
| 4 | NOTE | `apps/ai-service/ai_service/core/request_limits.py:120-132` | `_send_error` hand-builds a JSON error response. `core/request_context.py` already does the same for its 500 (`_INTERNAL_ERROR_BODY`/`_INTERNAL_ERROR_HEADERS`). There are now two small copies of "send a `ContractError` from raw ASGI". | None now. If a third ASGI-level error appears, extract one helper into `core/errors.py`. |
| 5 | NOTE | `apps/ai-service/ai_service/core/request_limits.py:85-87` | If the client disconnects while the body is being read, nothing is sent, and the request-context completion line records `status: 500`, its default when no response started. This was already recorded as follow-up in the 13.4 and 13.5 reports. | When logging is next touched, record "no response" (for example `status: null` or `client_disconnected: true`) instead of 500. |
| 6 | NOTE | `apps/ai-service/pyproject.toml` | `httpx` is now installed at runtime (required by `langchain-core`) but is declared only in the dev group. Harmless: the service never imports it, and the boundary test forbids importing it. | None. Revisit when the Commerce API client makes `httpx` a direct runtime dependency. |
| 7 | NOTE | `apps/ai-service/ai_service/agents/service.py` | Agent failures log only the exception's class name, so diagnosing a real failure needs a local reproduction. This is the approved OD8 trade-off, recorded in ADR-0020. It becomes more costly once a real provider exists. | Revisit with the provider phase, for example a redacted provider error code as an extra log field. |

## Acceptance criteria

| AC | Met? | Evidence |
| -- | ---- | -------- |
| AC1 Dependencies | yes | runtime deps exactly the 5 (`test_boundaries.py`, tightened from `<=` to `==`); `uv sync --locked` PASS |
| AC2 Import boundaries | yes | location-scoped and dotted-prefix rules plus matcher tests; manual negative check done in 13.1 (2 tests failed, reverted) |
| AC3 Tracing guard | yes (stricter than written; finding 3) | `test_config.py`, `test_main.py`; manual `LANGSMITH_TRACING=true` → exit 1 |
| AC4 State | yes | `test_agent_state.py` key allowlist |
| AC5 Graph | yes | `test_agent_graph.py`: nodes, edges, no checkpointer, recursion limit enforced |
| AC6 Nodes | yes | `test_agent_nodes.py`: every rejection branch |
| AC7 Service | yes | `test_agent_service.py`: mapping, 5 failure kinds, cancellation, recursion limit |
| AC8 Endpoint | yes | `test_agent_api.py`: 200 and 7 kinds of 400 |
| AC9 Request limits | yes (edge cases: findings 1–2) | `test_request_limits.py`, `test_errors.py` schema rows |
| AC10 Safe failure | yes | sentinel absent from body and logs; negative check done in 13.3 (5 failed with `exc_info=True`) |
| AC11 Logging | yes | exact field sets; `request_id`/`correlation_id` in the API test; manual run log |
| AC12 Injection | yes | `agent_service=` honoured; import-time AST check (negative check done in 13.4) |
| AC13 Isolation | yes | 224 passed with no network interface (13.4) |
| AC14 Checks | yes | all four PASS (`/validate`, and re-run by the reviewer agent) |
| AC15 Docs | yes | API doc, README, `.env.example`, `getting-started.md`, `system-architecture.md` §1, ADR-0020 |

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `apps/ai-service/pyproject.toml`, `uv.lock` | 13.1 dependencies | yes |
| `ai_service/config.py` | 13.1 tracing guard | yes |
| `ai_service/core/logging.py` | 13.1 HTTP-client log levels | yes |
| `tests/test_boundaries.py`, `test_config.py`, `test_logging.py` | 13.1 guards (+13.4 import-time check; `log_stream` moved out in 13.4) | yes |
| `tests/test_main.py` | 13.1 tracing exit test and env scrub | yes; not in §19's list (finding 3) |
| `tests/test_request_context.py` | 13.1: one-line typing fix needed for mypy after httpx2 arrived | yes, as "required to compile" (scope-control); not in §19's list (finding 3) |
| `ai_service/llm/*`, `ai_service/agents/{__init__,state,nodes,graph}.py` | 13.2 | yes |
| `tests/fakes.py`, `test_simulated_model.py`, `test_agent_state.py`, `test_agent_nodes.py`, `test_agent_graph.py` | 13.2 | yes |
| `tests/conftest.py` | 13.2 tracing scrub, 13.4 fixtures | yes |
| `ai_service/agents/{service,errors}.py`, `tests/test_agent_service.py` | 13.3 | yes |
| `ai_service/core/request_limits.py`, `core/errors.py`, `schemas/agent.py`, `api/agent.py`, `api/__init__.py`, `main.py` | 13.4 | yes |
| `tests/test_agent_api.py`, `test_request_limits.py`, `test_errors.py` | 13.4 | yes |
| `ai_service/__init__.py`, `README.md`, `.env.example` | 13.5 | yes |
| `docs/api/ai-service.md`, `docs/architecture/architecture-decisions.md`, `system-architecture.md`, `docs/development/getting-started.md` | 13.5 | yes |
| `docs/features/phase-13-langgraph-agent-foundation/*` | plan documents, approval record, this report, the "As built" section (finding 3) | yes |

Nothing outside `apps/ai-service/` and `docs/` changed (`git status`).

## Not reviewed

- **Concurrency of one compiled graph shared across concurrent requests.**
  Not load-tested. The plan records it as an unverified assumption, and
  ADR-0020 records it as a consequence.
- **Live LangSmith egress.** The tracing guard is tested at the config and
  entry-point level only, not by watching network traffic
  (`test-plan.md`, "Not covered").
- **Findings 1–2 through a real HTTP server.** They were reproduced with the
  test client and at the ASGI level. Neither was attempted over a raw socket
  against uvicorn.
- **`uv.lock` line by line.** The 24 transitive packages were not audited
  individually for supply-chain risk. That belongs to the security review.
- **The security review itself** (plan §23) is a separate step and has not
  been done here.
