# Test Plan — Phase 15: AI → UI Commands & Business Intent Integration

## What will be tested

| AC | How it is verified | Type |
| --- | --- | --- |
| AC1 | `ui-commands` `schema.test.ts` regenerates both new JSON Schemas in memory and compares them with the committed files. It is corrupted once during implementation to prove it fails. | automated |
| AC2, AC3 | `git diff --stat` on the listed files is empty. `commands.test.ts` still pins `UI_COMMAND_TYPES`. `intents.test.ts` still pins `AGENT_INTENT_TYPES`. | automated + diff check |
| AC4 | `agentTurn.test.ts`: the full accept/reject matrix in `requirements.md` AC4 | automated |
| AC5 | `test_generated_contracts.py` renders each of the three modules and compares it with the committed file. Generated `ui_commands.py` models are checked against the committed JSON with `jsonschema`, using the same valid and invalid fixtures as AC4. | automated |
| AC6 | `test_agent_api.py`: existing 400/405/413/415/500 tests unchanged. New tests: a 200 body validates against `agent-turn-response.v1.json`; `uiCommands` is absent when there are no commands; `correlationId` equals the `X-Correlation-Id` header; `issuedAt` matches the contract pattern. | automated |
| AC7 | `test_ui_command_tools.py`: the bijection with the TS `UI_COMMAND_TYPES` list (read from committed JSON); valid arguments for each tool; rejections for an extra key (`execute`), a wrong type, a non-slug id, and a query over 200 characters, none of them recorded; `ToolMessage` content is only `{"ok":true}` | automated |
| AC7, AC8 | `test_boundaries.py`: `ai_service/ui_commands/` does not import `clients.commerce`. The Commerce registry names and routes are unchanged. Building the graph with overlapping names raises. | automated |
| AC9 | `test_business_intents.py`: the write-tool ↔ intent bijection; input fields equal intent fields minus `type`; each intent reaches exactly its client method or route (fake transport); read tools have no intent. `test_tool_logging.py`: the log line has `intent`, never arguments. | automated |
| AC10 | `test_agent_ui_commands.py` with `SequencedChatModel`. (a) Write then UI in separate rounds: the command is in the response, in order. (b) Write and UI in the same message: the command is present, and the fake shows the write ran first. (c) Several UI calls keep their order. | automated |
| AC11 | 9 calls in a turn (UI and commerce mixed): the 9th is refused and not recorded, and the response has ≤8 commands | automated |
| AC12 | A raising model, and a model that requests tools after the round limit: the 500 body is `ContractError` only | automated |
| AC13 | `test_simulated_model.py` plus an API test on the fake commerce transport. `add tiramisu`, OK → `OpenCartPanel{open:true}`. `add tiramisu` returning `MENU_ITEM_UNAVAILABLE` → no `uiCommands`, and a reply with no success wording. `add <unknown>` returning `MENU_ITEM_NOT_FOUND` → no `uiCommands`. Also: the reply never contains the input text, and each ported `simulate.ts` phrase → the expected command. | automated |
| AC14 | `ChatInput.test.tsx` (stubbed `fetch`): the reply is shown, and `<b>x</b>` renders literally; commands are applied in order (category selected, then panel open); a bad command among good ones drops alone and is logged; a bad envelope logs one rejection and applies nothing. `dispatch.test.ts`: `dispatchBatch` maps each of the five commands to its action. | automated |
| AC15 | `ChatInput.test.tsx`: a cart GET is issued after a 200, after a 500, and after a network error. On a 200 with `OpenCartPanel`, the cart GET resolves before the panel opens. | automated |
| AC16 | `ChatInput.test.tsx`: Send is disabled while in flight, and a double submit sends one request; a 500 or timeout shows fixed copy, not the body's message. `agentService.test.ts`: no retry (one fetch on a 503), a 30 s timeout, and `invalid-response` on a malformed body. | automated |
| AC17 | `config.test.ts`: the rewrite list holds exactly one `/api/ai` source, an exact path with a fixed destination (no wildcard), and the default URL. `middleware.test.ts` (unchanged from HEAD) still pins the matcher to the commerce proxy only. The 404 for every other `/api/ai/*` path (dot segments, encoded, double-encoded, backslash, `;`, `/health`, `/docs`) is verified by a **live probe** through `next dev` with recording stand-ins, because middleware unit tests cannot reproduce runtime URL normalization (`security-review.md` S1). *(Revised after the security review. The original plan named `proxyPath.test.ts` and middleware AI cases, which were removed with the S1 fix.)* | automated + live probe |
| AC18 | `pnpm turbo run lint` (agent-intents import ban, no-eval rules). The existing dispatch/cartStore import test. | automated |
| AC19 | `grep -r simulate apps/web/src` returns nothing, and `typecheck` passes | automated |
| AC20 | Reviewer reads the listed documents | manual |
| AC21 | The validation commands below, with results reported as PASS/FAIL/SKIPPED/NOT_CONFIGURED | automated |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| agentTurn matrix | AC4 | `packages/contracts/ui-commands/src/agentTurn.test.ts` (new) |
| schema freshness (+2 artifacts) | AC1 | `packages/contracts/ui-commands/src/schema.test.ts` |
| generated modules drift and conformance | AC5 | `apps/ai-service/tests/test_generated_contracts.py` |
| presentation tools | AC7, AC11 | `apps/ai-service/tests/test_ui_command_tools.py` (new) |
| intent mapping | AC9 | `apps/ai-service/tests/test_business_intents.py` (new) |
| combined, failure and ordering flows | AC10–AC13 | `apps/ai-service/tests/test_agent_ui_commands.py` (new) |
| response shape | AC6, AC12 | `apps/ai-service/tests/test_agent_api.py` |
| state keys (+`ui_commands`) | §19 | `apps/ai-service/tests/test_agent_state.py` |
| simulated model table | AC13 | `apps/ai-service/tests/test_simulated_model.py` |
| boundaries | AC7, AC8 | `apps/ai-service/tests/test_boundaries.py` |
| tool log `intent` field | AC9 | `apps/ai-service/tests/test_tool_logging.py` |
| agent service | AC16 | `apps/web/src/lib/agent/agentService.test.ts` (new) |
| batch dispatch | AC14 | `apps/web/src/lib/commands/dispatch.test.ts` |
| chat flow | AC14–AC16 | `apps/web/src/components/chat/ChatInput.test.tsx` (new) |
| AI proxy rewrite | AC17 | `apps/web/src/lib/api/config.test.ts` (the middleware and proxy-path AI tests were removed with the S1 fix) |
| config, user messages | AC16, AC17 | `apps/web/src/lib/api/config.test.ts`, `userMessages.test.ts` |

## Validation commands

These are only commands the repository declares (`docs/development/getting-started.md`).

| Check | Command | Expected |
| --- | --- | --- |
| contract schema regen | `pnpm --filter @contracts/ui-commands build` | PASS, no diff after the second run |
| types (TS) | `pnpm turbo run typecheck` | PASS |
| lint (TS) | `pnpm turbo run lint` | PASS |
| test (TS) | `pnpm turbo run test` | PASS |
| build (TS) | `pnpm turbo run build` | PASS (the pre-existing turbo `no output files found` warnings for contracts are expected) |
| Python codegen | `cd apps/ai-service && uv run python scripts/generate_contracts.py` | PASS, no diff after the second run |
| test (Py) | `uv run pytest` | PASS |
| lint (Py) | `uv run ruff check .` | PASS |
| format (Py) | `uv run ruff format --check .` | PASS |
| types (Py) | `uv run mypy` | PASS |
| live commerce (optional) | `AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 uv run pytest tests/test_live_commerce.py` | PASS if commerce-api is running, otherwise SKIPPED with the reason stated |

CI: NOT_CONFIGURED (no `.github/workflows`).

## Manual checks

These need commerce-api (`db:up`, `db:migrate`, `db:seed`, `dev`), ai-service
(`uv run python -m ai_service`) and web (`pnpm --filter web dev`).

1. "show me the desserts": the desserts category is selected, and the command
   log shows `accepted: ShowMenuCategory`.
2. "add tiramisu": Tiramisu appears in the cart panel from commerce-api, and
   the panel opens.
3. Mark an item unavailable, or use an id that doesn't exist, then "add
   <item>": the reply explains the failure, no command runs, and the cart is
   unchanged.
4. Stop ai-service, then send a message: friendly error copy, and the page
   still works.
5. `curl` `http://127.0.0.1:3000/api/ai/health` and `/api/ai/docs`: both 404.

## Not covered

- **A real LLM's choice of commands.** There is no provider yet. Scripted and
  simulated models exercise every code path, but the quality of a real
  model's command selection is judged in the phase that adds a provider.
- **Browser-level E2E automation.** None is configured in the repository.
  The manual checks above stand in for it.
- **Concurrency across browser tabs** sharing the one cart. This is existing
  behaviour (ADR-0015), and nothing in it changes.
