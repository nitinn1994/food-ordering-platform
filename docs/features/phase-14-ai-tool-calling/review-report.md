# Review Report — Phase 14: AI Tool Calling → Commerce API

**Reviewed:** `requirements.md` (AC1–AC27), `plan.md` (including its "As
built" section) and `test-plan.md` first. Then every changed and new file:
25 modified and 25 new, all under `apps/ai-service/`, `docs/` and this
feature folder. `uv.lock` was checked through `uv sync --locked`, not line
by line. The generated `ai_service/contracts/api_contracts.py` was checked
through its drift test, not field by field.

There were two passes:

- **My own.** I implemented the phase, so this is a self-review.
- **An independent `implementation-reviewer` agent.** It re-ran
  `uv run pytest` (595 passed, 2 skipped), `ruff check`,
  `ruff format --check` and `mypy` itself. It traced the routing and limits
  by hand, read every error-mapping path against plan §11/§12, and
  cross-checked `docs/api/ai-service.md` and ADR-0021 against the code.

Finding 1 was found by both passes and confirmed by running code. The other
findings were found by reading and are labelled with who found them.

**Path:** Full

## Verdict

Sound, and within the approved scope. There is no BLOCKER or HIGH finding.
**Findings 1–5 and note 7 were fixed after the review, at the human's
request** (see each row). Finding 3 was fixed after the security review, as
its S1.

- **One MEDIUM** (finding 1): a gap in the client's exception
  classification. It is safe (the turn fails closed, and nothing leaks), but
  it contradicts AC8's "each failure class maps to one typed client error".
  Fix it, or accept it explicitly.
- **Findings 2–5 are LOW**, test hygiene and a model-output edge case.
- **The rest are notes.**

AC1–AC26 are met in code and tests. AC27 is not fully met because the live
check is unexecuted (Docker unavailable), as `/final-review` recorded. That
is a validation gap, not a code finding. **Update (after the security
review):** the live check and manual checks 1 and 4 have since been run and
passed. See "Not reviewed" below.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM — **FIXED** (after review, at the human's request) | `apps/ai-service/ai_service/clients/commerce/client.py:132-145` (`_send`) | `httpx.DecodingError` is not caught. It is a `RequestError` but **not** a `TransportError` (its MRO is `DecodingError → RequestError → HTTPError`). **Confirmed by probe:** a 200 response with `Content-Encoding: gzip` and a body that is not gzip escapes `CommerceClient.get_menu()` as a raw `httpx.DecodingError`. It is not a `CommerceClientError`, so `ToolService.execute` does not convert it, and the whole turn fails with `AGENT_FAILED` instead of the model receiving `COMMERCE_BAD_RESPONSE`. It is safe: only the class name is logged, and nothing reaches the model or the caller. It is also unlikely, because commerce-api does not compress responses. But it contradicts AC8/AC12 and plan §12 ("every failure class"). `httpx.TooManyRedirects` is the only other non-transport `RequestError`, and it cannot occur because redirects are not followed. Found by both passes. | Catch `httpx.DecodingError` in `_send` and raise `CommerceBadResponseError` from `None`. A response did arrive, so the outcome is known and the "call get_cart to check" message is right, even for a write. Add it to `test_commerce_client.py`, as a raised exception and as a real bad-gzip response, and add one row to `test_tool_service.py`'s `MAPPING`. **Done:** `_send` catches `httpx.DecodingError` and raises `CommerceBadResponseError` from `None`. `test_an_undecodable_response_is_a_bad_response` (a gzip-labelled stream that is not gzip, for all five operations: bad response, not retried, no sentinel) and `test_a_raised_decoding_error_is_a_bad_response` were written first. They failed (10 failures, plus 1 in `test_tool_service.py`'s new `MAPPING` row) and pass with the fix. The `CommerceBadResponseError` docstring and the `COMMERCE_BAD_RESPONSE` row in `docs/api/ai-service.md` now include "could not be decoded". |
| 2 | LOW — **FIXED** (at the human's request) | `apps/ai-service/tests/test_main.py:123-150` | Two new tests do not test what their names say. `test_the_default_app_builds_its_own_client_and_connects_to_nothing` passes `commerce_http_client=`, so it never reaches the `build_commerce_http_client(settings)` branch in `main.py`. It does verify AC22 correctly. `test_each_app_gets_its_own_commerce_client` asserts only `first is not second`, which is true of any two objects. The "default app builds its own client" path is exercised only incidentally, by `test_docs_toggle.py` and `test_agent_api.py` building default apps. Found by both passes. | Rename the first (for example `…_default_model_never_calls_commerce`). Replace the second with a test that builds the app without an override, enters and leaves `TestClient`, and asserts the app's own client was created from settings and closed. That needs a way to reach it, such as keeping the client on `app.state`. Or delete the second test. **Done without a production change:** the first test is renamed `test_the_default_model_never_calls_commerce_api`. The second is replaced by `test_each_default_app_builds_its_own_client_and_closes_it`, which records the clients `create_app` builds through the real `build_commerce_http_client` (monkeypatched to record only). It asserts two distinct clients, both built from the settings' URL, open while serving and closed on shutdown. It fails when the lifespan stops closing the client, and passes with it. |
| 3 | LOW — **FIXED** (as security review S1, at the human's request) | `apps/ai-service/ai_service/agents/nodes.py` (`make_execute_tools`) | The per-turn cap bounds *executions*, not *answers*. A model message with N tool calls produces N tool messages and N `ai_service.tools` log lines, whatever N is. Calls past 8 are refused, and `invalid_tool_calls` are not counted at all. No HTTP happens past the cap, so there is no commerce effect. But the work and log volume scale with model output. It is bounded in practice by a provider's output-token limit, and the simulated model emits none. Found in my pass, by reading. | When a message carries more than, say, 2 × `MAX_TOOL_CALLS_PER_TURN` calls (valid plus invalid), treat it as unusable model output: raise `AgentOutputError`, which gives `AGENT_FAILED`, instead of answering each one. Or accept it and revisit in the provider phase. **Done:** see `security-review.md` S1. |
| 4 | LOW — **FIXED** (at the human's request) | `apps/ai-service/tests/test_live_commerce.py` (`_round_trip`, `finally`) | If `add_cart_item` or `set_cart_item_quantity` fails, the `finally` block's `remove_cart_item` can raise its own `CART_ITEM_NOT_FOUND`, which hides the original failure. For example, the add fails, so the item was never added, so the remove raises. The test would still fail, but with a misleading error. It is unexecuted (Docker), so this is from reading only. Found in my pass. | Track whether the add succeeded and remove only then, or catch `CommerceApiError` with code `CART_ITEM_NOT_FOUND` inside the `finally`. **Done:** the add runs before the `try`, so a failed add is reported as itself and nothing is cleaned up. Still unexecuted (Docker). |
| 5 | LOW — **FIXED** (at the human's request) | `apps/ai-service/tests/test_generated_contracts.py`, `tests/commerce_fakes.py` | The same menu and cart fixtures are defined twice (already listed as follow-up in `plan.md` "As built"). | `test_generated_contracts.py` imports `MENU`, `CART`, `MENU_ITEM` and `CART_LINE` from `commerce_fakes`. **Done**, and its 16 tests still pass. |
| 6 | NOTE | `apps/ai-service/ai_service/agents/prompts.py` | The prompt says `"ok": true`, but `ToolResult.to_content()` emits compact JSON (`"ok":true`). A model will read them as the same. The prompt test pins the prompt's wording, not a match with the output. | None needed. If it matters for a provider, quote it as `ok: true`. |
| 7 | NOTE — **FIXED** (at the human's request) | `docs/api/ai-service.md` §7 | It says `commerce_status` is "the HTTP status of a failed call, otherwise `null`". A failed call with no HTTP response (connect error, timeout) also logs `null`. | Say "the HTTP status, when a failed call got a response". **Done.** |
| 8 | NOTE | `docs/development/getting-started.md:104` | The TypeScript test counts ("815 tests", "277 web") are stale: `/validate` measured 842 and 304. This predates Phase 14; no TypeScript changed. | Update the counts in a separate, docs-only change. |
| 9 | NOTE | `apps/ai-service/ai_service/agents/service.py` | `tool_calls` and `tool_rounds` are logged only for successful turns (documented in "As built"). A failed turn, including a round-limit breach, cannot say how many tools ran. The `ai_service.tools` lines with the same `request_id` can. | None now. If it matters for operations, `AgentService` could stream graph updates to count them, which is a larger change. |

Severity: `BLOCKER` (must fix) · `HIGH` (fix before merge) · `MEDIUM` (should
fix) · `LOW` (optional) · `NOTE` (observation, no action).

## Areas checked and found clean

Both passes agree on these:

- **Error classification** apart from finding 1. Never sent → unavailable,
  even for writes. Lost after sending → outcome unknown for writes and
  unavailable for reads. 5xx → unavailable. A 4xx `ContractError` → status
  and code. Anything else → bad response. Each path has a test, and the
  mutation checks showed the tests fail when the classification is wrong.
- **Error mapping and messages** match plan §12. commerce-api's text, raw
  arguments and unregistered tool names never reach `ToolResult` or a log.
  The sentinel tests in `test_tool_logging.py` and `test_agent_tool_loop.py`
  are genuine.
- **Routing and limits.** The fifth tool-requesting message goes to
  `finalize_reply`, then `AGENT_FAILED`. Calls 9 and up are refused and
  never run. Calls within a message run sequentially (a real overlap test).
  Every call id is answered exactly once.
- **SSRF and injection surface.** No tool or client method can express a
  URL, method, header or path. Item ids are validated twice, and strictly.
  Redirects are not followed. Environment proxies are ignored. The base URL
  comes from validated configuration only.
- **Configuration.** The URL validation rejects every malformed form with
  the error type only, never the value, and the URL is required in
  production.
- **Lifecycle.** One client per app, never built at import time, closed on
  shutdown.
- **Boundary tests.** Each new rule has positive and negative cases and was
  shown to fail on probe files.
- **Docs.** `docs/api/ai-service.md`, ADR-0021, the README and
  `system-architecture.md` match the code (apart from note 7).

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `apps/ai-service/pyproject.toml`, `uv.lock` | 14.1 (dependencies), 14.4 (description) | yes |
| `apps/ai-service/scripts/generate_contracts.py`, `ai_service/contracts/*` | 14.1 | yes |
| `apps/ai-service/tests/test_generated_contracts.py`, `tests/test_boundaries.py` | 14.1 | yes |
| `apps/ai-service/ai_service/config.py`, `.env.example`, `tests/test_config.py` | 14.2 | yes |
| `apps/ai-service/ai_service/clients/**`, `tests/commerce_fakes.py`, `tests/test_commerce_client.py`, `tests/test_live_commerce.py` | 14.2 | yes |
| `apps/ai-service/tests/test_docs_toggle.py` | 14.2 (required by AC4's "required in production") | yes, documented in "As built" |
| `apps/ai-service/ai_service/tools/**`, `tests/test_tool_*.py` | 14.3 | yes |
| `apps/ai-service/ai_service/agents/{prompts,nodes,graph,service}.py`, `llm/simulated.py`, `main.py` | 14.4 | yes |
| `apps/ai-service/tests/{conftest,fakes,test_agent_graph,test_agent_nodes,test_agent_service,test_simulated_model,test_main,test_agent_tool_loop}.py` | 14.4 | yes |
| `apps/ai-service/README.md`, `docs/api/*.md`, `docs/architecture/*.md`, `docs/development/getting-started.md` | 14.5 | yes |
| `docs/features/phase-14-ai-tool-calling/*` | planning and review records | yes |

Nothing under `apps/web`, `apps/commerce-api` or `packages/` changed (`git
status`). No unrelated refactor or reformat was found by either pass.

## Not reviewed

- **The opt-in live check** (`tests/test_live_commerce.py`) and manual
  checks 1 and 4 were not executed at review time, because commerce-api
  needs PostgreSQL through Docker, which was not running. Their code was
  read (see finding 4). **Update:** 2026-09-26, once Docker was available: `db:up`, `db:migrate` (already up to date), `db:seed`, `dev`, then the live check: 2 passed. The shared cart was exactly as before (its one existing line untouched). A live end-to-end turn (scripted model, real stack, real commerce-api) calling `get_menu` and `get_cart` returned 200 with both results `ok`, and commerce-api's log lines for both calls carried the turn's `correlationId`.
- **The generated models** were verified by the drift test, not diffed by
  hand against the JSON Schema.
- **The dependency tree** added by `datamodel-code-generator` (12 dev-only
  packages) was not audited for supply-chain risk, beyond confirming it is
  dev-only and import-forbidden in service code.
- **Real-provider behaviour of `bind_tools`** with dict schemas (assumption
  S2) is deferred to the provider phase by the plan.
- **The dedicated security review** the plan requires (Full path) is **not**
  replaced by this report. This review's security pass covered the SSRF,
  injection, logging and guard surfaces above, but `security-review.md`
  remains to be done, as for Phase 13.
