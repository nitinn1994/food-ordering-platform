# Test Plan — Phase 16: Voice Interaction

The web tests run under Vitest and jsdom (ADR-0008) with a stubbed `fetch`,
as in Phase 15. jsdom has no Speech APIs, so:

- The session and UI tests inject `FakeSpeechToText` and `FakeTextToSpeech`
  (`src/test/voiceFakes.ts`).
- The adapter tests install fake `SpeechRecognition` and `speechSynthesis`
  objects on `globalThis`, and remove them afterwards.

## What will be tested

| AC | How it is verified | Type |
| --- | --- | --- |
| AC1 | The existing `ChatInput.test.tsx` passes with no assertion edits. `useAgentTurn.test.tsx` checks that `submit` returns the reply, and returns `null` when busy or given an empty string. | automated |
| AC2 | The same phrase is sent once typed and once through a fake final transcript. Both `fetch` calls are deep-equal in URL, method, headers and body. | automated |
| AC3 | Call-order recording shows: fetch resolves → the cart GET → the reply in the DOM → `applyUiAction` → `tts.speak(reply)` | automated |
| AC4 | With a text turn pending, the microphone is disabled. With a voice turn pending, Send is disabled. A double trigger sends one request. | automated |
| AC5 | `pnpm turbo run lint` passes. A temporary `import "../state/cartStore"` in `lib/voice` fails lint, and so does `@contracts/agent-intents`. Both are then removed and the result reported. | manual step, reported |
| AC6 | With the globals deleted, `isSupported === false` and nothing throws. The `webkitSpeechRecognition` fallback is detected. | automated |
| AC7 | The fake recognizer records `continuous=false`, `interimResults=true` and `lang="en-US"`. Interim results never submit. An empty or whitespace final is `no-speech` with no fetch. A 2001-character final is `too-long` with no fetch. | automated |
| AC8 | Each browser error code, and an unknown one, maps to the expected kind and fixed copy. A sentinel error message never appears in the DOM. | automated |
| AC9 (amended) | A reducer table test covers every listed transition (a listening end with no final result → `error`/`no-speech`), and every other (state, event) pair is a no-op. | automated |
| AC10 | A late `onFinal` with an old `recognitionId` is ignored. A late TTS `onEnd` with an old `turnId` is ignored. | automated |
| AC11 | During speaking: the microphone press calls `tts.cancel()` then `stt.start()` and gives listening. "Stop speaking" calls `tts.cancel()` and gives idle. | automated |
| AC12 | Stop during processing: the fetch still resolves, the reply is shown, the commands are applied, `speak` is not called, and the state ends idle | automated |
| AC13 | With fake timers, 15 s of listening with no end calls `stop()` | automated |
| AC14 (amended) | The microphone is a `button` whose name follows the state and which has **no** `aria-pressed`. `userEvent.keyboard("{Enter}")` and `" "` start listening. | automated |
| AC15 | The `role="status"` region text follows the state. The recording label text is present while listening. | automated |
| AC16 | With no recognizer, there is no microphone button, the hint is shown, and the text turn works | automated |
| AC17 | Rendering does not call `stt.start()`. The disclosure text is present before any press. | automated |
| AC18 | An interim transcript of `<b>x</b>` is shown literally. The final utterance appears as "You: …" in the transcript. | automated |
| AC19 | `git diff` grep: no new `console.`, `localStorage`, `sessionStorage`, `MediaRecorder` or `getUserMedia` in the changed files | manual step, reported |
| AC20 | `git diff --stat` shows no paths under `apps/ai-service`, `apps/commerce-api`, `packages/contracts` or `infrastructure`, and no manifest or lockfile changes | manual step, reported |
| AC21 | The documents listed in `plan.md` §24 have been edited, and ADR-0023 is present with ADR-0007 marked superseded | review |
| AC22 | This plan's commands have been run and the manual checks reported | review |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| useAgentTurn | AC1, AC4 | `apps/web/src/lib/agent/useAgentTurn.test.tsx` |
| Browser STT adapter | AC6–AC8 | `apps/web/src/lib/voice/browserSpeechToText.test.ts` |
| Browser TTS adapter | AC6, voice selection, cancel before speak, `interrupted`/`canceled` ignored | `apps/web/src/lib/voice/browserTextToSpeech.test.ts` |
| Voice reducer | AC9, AC10 | `apps/web/src/lib/voice/voiceReducer.test.ts` |
| Voice copy | AC8 (every kind has copy) | `apps/web/src/lib/voice/voiceMessages.test.ts` |
| useVoiceSession | AC7, AC10–AC13 | `apps/web/src/lib/voice/useVoiceSession.test.tsx` |
| VoiceControl + ChatInput | AC2–AC4, AC14–AC18 | `apps/web/src/components/voice/VoiceControl.test.tsx` |
| Existing chat tests | AC1 regression, unedited | `apps/web/src/components/chat/ChatInput.test.tsx` |

No ai-service, commerce-api or contract tests are added or changed. Their
code does not change (AC20), and their suites run as a regression.

## Validation commands

These are all declared in `docs/development/getting-started.md`.

| Check | Command | Expected |
| --- | --- | --- |
| types | `pnpm turbo run typecheck` | PASS |
| lint | `pnpm turbo run lint` | PASS |
| test | `pnpm turbo run test` | PASS (the web count rises and other packages are unchanged) |
| build | `pnpm turbo run build` | PASS |
| ai-service test (regression) | `cd apps/ai-service && uv run pytest` | PASS, unchanged count |
| ai-service lint | `uv run ruff check .` | PASS |
| ai-service format | `uv run ruff format --check .` | PASS |
| ai-service types | `uv run mypy` | PASS |
| format (TS) | — | NOT_CONFIGURED (no formatter is declared for the TypeScript packages) |

Between phases, only the web checks run (`pnpm --filter web typecheck`,
`lint`, `test`), and they are reported as targeted.

## Manual checks

Start the services with `pnpm --filter commerce-api db:up` and
`pnpm --filter commerce-api dev`, then
`cd apps/ai-service && uv run python -m ai_service`, then
`pnpm --filter web dev`. Open `http://127.0.0.1:3000`.

1. **Chrome, first use.** The disclosure is visible. No permission prompt
   appears on load. Pressing the microphone prompts. Allow it, then say
   "show me the desserts". Expected:
   - Listening… with interim text
   - then Processing…
   - the desserts filter applies
   - the reply appears as text and is **then** spoken
   - the command log shows `ShowMenuCategory`
2. **Chrome, commerce.** Say "add tiramisu". The cart panel shows the
   commerce-api cart with tiramisu. The reply is spoken. Checks A6 and A9.
3. **Barge-in.** While a reply is speaking, press the microphone. Speech
   stops at once and listening starts. Press "Stop speaking" during a reply:
   silence, then idle.
4. **Stop during processing.** Stop ai-service's response path (for example,
   by stopping commerce-api and saying "add tiramisu"). Press Stop while
   processing. The failure copy is shown and nothing is spoken.
5. **Errors.**
   - Deny the microphone permission: the permission copy is shown, and text
     chat still works.
   - Stay silent: the no-speech copy is shown.
   - Stop ai-service, then speak: the existing agent failure copy is shown,
     nothing is spoken, and the cart is still re-read.
6. **Keyboard only.** Tab to the microphone, press Space, speak, and hear
   the reply. Tab to "Stop speaking" and press Enter.
7. **Screen reader (optional).** The status changes are announced once each.
8. **Long reply (R4, A5).** Use a turn whose reply is several sentences.
   Record whether Chrome truncates it.
9. **Firefox.** There is no microphone button, the hint is shown, and text
   chat works (A4).
10. **Proxy unchanged.** `git diff` shows no change to `next.config.ts` or
    `middleware.ts`. Nothing new is probed, because no proxy path changed
    (see the memory note on Phase 15 S1).

## Not covered

- **The real browser speech engines** (recognition accuracy, latency, vendor
  data handling). jsdom cannot run them. They are covered only by the manual
  checks, and data handling by the privacy review (OD2).
- **Safari and mobile browsers.** Not available in this environment. Record
  them as unverified.
- **Accessibility audit tooling** (axe/Lighthouse). Not declared in the
  repository. Accessibility is covered by the RTL attribute tests and the
  manual keyboard check.
- **Load or performance.** No network cost is added.
