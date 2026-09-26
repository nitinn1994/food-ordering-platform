# Review Report — Phase 16: Voice Interaction

**Reviewed:**
- `requirements.md` (AC1–AC22), `plan.md` (§1–§32, Assumptions, "As built")
  and `test-plan.md`.
- The working-tree diff: 8 tracked files, +242/−71. These are
  `ChatInput.tsx`, `ChatTranscript.tsx`, `eslint.config.mjs` and five docs.
- Every untracked new file: `lib/agent/useAgentTurn.ts` (+test),
  `lib/voice/*` (7 modules and 5 test files), `components/voice/*` (3
  files) and `test/voiceFakes.ts`.

There were two passes. One was the implementer's self-review. The other was
an independent, read-only `implementation-reviewer` agent, which re-ran
`pnpm --filter web test` (478 pass), `typecheck` and `lint`, and
re-verified the ESLint boundary with a temporary violating import. Both
passes reached the same verdict, and both found the MEDIUM below
independently.

**Path:** Full

## Verdict

Sound. The one MEDIUM (finding 1) and LOW findings 2–6 have since been
**fixed** at the human's request. AC9 and AC14 were amended as part of
that. The implementation matches
the approved plan and its recorded "As built" deviations. Each of AC1–AC22
is met by code and backed by a test or a recorded check. There is no
BLOCKER or HIGH finding.

The specialised security and privacy review that the plan requires (Full
Path) is **still outstanding**, and this review does not replace it.
Findings 6 and 7 are inputs for it.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM — **fixed** (option (a), at the human's request; see `plan.md` "As built") | `apps/web/src/lib/voice/useVoiceSession.ts:101-104`; `apps/web/src/components/voice/VoiceControl.tsx:92` | **A spoken request can be silently dropped.** AC4 disables the microphone while a *text* turn is pending, and disables Send while a *voice* turn is processing. Nothing disables Send while voice is still **listening**. The trace: press the microphone, then type and Send while it is listening. The text turn takes the in-flight slot. The recognizer's final result arrives, `submit()` returns `null`, and the session goes `REPLY{speak:false}` → idle. The customer's words never reach the transcript, and there is no message. No second request is sent, so there is no commerce risk. It is a lost input with no feedback. No test covers this ordering. Found by both passes. | Either (a) when `submit` returns `null`, show fixed copy through a new error kind (for example "Still working on your last message — try again in a moment"), or (b) disable Send and the text box while listening. (a) keeps the text box usable and is about 5 lines plus a test. Needs your choice, since both touch approved behaviour. |
| 2 | LOW — **fixed** (see `plan.md` "As built") | `apps/web/src/lib/voice/browserTextToSpeech.ts:61-78`; `useVoiceSession.ts:76-82` | **"Speaking" has no way out if the browser never reports an end.** Two Chromium reports make this plausible. First, an utterance with no remaining JS reference may be garbage-collected before `onend` fires. The adapter keeps no reference to it: the handle holds only `synthesis`. Second, `cancel()` immediately before `speak()`, which happens on every call, may deliver `interrupted` to the *new* utterance, and the adapter swallows that as the caller's own cancel. In either case the status stays "Speaking…". It recovers only by hand: "Stop speaking" and the microphone both still work. **Unverified:** the real Chrome run hit `synthesis-failed` instead (no voices installed). | Keep the utterance referenced in the handle's closure. Report `interrupted` or `canceled` only when the caller did not cancel. Optionally add a speaking cap, like `MAX_LISTEN_MS`. Verify in the manual run on a machine with voices. |
| 3 | LOW — **fixed** (see `plan.md` "As built") | `apps/web/src/components/voice/VoiceControl.tsx:106-110` | The "Stop" button shown while processing has the accessible name "Stop", with no object. Next to "Stop listening" and "Stop speaking" it is ambiguous for screen reader users. Its action is "don't read this reply aloud". | Visible text "Don't read aloud", or a name that starts with the visible label, such as "Stop — don't read the reply aloud". |
| 4 | LOW — **fixed** (see `plan.md` "As built") | `eslint.config.mjs` (voice block) | The boundary patterns cover siblings (`../state/*`) and `**/lib/state/*`. A future *subfolder* of `lib/voice` could reach `../../state/x` without matching either. There is no subfolder today and no path alias (`apps/web/tsconfig.json` has no `paths`), so the boundary holds as the code stands. | If a subfolder is ever added, add `../../{state,api,commands,agent}/*` patterns, or switch to an import-boundaries plugin. |
| 5 | LOW — **fixed** (see `plan.md` "As built") | (recorded in `plan.md` "As built") | Three follow-ups the implementer already recorded, not fixed. (a) In real Chrome, silence ends without `no-speech`, so there is no message. (b) The microphone button changes its name *and* has `aria-pressed` (AC14 as approved). (c) There is no `Permissions-Policy: microphone=(self)` header. Both reviewers agree they are LOW. | Keep as follow-ups. (b) needs your decision, since it changes an approved AC. |
| 6 | LOW — **fixed** (see `plan.md` "As built") | `apps/web/src/lib/voice/browserTextToSpeech.ts:31-36`; `voiceMessages.ts` `VOICE_DISCLOSURE` | **A privacy gap in the disclosure.** `pickVoice` prefers an on-device voice, but falls back to *any* voice in the language. That can be a remote vendor voice, which receives the **reply text**. The disclosure mentions only audio sent by the speech *recognition* service. The reply is assistant wording, not customer input, but it can contain item names from the customer's request. | For the security review: either restrict to `localService` voices (none → text only), or widen the disclosure to cover spoken replies. |
| 7 | NOTE | `docs/features/phase-16-voice-interaction/plan.md` "As built" | In the Chrome run, the first snapshot showed the microphone already listening and focused, before any press. It was not reproduced: after a reload the microphone stayed idle, with 0 `start()` calls over 8 s. A click in the visible window is the likely cause, but this is unconfirmed. | The security review should re-check "nothing starts before a press" in a clean browser profile. |
| 8 | NOTE | `VoiceControl.tsx:97-99` | The accessible names carry a leading space (Chrome's tree showed `" Start voice input"`), from the `aria-hidden` emoji plus `{" "}`. Screen readers trim it, and the tests match by trimmed name. It is cosmetic. | Optional: put the space inside the `aria-hidden` span. |
| 9 | NOTE | `docs/architecture/architecture-decisions.md` ADR-0023 Consequences | "Voice works in Chromium-based browsers and Safari" rests on A4, which was verified for Chromium only. The sentence hedges ("as far as their support goes"), and the "As built" section records what was checked. | None, or name Safari as unverified. |
| 10 | NOTE | `useVoiceSession.ts:108-109` | `pendingReply` is set even when the turn was muted. It is inert: the reducer sends a muted `REPLY` to idle, so the speaking effect never reads it, and the next `start()` clears it. The agent traced this. | None. |

Severity: `BLOCKER` (must fix) · `HIGH` (fix before merge) · `MEDIUM` (should
fix) · `LOW` (optional) · `NOTE` (observation, no action).

### Checklist results

- **Scope.** Every changed file maps to a phase (table below). There are no
  drive-by edits, no dependency changes, and nothing in ai-service,
  commerce-api, contracts, infrastructure, `next.config.ts`,
  `middleware.ts` or `.env.example` (AC20).
- **Requirements.** AC1–AC22 were walked against code and tests. AC5 was
  verified by a temporary violating import, twice (once by the implementer,
  once by the agent). AC19 and AC20 were verified by grep and
  `git status`. AC22's manual checks were only partly possible: see "Not
  reviewed".
- **Conventions.**
  - Services and components take injectable dependencies with defaults, as
    `RequestDeps` does.
  - Fixed copy is chosen by kind, as in `userMessages.ts`.
  - The reducer and hook split matches `checkoutReducer`.
  - Test fakes live in `src/test/`.
  - The ESLint block repeats the `agent-intents` ban, as the commerce-api
    block's comment requires.
  - No second turn path was introduced. `useAgentTurn` *is* the Phase 15
    logic, moved unchanged.
- **Correctness.**
  - The state machine is total over 5 × 10 (status, event) pairs.
  - Stale ids were mutation-checked and shown to fail.
  - The ordering bug, where speech ran ahead of the render, was caught by a
    test in Phase 4 and fixed. The real Chrome run confirmed the order.
  - Strict-mode double mount was traced as inert, but no test covers it.
- **Error handling.** Every browser error maps to fixed copy. `aborted` and
  the caller's own cancel are deliberately silent. Turn failures reuse the
  Phase 15 copy and are never spoken. The swallowed cases are findings 1
  and 2.
- **Tests.** They cover failure paths, not only the happy path: every error
  code, unknown and prototype-key codes, empty or too-long finals, stale
  events, barge-in, mute, the cap, unmount, and unsupported browsers. The
  gap is finding 1's ordering.
- **Security.** No audio is handled. No transcript is logged: the ai-service
  log was checked after the live run. There is no storage and no
  credentials. The request is identical to a typed one (AC2). Findings 6
  and 7 go to the specialised review.
- **Performance.** NOT_APPLICABLE. No network calls are added, and speech
  runs locally or in the browser.

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `apps/web/src/lib/agent/useAgentTurn.ts`, `useAgentTurn.test.tsx`, `src/components/chat/ChatInput.tsx`, `ChatTranscript.tsx` | 1 — shared turn path (the `ChatMessage` move is recorded in "As built") | yes |
| `apps/web/src/lib/voice/{types,voiceMessages,browserSpeechToText,browserTextToSpeech}.ts` (+tests), `src/test/voiceFakes.ts`, `eslint.config.mjs` | 2 — voice boundary | yes |
| `apps/web/src/lib/voice/{voiceReducer,useVoiceSession}.ts` (+tests) | 3 — voice session | yes |
| `apps/web/src/components/voice/VoiceControl.{tsx,module.css,test.tsx}`, `ChatInput.tsx` (render and prop), `useVoiceSession.ts` (the speak-after-render fix) | 4 — UI integration | yes |
| `docs/architecture/{architecture-decisions,system-architecture}.md`, `docs/product/food-ordering-frontend-mvp.md`, `docs/development/getting-started.md`, `docs/api/ai-service.md`, `docs/features/phase-16-voice-interaction/*` | 5 — docs (AC21) | yes |

There is no unattributable change. The getting-started test-count
correction (338, not 364) is an edit to a row this phase had to update
anyway. It was flagged in Phase 1.

## Not reviewed

- **Hearing speech.** No audio was produced in any run: the machine has 0
  voices, so Chrome raised `synthesis-failed`. The real `onend` path, long
  replies (A5, R4) and finding 2 are unverified.
- **A real microphone.** The live voice turn scripted
  `SpeechRecognition.start`. Recognition accuracy, the permission prompt on
  a fresh profile (permission was already `granted`), and real interim
  results were not exercised.
- **Firefox, Safari and mobile browsers** (A4). Only Chromium was checked.
  The unsupported path is covered by tests only.
- **Screen reader behaviour.** Accessibility is covered by RTL attribute
  tests and one real accessibility-tree snapshot. No keyboard-only manual
  run was done in the browser: keyboard activation is tested in jsdom only.
- **The CSS** (the reduced-motion rule, and whether the recording state is
  visible without colour). Read, not rendered.
- **Strict-mode double mount.** Reasoned about, not tested.
- **Accuracy of every doc sentence.** Spot-checked.
