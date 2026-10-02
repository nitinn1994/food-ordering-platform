# Review Report — mcdelivery-redesign (Phases 3–5)

**Reviewed:** `requirements.md`, `plan.md` (Phases 3–5, approved 2026-10-01)
and `test-plan.md`, ADRs 0025–0027, and the Phase 3–5 diff:
- Phase 3: the nudge contract and commerce-api's `nudges` module.
- Phase 4: `ShowNudge`, ai-service's `get_nudges` and `show_nudge`, and the
  web nudge surfaces.
- Phase 5: `AgentTurnProvider` and `VoiceShell`.

Two reviewers read it: the implementer, and independently the read-only
`implementation-reviewer` agent. Findings were merged, and the BLOCKER was
reproduced with a temporary probe test (since deleted). Validation evidence
comes from the 2026-10-01 full `/validate` run. Phases 1–2 are covered by
`review-report.md`.
**Path:** Full

## Verdict

**Not ready.** One BLOCKER: a mismatched or failing `ShowNudge` puts the web
app into an unbounded request loop. Two MEDIUM defects let a spoken "yes"
act on a suggestion that is no longer the one on screen. Phase 3 (contract,
engine, endpoint) is sound. All checks pass, but none of the tests cover
these paths.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | **BLOCKER** | `apps/web/src/components/nudges/NudgeToast.tsx` (ShowNudge effect, deps `[requestedNudge, logCommand, session]`), `apps/web/src/lib/state/uiStore.tsx:136-152` | `useUi()` rebuilds its value, including `logCommand`, on every uiStore change, and `requestedNudge` stays set after it is handled. So the ShowNudge effect re-runs on *any* UI state change. **Reproduced:** one mismatched `ShowNudge` made **51** `GET /v1/nudges?surface=voice` requests in 300 ms. `ignore()` → `logCommand` → state change → new `logCommand` → effect → fetch → `ignore()` again. It only stopped because the stub ran out of replies. A failing fetch loops the same way. A *matching* request also re-fetches, and re-arms the spoken-yes window (see #2), on every later search, category change or item-detail open. The Phase 4 test only checked that "rejected" appeared once. | Process each request exactly once: keep the last handled `requestedNudge.sequence` in a ref, and read `logCommand` through a ref, or make `UiProvider`'s action functions stable. Add tests: exactly one voice-nudge fetch and one log entry per request, and none after an unrelated UI change. |
| 2 | MEDIUM | `apps/web/src/components/nudges/NudgeToast.tsx` (`setSpokenNudge`, `closeToast`, no unmount cleanup), `apps/web/src/components/voice/VoiceShell.tsx` (`submit`) | The one-utterance "yes/no" window can outlive the offer on screen. (a) Only a *spoken* utterance consumes it: a typed chat turn or a tapped prompt leaves it armed. (b) The toast has no unmount cleanup, so after navigating to `/cart` a later "yes" adds an item that is no longer shown. (c) Found by the implementer: when a post-add nudge replaces a spoken one in the toast, the spoken handle still points at the *old* item, so "yes" adds something other than what is displayed. (#1 also re-arms the window.) This breaks AC-V4's "the window ends after one utterance" and the rule that a spoken action matches the screen. | Clear the spoken slot: on toast unmount, whenever the toast shows a different nudge, and on every `turn.submit` (typed, tapped or spoken). Or key the handle to the displayed nudge id and check the id on use. Add tests for each case. |
| 3 | MEDIUM | `apps/web/src/components/nudges/NudgeToast.tsx` (spoken `accept`), `VoiceShell.tsx` (reply copy) | A spoken "yes" calls `addItem` even while another cart operation is in flight. `NudgeCard`'s Add button is disabled then, and `cartStore.mutate` silently drops a concurrent call. The shell still says "Adding X to your cart." and closes the item for the session, so in that race nothing is added and the offer is used up. | Gate the spoken accept on `pending === null`. If it can't act, keep the offer open and reply with fixed copy such as "One moment — still updating your cart." Base the spoken confirmation on whether the add was actually started. |
| 4 | LOW | `apps/web/src/components/voice/VoiceShell.tsx` (`openSheet` `useCallback(…, [])`) | It captures the first render's `voice.start`. That's safe today, because `start` reads only refs, but it is fragile if `useVoiceSession` ever reads state in `start`. | Call it through a ref (`startRef.current = voice.start` each render). |
| 5 | LOW | `apps/web/src/components/voice/VoiceShell.tsx` (exchange block) | The sheet's `role="status"` announces only "Listening… / Processing… / Speaking…". The assistant's reply text is not in a live region. It is spoken aloud and shown in the chat transcript, but a screen-reader user who muted the reply ("Don't read reply aloud") gets no announcement in the sheet. | Make the exchange block `aria-live="polite"`, or announce the reply through the status line. |
| 6 | LOW | `apps/web/src/lib/nudges/nudgeSession.ts` (`decideOffer`, `loadNudgeSession`) | A spoken offer skips the cap but still records the item, so it uses up a slot for later unprompted nudges. That is arguably intended, but undocumented. `loadNudgeSession` does not validate the *values* in `offered`; corrupt storage only causes odd behaviour. | Document the slot behaviour in the comment. Validate `offered` values against the surface set. |
| 7 | LOW | `apps/web/src/components/voice/VoiceShell.tsx` (`SUGGESTED_PROMPTS`) | The prompts are tuned to the simulated model. "Find burger" works on both menus, but the simulated "desserts" category does not exist in the demo menu (`sweets`). This was already recorded as a follow-up. | Revisit with a real model, or align the simulated table with the demo menu. |
| 8 | NOTE | `apps/ai-service/ai_service/llm/simulated.py`, ADR-0026 | ai-service cannot see web-side dismissals, so it may speak a suggestion the customer dismissed, and the screen then shows nothing. Already recorded as a follow-up. | — |
| 9 | NOTE | `apps/ai-service/ai_service/tools/schemas.py` (`GetNudgesInput.surface`, `strict=False`) | This is the one field-level relaxation of the strict tool inputs. It is needed because strict mode rejects the enum's string value, a real bug the full-turn test caught. It still accepts only the contract's four values (tested). Documented in `docs/api/ai-service.md`. | — |

**Verified correct (both reviewers):**
- **Contract (Phase 3):**
  - `nudgesQuerySchema` is strict.
  - Repeated `surface` parameters, unknown keys and a malformed `itemId` all
    get 400 `INVALID_PAYLOAD` (HTTP e2e).
  - The response allows at most one nudge.
  - The nudge id is shared through `@contracts/common`.
- **Engine:**
  - It is pure.
  - Eligibility excludes unavailable items, items already in the cart, and
    the focus item.
  - At most one nudge, and deterministic ranking.
  - Plain-copy checks cover every rule.
  - The breakfast window uses Asia/Kolkata time.
  - The prices are the live menu's (AC-N1–N4).
- **Read-only endpoint:** `GET /v1/nudges` leaves the cart unchanged (e2e).
  Accepting a nudge uses `POST /v1/cart/items` (AC-N6).
- **Web shows only commerce-api's nudges:** `ShowNudge` carries only an id;
  the web re-fetches and shows only a matching offer (AC-V1). A failed or
  absent fetch shows nothing.
- **Simulated assistant:** it speaks the headline only when `show_nudge`
  succeeded. It confirmed live: reply and commands matched the web's own
  lookup (AC-V2).
- **Voice shell:**
  - The disclosure comes before the first microphone press.
  - Escape closes the sheet and returns focus.
  - Unsupported browsers get no microphone.
  - Phase 16's voice tests are unchanged and passing (AC-V3, V5, V6).

## Acceptance criteria status (Phases 3–5)

| AC | Status | Evidence / gap |
| -- | ------ | -------------- |
| AC-N1–N4 | Met | Engine unit tests, HTTP e2e, Postgres e2e on the demo menu |
| AC-N5 guardrails | Partly met | Session caps and copy rules are tested. #2 and #3 let a stale or racing spoken accept slip through. |
| AC-N6 accept path | Met | `NudgeCard` and the spoken accept both use `addItem`, then the cart re-reads |
| AC-V1 ShowNudge | **Not met in practice** | Validation logic is correct, but the effect loops (#1) |
| AC-V2 AI tool | Met | pytest, plus the live end-to-end turn |
| AC-V3 voice shell | Met | VoiceShell tests, plus a desktop browser check |
| AC-V4 yes/no | **Not met** | Resolver and basic flow are tested; the window is not one utterance (#1, #2) |
| AC-V5 unsupported | Met | Test |
| AC-V6 ADR-0023 kept | Met | Existing voice tests unchanged |
| AC-R1 full checks | Not met (pre-existing) | Everything passes except `pnpm audit` (brace-expansion; lockfile unchanged) |
| AC-R2 docs and ADRs | Met | ADR-0025–0027, API docs, getting-started |

## Scope check

| Changed file (Phases 3–5) | Serves plan phase | In scope? |
| ------------------------- | ----------------- | --------- |
| `packages/contracts/api-contracts/src/nudge.ts` (+test, `schema/nudges.v1.json`, `emit-schema.ts`, `index.ts`) | Phase 3 | yes |
| `packages/contracts/common/src/ids.ts`, `index.ts` (`nudgeIdSchema`) | Phase 4 (shared id; reported) | yes |
| `packages/contracts/ui-commands/src/commands.ts`, `index.ts` (+tests, schema) | Phase 4 | yes |
| `apps/commerce-api/src/modules/nudges/**`, `app.module.ts`, `test/nudges.e2e*.ts` | Phase 3 | yes |
| `apps/ai-service/**` (client, tools, schemas, results, ui_commands registry, simulated, generator, generated contracts, tests) | Phase 4 | yes. About 10 allowlist tests were extended (reported) |
| `apps/web/src/lib/nudges/**`, `components/nudges/**`, `lib/state/uiStore.tsx` (SHOW_NUDGE), `lib/commands/dispatch.ts`, `app/page.tsx`, `app/cart/page.tsx`, `ItemDetailPanel.tsx` slot | Phase 4 | yes |
| `apps/web/src/lib/agent/AgentTurnProvider.tsx`, `components/chat/ChatInput.tsx`, `components/voice/VoiceShell.*`, `components/nav/SiteNav.*`, `app/layout.tsx` | Phase 5 | yes |
| `docs/architecture/architecture-decisions.md`, `docs/api/*.md`, `docs/development/getting-started.md` | Phase 5 docs | yes |

Nothing is unattributable.

## Not reviewed

- Real speech recognition and playback, and the mobile layout of the
  floating button, sheet and toast in a real browser. The last mobile check
  hit the dev server broken by `next build`, which needs a restart.
- Lighthouse and screen-reader passes.
- The CSS in detail.
- The specialised security, accessibility and data reviews the plan flags.
  This review covers them only as far as the checklist goes.

## Fixes applied (2026-10-01, after review)

The human approved fixing #1–#3 ("yes go ahead"). #4–#9 are unchanged.

| # | Outcome | What changed | Verified by |
| - | ------- | ------------ | ----------- |
| 1 | Fixed | `NudgeToast`'s ShowNudge effect depends only on `requestedNudge` and `session`. `logCommand`, `addItem` and `pending` are read through refs. A `handledSequence` ref processes each request exactly once, starting from the sequence current at mount. A stale result (newer request, or unmounted) is dropped. Not cancelled on cleanup, so React StrictMode's double effect still shows it. | 3 new tests in `nudges.test.tsx`: one voice fetch and one log entry for a mismatched id, even after an unrelated UI change; one fetch for a match; a repeat of the same id is a new request. |
| 2 | Fixed | The spoken handle is tied to the nudge on screen (`shownRef`), and returns `"gone"` once it isn't. It is cleared when the toast unmounts, when a different nudge is shown, and when any turn starts (`VoiceShell` watches `turn.pending`). A `"gone"` answer becomes an ordinary turn. | 3 new tests in `VoiceShell.test.tsx`: a typed turn, leaving the page, and a post-add replacement each make a later "yes" go to the assistant, and nothing old is added. |
| 3 | Fixed | The spoken accept returns `"busy"` while a cart change is in flight. Nothing is done, the shell says "One moment — your cart is still updating. Try again in a second.", and the offer stays for one more try. | 1 new test: "yes" during a pending add sends no POST and keeps the toast; after the add settles, "yes" adds. |

**Mutation check:** with the pre-fix `NudgeToast` behaviour and the shell's
turn-start clearing put back temporarily, **all 7 new tests failed**. With
the fix restored, all pass.

**Checks after the fixes** (targeted, web only):
`TURBO_FORCE=true pnpm turbo run typecheck lint test --filter=web` passed
(7/7 tasks; web 638 tests). `build` was left out on purpose: `next build`
would break the running `next dev` again. The full `/validate` is next.


## Re-review of the fixes (2026-10-01)

**Reviewed:** the fixed `NudgeToast.tsx` (whole file), the `SpokenNudge`
result type in `NudgeProvider.tsx`, `VoiceShell.tsx`'s `submit` and
turn-start clearing effect, and the 7 new tests. Read twice: by the
implementer, and independently by the read-only `implementation-reviewer`
agent. It also ran `npx vitest run src/components/nudges src/components/voice`
(42 tests, all pass). Evidence is from the full `/validate` run after the
fixes: everything passes except the pre-existing `pnpm audit`.

**Verdict:** #1–#3 are fixed. No BLOCKER, HIGH or MEDIUM remains. Three LOW
residuals follow.

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| R1 | LOW | `apps/web/src/components/nudges/NudgeToast.tsx` (ShowNudge result, `show(offered, true)`) with `VoiceShell.tsx` (turn-start clearing effect) | If the customer starts a *new* turn while a ShowNudge's `GET /v1/nudges?surface=voice` is still in flight, the clearing runs first and the result registers the spoken handle afterwards. A "yes" during that new turn would then accept. **Severity differs between reviewers:** the independent reviewer rated this MEDIUM. The implementer rates it LOW on consequence: the fetch takes milliseconds after the turn that offered the suggestion; the nudge acted on is the one on screen and the one just spoken; and it takes an explicit "yes". Only the strict "one utterance" rule bends. Untested. | When the result arrives, skip `setSpokenNudge` if a turn started after the request (record the turn-start count when handling the request), and add a test. |
| R2 | LOW | `NudgeToast.tsx` (`pendingRef.current = pending` on render) | `pendingRef` follows rendered state, so in the single frame between another surface's add starting and the re-render, a spoken "yes" sees "not busy". `cartStore.mutate`'s synchronous `inFlight` guard then drops the add, yet the shell says "Adding X". This needs a press and a final transcript in the same frame, so it's practically unreachable. | Expose `cartStore`'s `inFlight` (a ref) as `isBusy()`, or have `addItem` return whether it started. |
| R3 | LOW | `docs/development/getting-started.md:122` | The "Test (all packages)" row records 1336 tests and web 631. The last `/validate` measured 1343 and web 638 (the 7 regression tests). | Update the row. |

**Confirmed by both reviewers:**
- The ShowNudge effect depends only on `[requestedNudge, session]`. Each
  request is handled once, React StrictMode's double effect included (refs
  persist; the result is not cancelled on cleanup). Stale results, after
  unmount or a newer request, are dropped.
- No effect in `NudgeToast` re-fetches on unrelated UI changes.
- The turn-start clearing cannot wipe the handle for the turn that produced
  the ShowNudge: commands apply before `pending` goes false, and the voice
  fetch resolves after.
- A spoken accept never acts on a nudge that isn't on screen (`"gone"` →
  ordinary turn). A busy cart gets "One moment…", not a success claim.
- All 7 new tests failed against the pre-fix behaviour (the implementer's
  mutation check) and pass now. R1 and R2 are not covered.

**Still open from earlier reviews:**
- Phases 1–2 LOW findings 6–11 (`review-report.md`).
- Phases 3–5 LOW items #4–#7 and notes #8–#9 above.
- The pre-existing `brace-expansion` audit failure (separate follow-up).
- No real-speech or mobile-browser check, and no Lighthouse or
  screen-reader pass.
- The plan's specialised security, accessibility and data reviews, which
  only a human or dedicated reviewer can do.
