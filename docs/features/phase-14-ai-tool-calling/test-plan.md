# Test Plan — Phase 14: AI Tool Calling → Commerce API

All automated tests are pytest in `apps/ai-service/tests/`. They are
deterministic and need no network, no model provider and no running
commerce-api. The one exception is the opt-in live module, which is skipped
unless its variable is set. HTTP is faked with `httpx.MockTransport` (built
into httpx, so no new dependency). Models are faked with `tests/fakes.py`.

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --- | --- | --- |
| AC1 generated contract models, drift | `test_generated_contracts.py` regenerates from the committed JSON Schema in memory and compares byte-for-byte with `ai_service/contracts/api_contracts.py`. A hand edit is shown to fail it during implementation. | automated |
| AC2 strict generated models | Each generated model rejects an unknown key, and a representative valid fixture parses. | automated |
| AC3 client public surface | Introspect `CommerceClient`: public callables are exactly the five names, and no parameter is named or typed as url, path, method or headers. | automated |
| AC4 base URL validation | `test_config.py`: valid http/https URLs accepted, trailing `/` normalised. `ftp://`, missing host, user info, query and fragment rejected. Required in `production`. The error names `COMMERCE_API_URL` and never the value (sentinel). | automated |
| AC5 no redirects, no env proxy | A transport returning 302 gives `CommerceBadResponseError`, and no second request is recorded. The built client has `follow_redirects is False` and `trust_env is False`. | automated |
| AC6 path-parameter safety | `set_cart_item_quantity` and `remove_cart_item` with `../x`, `a/b`, `%2e`, `""`, `"A"` and a 65-character id raise before any request reaches the transport (the recorder is empty). | automated |
| AC7 response validation | Invalid JSON, a missing field, an extra field and a wrong type on 200 each give `CommerceBadResponseError`. A sentinel inside the body is absent from `caplog`. | automated |
| AC8 failure classification | Parametrized over §12 of the plan: `ConnectError` and `ConnectTimeout` (read and write) give unavailable. `ReadTimeout` gives unavailable on GET and outcome unknown on POST, PATCH and DELETE. `RemoteProtocolError` on a write gives outcome unknown. 500 and 503 give unavailable. 404, 409 and 422 with a `ContractError` give `CommerceApiError(status, code)`. 400 and 404 with a non-JSON body give bad response. | automated |
| AC9 headers, no retry | The recorded request carries `X-Correlation-Id` equal to the value set in `correlation_id_var` and no `Authorization` or other custom header. On a failure the transport is called exactly once. | automated |
| AC10 registry allowlist | `set(build_tool_registry()) == {five names}`. The mapping raises on assignment. Categories are pinned. The bind schemas list the same five names. | automated |
| AC11 tool input schemas | Per tool, a valid and invalid matrix: unknown key, missing key, `"2"`, `2.5`, `True`, 0, 100, a bad id pattern, and arguments passed to `get_menu` or `get_cart`. JSON-schema constraints equal the committed contract's pattern and bounds. | automated |
| AC12 ToolService never raises for tool failures | Unknown tool gives `UNKNOWN_TOOL`, and a spy handler is not called. Invalid args give `INVALID_TOOL_ARGUMENTS` with `field`, and the spy client is not called. Each client error gives its mapped code. A non-client exception propagates (a bug is not masked). | automated |
| AC13 correct route per tool | For each tool, via the fake commerce-api: method, path and JSON body recorded exactly once. | automated |
| AC14 static messages | commerce-api error bodies with a sentinel `message` produce a `ToolResult` whose JSON does not contain the sentinel. Each message equals the table entry for its code. | automated |
| AC15 end-to-end tool flow | `test_agent_tool_loop.py`: `create_app` with a `SequencedChatModel` (`get_menu` → `add_cart_item` → text) and the fake commerce transport. `POST /v1/agent/turns` returns 200 with the scripted reply. The fake records `GET /v1/menu` then `POST /v1/cart/items {itemId, quantity}`. | automated |
| AC16 tool error reaches the model | The fake returns 422 `MENU_ITEM_UNAVAILABLE`. The model's second invocation receives a `ToolMessage` whose parsed content has `ok: false` and that code, and the turn is 200. | automated |
| AC17 one ToolMessage per call id | A model message with a valid call, an unknown tool, an `invalid_tool_calls` entry and calls past the cap: every id appears in exactly one `ToolMessage`. | automated |
| AC18 sequential order | Two write calls in one message are recorded by the fake in message order, and the second starts after the first completes (the fake handler records start and end). | automated |
| AC19 limits | A model that always asks for `get_cart` produces exactly `MAX_TOOL_ROUNDS` executed rounds, then 500 `AGENT_FAILED`. 10 calls in one message: 8 executed, 2 get `TOOL_CALL_LIMIT_EXCEEDED`. `ainvoke` receives `recursion_limit == RECURSION_LIMIT`. | automated |
| AC20 prompt and binding | `SequencedChatModel` records the tools passed to `bind_tools` (the five schemas) and that `received[0][0]` is a `SystemMessage` containing the four rules. | automated |
| AC21 state keys unchanged | The existing `test_agent_state.py` still passes, unmodified. | automated |
| AC22 default model unchanged | The existing `test_agent_api.py` passes with the default app. With the default app and a transport that fails on any request, a turn still returns the simulated reply, and `/health` makes no commerce request. Plus a manual curl (below). | automated + manual |
| AC23 boundary guards | `test_boundaries.py`: allowlists equal the approved sets. httpx outside `clients/` is flagged. langgraph and langchain_core in `tools/` are flagged. `langchain_core.tools`, `langgraph.prebuilt` and `langgraph.checkpoint` are still flagged. `commerce_api_url` is allowed while `database_url` and `other_url` are still refused. Each new rule is shown to fail on a synthetic case. | automated |
| AC24 logging and redaction | `test_tool_logging.py`: one `ai_service.tools` record per call with exactly the named fields. The turn record has `tool_calls` and `tool_rounds`. Sentinels in model tool args, a commerce 200 body and a commerce error message are absent from every captured record (message and `fields`). | automated |
| AC25 client lifecycle | `test_main.py`: the app built with an injected HTTP client closes it on lifespan shutdown (`is_closed`). The import-time constructor scan includes the new builders. | automated |
| AC26 checks green | The four validation commands below. | automated |
| AC27 docs accurate | Review against as-built. Every command in the README and `getting-started.md` is executed. | manual |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| Contract drift + strictness | AC1, AC2 | `tests/test_generated_contracts.py` (new) |
| Client surface, routes, errors, headers, safety | AC3, AC5–AC9 | `tests/test_commerce_client.py` (new) |
| Commerce settings | AC4 | `tests/test_config.py` (changed) |
| Tool input schemas | AC11 | `tests/test_tool_schemas.py` (new) |
| Registry and bind schemas | AC10 | `tests/test_tool_registry.py` (new) |
| Tool service dispatch and mapping | AC12–AC14 | `tests/test_tool_service.py` (new) |
| Tool and turn logging redaction | AC24 | `tests/test_tool_logging.py` (new) |
| Graph tool loop end to end | AC15–AC20, AC22 | `tests/test_agent_tool_loop.py` (new) |
| Graph shape pinned (nodes, conditional edge) | graph topology | `tests/test_agent_graph.py` (changed) |
| `call_model` prompt, `execute_tools`, `finalize_reply` | AC17, AC19, AC20 | `tests/test_agent_nodes.py` (changed) |
| Turn log fields | AC24 | `tests/test_agent_service.py` (changed) |
| `bind_tools` no-op | AC22 | `tests/test_simulated_model.py` (changed) |
| Wiring, injection, lifespan | AC25 | `tests/test_main.py` (changed) |
| Boundaries | AC23 | `tests/test_boundaries.py` (changed) |
| Fake commerce-api | support | `tests/commerce_fakes.py` (new) |
| `SequencedChatModel`, `bind_tools` on fakes | support | `tests/fakes.py` (changed) |
| Live client against real commerce-api | S1, AC13 against the real API | `tests/test_live_commerce.py` (new, skipped unless `AI_SERVICE_LIVE_COMMERCE_API_URL` is set) |

## Validation commands

All from `apps/ai-service`, all declared in its README:

| Check  | Command | Expected |
| ------ | ------- | -------- |
| format | `uv run ruff format --check .` | PASS |
| lint   | `uv run ruff check .` | PASS |
| types  | `uv run mypy` | PASS |
| test   | `uv run pytest` | PASS (the live module reported as SKIPPED) |
| build  | — | NOT_CONFIGURED (ai-service has no build step, ADR-0019) |

Commands this phase adds, and declares in the README and `getting-started.md`:

| Check | Command | Expected |
| --- | --- | --- |
| regenerate contracts | `uv run python scripts/generate_contracts.py` | no diff in `git status` after running |
| live client check | `AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 uv run pytest tests/test_live_commerce.py` | PASS with commerce-api running |

TypeScript workspace (`pnpm turbo run lint typecheck test build` from the
root): NOT_APPLICABLE, because no TypeScript file changes. It is run once
before `/final-review` only to confirm that.

## Manual checks

1. Start commerce-api: from `apps/commerce-api`, run `pnpm db:up`,
   `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`. Run the live test
   command above and record the result. Note: it **mutates the single
   shared cart**. The test removes every line it added before it finishes,
   and it never places an order.
2. Run ai-service (`uv run python -m ai_service`) with commerce-api stopped.
   `curl -s -X POST localhost:3002/v1/agent/turns -H 'content-type: application/json' -d '{"message":"Add a tiramisu"}'`
   returns the Phase 13 simulated reply, and `GET /health` returns
   `{"status":"ok"}`. This confirms nothing in the default path depends on
   commerce-api.
3. Start ai-service with `COMMERCE_API_URL=ftp://x` and confirm it exits 1,
   naming the variable without the value.
4. Inspect one tool log line from the live test run. Confirm there are no
   args, bodies or URLs, and that commerce-api's log for the same call
   carries the same `correlation_id`.

## Not covered

- **Real model tool selection quality**, meaning whether a real LLM picks the
  right tool or honours the prompt. There is no provider (CLAUDE.md). The
  provider phase must add evaluation.
- **Concurrent turns against one cart** beyond commerce-api's own
  `CART_CONFLICT` tests. The mapping is tested, but real concurrency is not.
- **Performance and load**. Local, single-user, and bounded by the limits.
- **Order creation**. Deferred.
- **`apps/web` seeing agent changes live**. Phase 15.
