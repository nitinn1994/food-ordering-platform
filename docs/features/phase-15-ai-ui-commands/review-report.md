# Review Report — Phase 15: AI → UI Commands & Business Intent Integration

**Reviewed:** `requirements.md` (AC1–AC21), `plan.md` (§1–§29, Assumptions,
"As built") and `test-plan.md`, then the full working-tree diff (46 tracked
files, +2021/−384) and every untracked new file. Two passes: the implementer's
self-review, and an independent read-only `implementation-reviewer` agent that
re-ran the validation commands itself. Both reached the same verdict.
**Path:** Full

## Verdict

Sound. The implementation matches the approved plan and its recorded "As
built" deviations. All 21 acceptance criteria are met by the code and backed
by tests. There are no BLOCKER, HIGH or MEDIUM findings. The remaining items
are LOW maintainability points and NOTEs. The specialised security review
that the plan requires (Full Path) is still outstanding. This review does not
replace it.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | LOW | `docs/development/getting-started.md:77-78` | The wording is awkward and partly redundant: "Earlier, as of 2026-09-26 (Phase 11): Phase 11 added two workspace dependencies…". It reads like an editing seam. | Rephrase: "Phase 11 (verified 2026-09-26) added two workspace dependencies…". |
| 2 | LOW — **superseded by `security-review.md` S1 (HIGH)**: the runtime probe showed this logic is not correct; the unit tests passed only because they build the request from the raw URL. **Fixed** by restoring the Phase 11 middleware | `apps/web/src/middleware.ts:12-16` | Middleware picks one predicate (AI or commerce) based on whether *either* path form looks like `/api/ai`, then applies it to both forms. Both reviewers traced mismatch cases (`/api/commerce/v1/../ai/…`, `/api/ai/v1/agent/../../health`, encoded variants) and every one is rejected. It is correct, but it takes a moment's thought to see why. | Optionally restructure as "each form must satisfy the predicate that matches its own prefix, and both forms must agree on the prefix". Or leave it, with a comment spelling out the argument. |
| 3 | LOW | `packages/contracts/ui-commands/src/agentTurn.ts:56`; `apps/ai-service/ai_service/ui_commands/service.py:38` | Small duplications. There is now a third copy of `formatIssues` (kept deliberately so AC2 could leave `parse.ts` unchanged, and `agent-intents` already duplicates it). `UNREGISTERED_TOOL` and `_declared_field` exist in both `tools/service.py` and `ui_commands/service.py`. | Later: export `formatIssues` from `@contracts/common`, and move the two tool helpers into `tools/results.py`. That is a separate change, because it touches files AC2 froze. |
| 4 | LOW | (recorded in `plan.md` "As built") | Three follow-ups the implementer already recorded, not fixed: an unknown `categoryId` filters the menu to empty; `errors.ts` `describe()` says "Commerce API" for agent turns; there is no agent-specific "assistant unavailable" copy. | Keep them as follow-ups. None affects correctness or security. |
| 5 | NOTE | `apps/ai-service/ai_service/api/agent.py:34` | The route builds `AgentTurnResponse` outside `AgentService`'s `try`. If that ever raised, the last-resort handler would log a traceback containing the reply (the ADR-0019 S2 concern). It was verified not to raise: the reply constraints are identical (both come from the generated model), and Pydantic does not re-validate the already-built `UiCommandBatch` (`revalidate_instances` is `never`). This is a latent hazard only if that invariant changes. | None now. If `AgentResult` and the response model ever diverge, build the response inside the service's `try`. |
| 6 | NOTE | `apps/web/next.config.ts:40-47`, `src/middleware.ts` | Case-sensitivity of the rewrite and matcher (for example `/API/AI/v1/agent/turns`) was not exercised against a running Next server. The reasoning says it is safe: the rewrite `source` is one exact path with a fixed destination, so even a case-insensitive match reaches only `/v1/agent/turns`. Middleware fails closed for any uppercase path it sees. **Uncertain** until probed at runtime. | Cover it in the security review with a runtime probe. |
| 7 | NOTE | `apps/web/src/lib/agent/agentService.ts:14` | The client timeout (30 s) equals Next's proxy default (30 s), so they race at the limit. Either way the user sees fixed copy, and the cart is still re-read. | None. Revisit when a real provider changes the latency profile. |
| 8 | NOTE | `apps/ai-service/ai_service/llm/simulated.py` | Typing `add <item>` in the chat now changes the real shared cart (approved, OD6). The manual check confirmed it end to end, and that a failed add sends no UI command. | None. It is documented in ADR-0022 and `getting-started.md`. |
| 9 | NOTE | `docs/development/getting-started.md` (web layout block); `docs/architecture/system-architecture.md` (header) | Pre-existing staleness that this phase did not cause, already recorded as follow-ups. | Refresh in a docs pass. |

Severity: `BLOCKER` (must fix) · `HIGH` (fix before merge) · `MEDIUM` (should
fix) · `LOW` (optional) · `NOTE` (observation, no action).

### Checklist results

- **Requirements:** AC1–AC21 each satisfied (walked against code and tests;
  see the phase reports in the conversation and the agent's AC walk).
- **Conventions:** follows the existing patterns. The proxy reuses ADR-0018
  (rewrite, middleware and the one API client), the presentation registry
  mirrors the Commerce registry, and generation extends the existing
  generator. No second way of doing an existing thing was introduced.
- **Correctness:** there are ordering guarantees in ai-service (commands
  collected only in `finalize_reply`) and in web (refresh awaited before
  commands are applied, with mutation-tested proof). Empty and null cases are
  covered: zero commands omits the key, and `dispatchBatch(null)` returns
  `[]`. An unreadable tool result is never treated as success
  (`_outcome()`).
- **Error handling:** no failure is swallowed. Agent errors map to fixed copy
  by kind and code, and the backend message never renders. Tool failures are
  data. A contract violation in the batch becomes `AGENT_FAILED`, never a
  traceback.
- **Tests:** the failure paths are covered, not just the happy path: invalid
  and smuggled arguments, limit overflow, bad envelopes, a failed add,
  network, 500, timeout, double submit. Three guards were mutation-checked
  and shown to fail: schema freshness, the `ui_commands` import boundary, and
  refresh ordering.
- **Security:** the input-trust boundary holds at every layer reviewed, with
  finding 6 open for runtime confirmation. The specialised security review
  is still required.
- **Performance:** not a hot path. It adds one request per turn and one cart
  GET. NOT_APPLICABLE beyond finding 7.

## Scope check

| Changed file(s) | Serves plan phase | In scope? |
| --------------- | ----------------- | --------- |
| `packages/contracts/ui-commands/src/agentTurn.ts`, `agentTurn.test.ts`, `index.ts`, `scripts/emit-schema.ts`, `schema/agent-turn-*.v1.json` | 1 — Contract | yes |
| `apps/ai-service/scripts/generate_contracts.py`, `ai_service/contracts/{ui_commands,agent_intents}.py`, `ai_service/schemas/agent.py`, `tests/test_generated_contracts.py` | 2 — Python generation | yes |
| `apps/ai-service/ai_service/api/agent.py` | 2 (`exclude_none`) and 3 (the `uiCommands` field) | yes |
| `apps/ai-service/ai_service/{tools/intents.py,tools/registry.py,tools/service.py}`, `ui_commands/*`, `agents/{state,nodes,graph,service,prompts}.py`, `llm/simulated.py`, `main.py` | 3 — ai-service | yes |
| `apps/ai-service/tests/test_{ui_command_tools,business_intents,agent_ui_commands,boundaries,agent_graph,agent_nodes,agent_service,agent_state,agent_tool_loop,main,simulated_model,tool_logging}.py`, `commerce_fakes.py`, `conftest.py` | 3 — ai-service tests and call sites | yes |
| `apps/web/next.config.ts`, `.env.example`, `src/middleware.ts`(+test), `src/lib/api/{config,proxyPath,userMessages}.ts`(+tests), `src/lib/agent/*`, `src/lib/commands/dispatch.ts`(+test), `src/components/chat/ChatInput.tsx`(+test); `src/lib/commands/simulate.ts` deleted | 4 — Web integration | yes |
| `docs/api/{ai-service,contracts}.md`, `docs/architecture/{system-architecture,architecture-decisions}.md`, `docs/development/getting-started.md`, `apps/ai-service/README.md`, `docs/features/phase-15-ai-ui-commands/*` | 5 — Docs (AC20) | yes |

No unattributable change. No refactors, renames, dependency changes or drive-by edits.

## Not reviewed

- **Accuracy of every doc sentence against the code.** It was spot-checked,
  not verified line by line. AC20 designates the docs as a human read.
- **The manual end-to-end checks** were not re-run by the independent
  reviewer. The implementer ran them in Phase 5 (all five passed, with one
  correction folded into ADR-0022).
- **Next.js case-sensitive routing at runtime** (finding 6). It was reasoned
  about, not probed.
- **Line-by-line diffs of the call-site-only test edits** (`commerce_fakes.py`,
  `conftest.py`) were spot-checked; the full suite passes.
- **A real model provider's behaviour** is not reviewable: none exists.
