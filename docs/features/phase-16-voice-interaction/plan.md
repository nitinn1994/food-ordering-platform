# Plan — Phase 16: Voice Interaction

**Approval Status:** APPROVED (2026-09-27, OD1–OD12 as recommended)
**Risk:** HIGH · **Path:** Full · Requirements: `requirements.md`

## Approach

Voice is an **input and output adapter on the existing text turn**. It is
not a new pipeline.

- The browser turns speech into a transcript. That transcript becomes the
  `message` of the unchanged `POST /api/ai/v1/agent/turns`.
- The turn's `reply` is shown as text exactly as today, its `uiCommands` go
  through the unchanged Phase 15 dispatcher, and then the browser speaks the
  reply.
- The only structural change to existing code is extracting `ChatInput`'s
  turn logic into one shared hook, so that text and voice cannot drift apart.
- Everything audio-related lives behind two small interfaces in
  `apps/web/src/lib/voice/`. An ESLint rule prevents that folder from
  reaching cart state, the API client, the dispatcher or any contract.

Legend used below: **[E]** established architecture (already true in the
repository) · **[D]** a decision needing approval (see §30) · **[A]** an
assumption (see §29) · **[P]** a provider-specific point · **[L]** deferred
to a later phase.

---

## 1. Current architecture [E]

```text
Browser (Next.js, apps/web, 127.0.0.1:3000)
  page.tsx: CategoryFilter · MenuSearch · MenuList · ItemDetailPanel · ChatInput | CartPanel · CommandLogPanel
  UiProvider (uiStore: presentation only) · CartProvider (cartStore: holds the last CartResponse)
     │  /api/commerce/v1/*  ── rewrite (middleware confines to /v1) ──►  commerce-api :3001 ──► PostgreSQL
     │  /api/ai/v1/agent/turns ── rewrite (one exact path) ──────────►  ai-service  :3002 ──► commerce-api (HTTP only)
```

- Identity is resolved on the server. commerce-api's `CartOwnerResolver`
  returns one fixed owner, and no cart or owner id is ever read from a
  request (ADR-0015).
- There is no authentication, and the system assumes one user (`CLAUDE.md`).
- **No voice, audio, WebSocket, WebRTC, SSE, LiveKit or streaming code
  exists** (checked with a repository grep). ADR-0007 (Proposed) says there
  is no voice surface at all.

## 2. Existing AI architecture [E]

`ai-service` has the following parts:

- **Route.** FastAPI `POST /v1/agent/turns` (`api/agent.py`) calls
  `AgentService.run_turn(message)` (`agents/service.py`).
- **Graph.** A LangGraph graph (`call_model` ⇄ `execute_tools` →
  `finalize_reply`) on a deterministic simulated keyword model
  (`llm/simulated.py`).
- **Tools.** Five commerce tools: two reads, and three writes validated as
  generated `AgentIntent` models (`tools/intents.py`). There are also five
  presentation tools that produce `UiCommand`s (`ui_commands/`). The limits
  are 8 tool calls per turn and 3 s per commerce request, and turns are never
  retried.
- **Response.** `{ reply ≤4000, uiCommands?: UiCommandBatch }`, validated by
  Pydantic generated from the Zod source in `@contracts/ui-commands`.
- **Logging.** Logs record lengths and counts only, never the message or the
  reply (ADR-0019 S2).

**Web turn path** (`components/chat/ChatInput.tsx`):

1. `sendAgentTurn` (a 30 s timeout, never retried) and `parseAgentTurnResponse`
2. `dispatchBatch`
3. `await cart.refresh()`
4. Show the reply as text
5. `ui.logCommand` and `ui.applyUiAction`, in order

A synchronous `inFlight` ref allows one turn at a time.

## 3. Voice architecture [D: OD1]

**Recommended: browser-native speech, client-side, over the existing turn.**

```text
          ┌──────────────── apps/web (browser) ────────────────────────────┐
 mic ──►  SpeechToText (Web Speech API) ── final transcript ──┐            │
          │                                                   ▼            │
 keyboard ─────────────── typed text ─────────────► useAgentTurn.submit(text)  ◄── the one common AI input
          │                                                   │            │
          │                           POST /api/ai/v1/agent/turns {message}│  (unchanged)
          │                                                   ▼            │
          │                                  ai-service → LangGraph → tools/intents → commerce-api
          │                                                   │            │
          │                     { reply, uiCommands? }  ◄─────┘            │
          │            refresh cart → show reply → dispatchBatch           │  (unchanged order)
          │                                                   │            │
 speaker ◄── TextToSpeech (speechSynthesis) ◄── reply, only for voice turns │  ◄── the one common AI output
          └────────────────────────────────────────────────────────────────┘
```

Options evaluated:

| | (a) Browser-native **[recommended]** | (b) Server voice endpoint in ai-service | (c) Realtime gateway (WebRTC or LiveKit) |
| --- | --- | --- | --- |
| New transport | none | multipart upload route plus a new proxy path | a WebRTC/SFU server, or a WebSocket gateway |
| New service or infrastructure | none | none, but a new route, size limits and format handling | a new service, TURN/ICE, and a new deploy topology |
| Real STT/TTS in this phase | yes (the browser's engine) | **no**. `CLAUDE.md` forbids a real provider, so a server STT could only be a stub that ignores the audio. | the same problem as (b), plus much more |
| Audio reaches our services | never | yes (then retention, logging and limits all need design) | yes |
| Latency | low. Interim results are local, and there is no upload. | an upload plus batch STT plus TTS download | lowest in theory |
| Browser support | Chromium and Safari for STT, and all modern browsers for TTS. Firefox has no STT **[A4]**. | all (MediaRecorder) | all |
| Provider flexibility | a later server adapter can implement the same `SpeechToText` interface | the provider can be swapped on the server | tied to the gateway |
| Complexity | lowest | medium | high |

The brief's rule is "the simplest architecture that satisfies the user
experience", and a real server-side provider is out of scope. Together these
make (a) the only option that delivers working voice in this phase without
inventing an interface around a stub. ADR-0007's warning was that such an
interface "would almost certainly be wrong in the way that matters".

**What changes if you choose (b) later [L].** It adds one new
`SpeechToText` adapter, which uploads audio to a future endpoint and returns
the transcript. The session, the turn path and the UI are all unaffected.

## 4. Audio transport

- **Microphone to recognizer.** Inside the browser, handled by the Web
  Speech API. This code never touches the raw audio: it does not call
  `getUserMedia` or create a `MediaStream`. **[P]** Chromium's
  `SpeechRecognition` may send the audio to the browser vendor's speech
  service (OD2). That is the browser's transport, not ours.
- **Transcript to ai-service.** The existing same-origin HTTPS or loopback
  `POST`, as a JSON string. **No new transport.**
- **Reply to speaker.** `speechSynthesis`, local to the browser. It prefers a
  voice with `localService === true` (§6).
- **Reconnect behaviour.** No connection persists, so there is nothing to
  reconnect. Each utterance is one independent recognition session plus one
  HTTP request. A network drop fails that turn with the existing
  "unreachable" copy, and the next press starts afresh.

## 5. STT strategy

- **Boundary.** `SpeechToText.start({ lang, onInterim, onFinal, onError,
  onEnd }) → { stop(), abort() }` and `isSupported`. The rest of the app sees
  only strings and a closed `VoiceErrorKind`.
- **Streaming vs batch.** The browser streams interim results locally, and
  these are *display only*. **Only the final transcript is submitted** as one
  request.
- **Settings.** `continuous = false` (one utterance), `interimResults = true`
  and `maxAlternatives = 1`.
- **Final transcript rules.**
  - It is trimmed.
  - If empty, or only whitespace, it becomes `no-speech` and is not sent.
  - If longer than `MAX_TURN_MESSAGE_LENGTH` (2000), it becomes `too-long`
    and is not sent. The limit is imported by the hook, not by `lib/voice`,
    which cannot import contracts (§22).
  - The transcript is **not** "cleaned" or interpreted. The agent owns
    meaning.
- **Language.** `VOICE_LANG = "en-US"`, one constant (OD10). The page is
  `<html lang="en">`, and the menu is English.
- **Timeout.** The browser ends the utterance on silence. A 15 s safety cap
  (`MAX_LISTEN_MS`) calls `stop()` if it has not ended.
- **Retry.** Never automatic. The user presses the microphone again. This
  matches "turns are never retried".
- **Low-quality transcript.** It is sent as heard. The reply and the
  transcript line ("You: …") make a mishearing visible. Whether to review
  before sending is OD4.

## 6. TTS strategy

- **Boundary.** `TextToSpeech.speak(text, { lang, onEnd, onError }) →
  { cancel() }` and `isSupported`.
- **Complete, not streaming.** The reply is known only when the turn ends
  (§10). It is spoken as a whole utterance.
- **Voice choice** is made once, when the voices are available:
  1. the first voice whose `lang` starts with `en` and has
     `localService === true`
  2. otherwise the first voice with an `en` lang
  3. otherwise the default voice

  Rate and pitch stay at their defaults, with no configuration UI.
- **What is spoken.** Only `reply`, the same untrusted wording shown as
  text. It never speaks UI-command payloads or cart numbers the backend did
  not put in the reply.
- **Contains no commerce logic.** It is a string in, sound out.
- **Interruption.** `cancel()` calls `speechSynthesis.cancel()`. Before each
  `speak()` it also cancels, so two replies can never queue.
- **Playback errors.** `interrupted` and `canceled` are expected and never
  shown. Any other error gives the fixed copy "Couldn't play the reply —
  it's shown above." The text reply is already on screen.

## 7. Provider abstraction [D: OD1]

```text
apps/web/src/lib/voice/
  types.ts                 SpeechToText · TextToSpeech · VoiceErrorKind   ← the only thing the session sees
  browserSpeechToText.ts   Web Speech API adapter (hand-declared minimal types; TS lib.dom has none)
  browserTextToSpeech.ts   speechSynthesis adapter
  (tests) src/test/voiceFakes.ts  FakeSpeechToText · FakeTextToSpeech
```

- Provider-specific calls live only in the two `browser*` files.
- LangGraph, ai-service and commerce-api know nothing about voice.
- A future server-side or third-party provider **[L]** is one new adapter
  file, plus whatever endpoint it needs, which would be a separate phase with
  its own security review.

## 8. Voice session model

This state is **client-only, in memory, and per component instance.** It is
never persisted, never sent to a server, and never a source of commerce
state.

```ts
type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error";
type VoiceState = {
  status: VoiceStatus;
  turnId: number;           // increments when a final transcript is submitted
  recognitionId: number;    // increments on each start(); tags recognizer events
  interim: string;          // display only; cleared on final/stop/error
  muted: boolean;           // "don't speak this turn's reply" (stop during processing)
  error: VoiceErrorKind | null;
};
```

The brief's `session_id` and `conversation_id` are **not introduced**. No
server-side session exists, and ai-service has no conversation memory
(ADR-0020). Adding ids that nothing reads would be invented machinery **[L]**.

"Unsupported" is not a state. It is a capability check made before
rendering (§18).

## 9. Turn detection [D: OD3]

**Recommended: tap to talk.**

1. Press the microphone to start.
2. The browser's end-of-speech detection finishes the utterance. This is
   client-side, built-in VAD with `continuous = false`.
3. Press again to stop early.
4. The 15 s cap applies throughout.

Alternatives considered:

- **Hold-to-talk.** Awkward on touch and for keyboard users.
- **Continuous or hands-free listening.** It needs our own VAD and echo
  handling (§11).
- **Server-side detection.** There is no server audio path.

## 10. Streaming strategy

| Part | Mode | Why |
| --- | --- | --- |
| STT interim results | streaming, **local to the browser, display only** | Feedback while speaking. Never sent. |
| STT final transcript → ai-service | request/response | One message per turn, the existing contract |
| LLM / agent turn | request/response | [E] ADR-0022. The simulated model answers in milliseconds. |
| UI commands | request/response, a batch at turn end | [E] ADR-0022 rule: no command before the writes it depends on have resolved |
| TTS | complete utterance, local | The reply is only known at turn end |

Nothing streams over the network in this phase. Streaming the LLM or TTS
becomes worth designing only with a real model provider, whose latency is
unknown **[L]**.

## 11. Interruption / barge-in strategy [D: OD6, OD7]

| While | User action | Effect |
| --- | --- | --- |
| speaking | presses the microphone | `tts.cancel()`, then `stt.start()`, then **listening** (manual barge-in) |
| speaking | presses "Stop speaking" | `tts.cancel()`, then **idle** |
| listening | presses the microphone again | `stt.stop()`. A final result, if the browser delivers one, is submitted. Otherwise **idle**. |
| processing | presses "Stop" | `muted = true`. **The HTTP turn is not aborted**, because it may already have changed the cart. The reply is shown and the commands applied, but it is not spoken. Then idle. |
| processing | the microphone | disabled. One turn in flight across both channels ([E] ADR-0022). |
| a text turn pending | the microphone | disabled (AC4) |

**Race protection:**

- Every recognizer callback carries the `recognitionId` it was started with.
- Every TTS callback carries the `turnId` it was spoken for.
- The reducer ignores any event whose id is not the current one (AC10).

A late `onFinal` from a stopped recognizer can therefore never start a turn.
A late `onEnd` from a cancelled reply can never move a newer turn to idle.
Old responses cannot overwrite newer turns, because there is never more than
one turn in flight, and its reply is spoken only if its `turnId` is still
current and it is not muted.

**Automatic barge-in** (detecting speech while TTS plays) is **not done**.
Without echo cancellation the recognizer hears the reply itself **[L]**.

## 12. LangGraph integration [E, unchanged]

Voice reaches the **same** agent through the **same** route. There is no
voice agent, no voice node, no voice prompt, and no ai-service code change.
The graph cannot tell a spoken message from a typed one (OD8).

## 13. Business Intent integration [E, unchanged]

The three write tools continue to validate their calls as generated
`AgentIntent` models (`tools/intents.py`) before one commerce call each.
Voice adds no intent, no tool and no map entry. `apps/web` still cannot
import `@contracts/agent-intents` (ESLint), and `lib/voice` cannot import any
contract (§22).

## 14. UI Command integration [E, unchanged]

The voice turn's `uiCommands` go through the **same** `dispatchBatch` and
`commandToUiAction`, inside the shared `useAgentTurn`. There is no
voice-specific command, no voice dispatcher, and no command derived from the
transcript on the client.

Speaking starts only **after** the commands are applied, so what the user
hears matches what is on screen (AC3).

Example: "show me the desserts" → reply "Here are the desserts." →
`ShowMenuCategory{desserts}` → the filter changes → the reply is spoken.

## 15. Commerce API integration [E, unchanged]

`Voice → transcript → /api/ai/v1/agent/turns → LangGraph → intent-validated
tool → CommerceClient → commerce-api → PostgreSQL`.

`lib/voice` has no path to commerce: it cannot import `lib/api`,
`cartStore` or `api-contracts` (ESLint). The cart shown after a voice turn
comes from the same `cart.refresh()`, a read from commerce-api (ADR-0005).

## 16. Identity / session strategy [E]

- **Identity.** Voice uses the browser's existing same-origin requests.
  commerce-api resolves the owner on the server (ADR-0015). No voice id,
  session id or header is added.
- **Isolation.** Voice can reach nothing that typing cannot, because the
  request is identical (AC2). There is no independent authorisation.
- **When authentication arrives [L]**, it changes `CartOwnerResolver`
  (ADR-0015), and voice inherits it with no change.

## 17. Confirmation strategy [D: OD12]

**No voice-reachable action needs confirmation today.**

- There is no `PlaceOrder` or `ClearCart` tool: both intents are declined
  (Phase 15 §2).
- Checkout is a manual form.
- The writes that exist (add, set quantity, remove one line) are reversible
  and bounded (8 calls, at most 99 per line).

This phase therefore invents no confirmation semantics.

**Rule for later [L].** The phase that adds an order or destructive tool
must define confirmation in the agent and commerce layer, for text and voice
alike, never in the voice layer. That keeps one safety model for both
channels.

OD4 (review the transcript before sending) is the voice-specific
mitigation for mishearing, and is offered separately.

## 18. Frontend voice state

| Status | Microphone button | Other control | Status text (live region) |
| --- | --- | --- | --- |
| idle | "Start voice input" 🎤, `aria-pressed=false` | — | "" |
| listening | "Stop listening" 🎙 (a pulsing ring and a "● Recording" label: not colour alone), `aria-pressed=true` | — | "Listening…" plus the interim text |
| processing | disabled | "Stop" (mute this reply) | "Processing…" |
| speaking | "Start voice input" (barge-in) | "Stop speaking" 🔊 | "Speaking…" |
| error | "Start voice input" | — | fixed copy per `VoiceErrorKind` ⚠ |
| unsupported | not rendered | — | a static hint: "Voice input isn't available in this browser — type instead." |

This is presentation and session state only. It does not duplicate the cart
or the UI store. It lives in `useVoiceSession` inside `VoiceControl`.

## 19. Error handling

| Source | Kind | User copy (fixed) | State |
| --- | --- | --- | --- |
| Microphone permission denied (`not-allowed`, `service-not-allowed`) | `permission-denied` | "Microphone access is blocked. Allow it in your browser settings, or type instead." | error |
| No microphone (`audio-capture`) | `no-microphone` | "No microphone was found. You can type instead." | error |
| Nothing heard (`no-speech`, empty final) | `no-speech` | "I didn't catch that — try again." | error |
| Too long | `too-long` | "That was too long — please try a shorter request." | error |
| Recognizer network or service (`network`) | `recognition-unavailable` | "Voice recognition isn't available right now. You can type instead." | error |
| `language-not-supported`, unknown | `recognition-failed` | "Voice input didn't work. You can type instead." | error |
| `aborted` (our own stop or abort) | — | none | as the reducer defines |
| `start()` throws (for example already started) | `recognition-failed` | as above | error |
| Agent turn fails (`AGENT_FAILED`, unreachable, invalid response) | [E] | the existing `userMessageFor(error, "agent")` copy, shown in the transcript | reply spoken? **No**. The failure copy is shown, the voice state returns to idle, and the cart is refreshed anyway [E]. |
| TTS error (not interrupted or cancelled) | `playback-failed` | "Couldn't play the reply — it's shown above." | error |
| TTS unsupported but STT supported | — | replies shown as text only | never enters speaking |

Browser error messages are never shown or logged. Only the mapped kind is
used (AC8).

## 20. Security / privacy [specialised review]

- **Microphone permission.** It is requested implicitly by
  `SpeechRecognition.start()` on the first user press, never on load
  (AC17).
- **Secure context.** It works on `https:` or loopback. Development runs on
  `127.0.0.1`, which is a secure context.
- **Disclosure [D: OD2]**, shown next to the microphone before the first use:
  "Voice is processed by your browser's speech service, which may send audio
  to its provider." Nothing is sent before the user presses the microphone.
- **Audio retention.** Our code never has the audio: there is no
  `getUserMedia`, no `MediaRecorder` and no Blob. It stores nothing. It keeps
  no transcript beyond the existing in-memory chat transcript, which is lost
  on reload.
- **Provider data handling [P].** The browser vendor's handling of the audio
  is outside this repository. It is documented in ADR-0023 and needs human
  sign-off (OD2).
- **Logging.** No new `console.*`. ai-service logs are unchanged and record
  `message_chars` only. The command log panel shows commands, not the
  transcript [E].
- **Credentials.** None exist. There are no provider keys, and nothing to
  expose.
- **Injection.** A spoken prompt injection has exactly the reach of a typed
  one, with the Phase 14 and 15 bounds [E]. The interim transcript and the
  reply are rendered as React text nodes (AC18).
- **Follow-up [L].** A `Permissions-Policy: microphone=(self)` header, set in
  `next.config.ts` `headers()`.

## 21. Accessibility

- A native `<button>` for the microphone and for Stop. Both are operable by
  keyboard (Enter and Space) and have visible focus (AC14).
- A dynamic accessible name ("Start voice input", "Stop listening") plus
  `aria-pressed`.
- `role="status"` for the live status and the errors (AC15). The interim
  transcript is visible, but *not* inside the live region, so a screen
  reader is not flooded.
- The recording state is shown with text and shape, not colour alone.
- The permission message states what to do next, and always offers "type
  instead".
- Text chat is always present and unaffected. Voice is additive (AC16).
- "Stop speaking" is always reachable while speaking.
- The pulse animation respects `prefers-reduced-motion`.

## 22. Testing strategy

Summary (details in `test-plan.md`):

- **Reducer** (pure): every transition in AC9, the no-op matrix, and stale
  ids (AC10).
- **Adapters.** Tested against hand-written fake `window.SpeechRecognition`
  and `speechSynthesis` objects on `globalThis`, since jsdom has neither.
  They cover the settings (AC7), the error mapping (AC8), feature detection
  (AC6), voice selection, and `cancel` before `speak`.
- **`useVoiceSession`**, with `FakeSpeechToText` and `FakeTextToSpeech`:
  - the lifecycle, the safety cap (fake timers, AC13)
  - barge-in (AC11)
  - mute during processing (AC12)
  - empty and too-long finals (AC7)
- **`VoiceControl` + `ChatInput`** (RTL, stubbed `fetch` as in Phase 15):
  - the voice request equals the text request (AC2)
  - the order: refresh → reply → commands → speak (AC3)
  - one turn across both channels (AC4)
  - the unsupported path (AC16)
  - no permission before a press (AC17)
  - accessibility attributes (AC14, AC15)
  - markup rendered as text (AC18)
- **Existing** `ChatInput.test.tsx` passes unchanged (AC1).
- **Boundary.** The ESLint rule, verified by a temporary violating import
  (AC5), as in Phases 10 and 15.
- **AI, commerce and dispatcher reuse** are proven by AC2 (an identical
  request) plus the existing ai-service suite, run unchanged as a
  regression. No ai-service test is added, because no ai-service code
  changes.
- **Manual.** Chrome end to end with all three services, and Firefox for
  the unsupported path.

## 23. Files to create

| File | Purpose |
| --- | --- |
| `apps/web/src/lib/agent/useAgentTurn.ts` (+ `.test.tsx`) | The shared turn: `submit(text) → Promise<{reply} \| null>`, `pending`, `transcript` |
| `apps/web/src/lib/voice/types.ts` | `SpeechToText`, `TextToSpeech`, `VoiceErrorKind`, `VOICE_LANG`, `MAX_LISTEN_MS` |
| `apps/web/src/lib/voice/browserSpeechToText.ts` (+ test) | Web Speech API adapter with minimal local type declarations |
| `apps/web/src/lib/voice/browserTextToSpeech.ts` (+ test) | `speechSynthesis` adapter |
| `apps/web/src/lib/voice/voiceReducer.ts` (+ test) | The state machine (§8, §11) |
| `apps/web/src/lib/voice/voiceMessages.ts` (+ test) | Fixed copy per `VoiceErrorKind` and status |
| `apps/web/src/lib/voice/useVoiceSession.ts` (+ `.test.tsx`) | Joins the reducer, the adapters and an injected `submit` |
| `apps/web/src/components/voice/VoiceControl.tsx`, `.module.css`, `.test.tsx` | The microphone and Stop buttons, the status region, the interim text, the disclosure |
| `apps/web/src/test/voiceFakes.ts` | `FakeSpeechToText` and `FakeTextToSpeech` |
| `docs/features/phase-16-voice-interaction/{requirements,plan,test-plan}.md` | This plan |

## 24. Files to modify

| File | Change |
| --- | --- |
| `apps/web/src/components/chat/ChatInput.tsx` | Use `useAgentTurn`, and render `<VoiceControl submit pending />`. The form behaviour is unchanged. |
| `apps/web/src/components/chat/ChatInput.module.css` | Layout for the voice control, if needed |
| `apps/web/src/components/chat/ChatInput.test.tsx` | **Only additions** (the voice/text parity case, if it lives here). Existing assertions are untouched. |
| `eslint.config.mjs` | A new block for `apps/web/src/lib/voice/**`. It restricts `lib/state`, `lib/api`, `lib/commands`, `lib/agent` and `@contracts/*`, and **repeats the `agent-intents` ban**, because flat config replaces the rule's options per block (as the existing commerce-api block notes). |
| `docs/architecture/architecture-decisions.md` | Add ADR-0023 (voice via browser speech over the existing turn). ADR-0007's status becomes "Superseded by ADR-0023". |
| `docs/architecture/system-architecture.md` | The voice data flow, the voice boundary, and "no audio reaches our services" |
| `docs/product/food-ordering-frontend-mvp.md` | The "no voice surface (ADR-0007)" lines this phase makes wrong |
| `docs/development/getting-started.md` | Browser support and the manual voice check. The web test count is updated. |
| `docs/api/ai-service.md` | One line: voice uses the same `POST /v1/agent/turns`, and the API is unchanged. It is edited only if its §343 "streaming" note would otherwise mislead. |

**Not modified:** anything in `apps/ai-service`, `apps/commerce-api`,
`packages/contracts`, `infrastructure`, `next.config.ts`, `middleware.ts` or
`.env.example`.

## 25. Dependencies

**None.** No npm package is added: `@types/dom-speech-recognition` is
avoided, and a minimal interface is hand-declared in
`browserSpeechToText.ts`. `SpeechSynthesis*` types already exist in TS 5.9
`lib.dom` (checked). There is no Python change and no `pnpm install`.

## 26. Environment variables

**None.** No provider, key, URL or flag. Voice availability is decided at
runtime by feature detection. OD2 option (b) would add a build-time
`NEXT_PUBLIC_VOICE_ENABLED`, and only if that option is chosen.

## 27. Acceptance criteria

AC1–AC22 in `requirements.md`.

## 28. Validation commands

These are from `docs/development/getting-started.md`. Targeted runs happen
between phases, and the full set runs before `/review`.

| Area | Command |
| --- | --- |
| TS typecheck, lint, test, build | `pnpm turbo run typecheck` · `pnpm turbo run lint` · `pnpm turbo run test` · `pnpm turbo run build` |
| ai-service (regression only; no change expected) | `cd apps/ai-service && uv run pytest` · `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy` |
| Manual end to end | `pnpm --filter commerce-api db:up` + `dev`, `uv run python -m ai_service`, `pnpm --filter web dev` |

## 29. Risks

| Risk | Impact | Handling |
| --- | --- | --- |
| **R1.** Chromium STT sends audio to the vendor's cloud [P] | A third-party personal-data flow, and a possible conflict with `CLAUDE.md`'s "no real voice provider" | OD2: an explicit human decision, the disclosure before first use, and ADR-0023. The specialised privacy review. |
| **R2.** Firefox, and some embedded browsers, have no `SpeechRecognition` **[A4]** | No voice there | AC16: the hint, and text works. Recorded in getting-started. |
| **R3.** Mishearing changes the cart ("add two" heard as "add ten") | A wrong cart | Bounded and reversible [E]. The transcript is visible, and the cart is re-read. OD4 offers review-before-send. |
| **R4.** Chromium stops long `speechSynthesis` utterances partway **[A5]** | A truncated spoken reply (the text is complete) | Checked in the manual run. If it reproduces, the in-plan fallback is to split the reply into sentences inside the adapter, so `cancel()` still stops everything. Nothing else changes. |
| **R5.** Recognizer events arrive after stop or abort (browser-dependent ordering) | A stale turn starts | `recognitionId` tagging (AC10) |
| **R6.** The echo: TTS output is heard by the recognizer | A self-triggered turn | The microphone starts only on a press, and pressing cancels TTS first (§11). There is no automatic barge-in. |
| **R7.** Extracting `useAgentTurn` subtly changes the text chat | A regression in Phase 15 behaviour | Phase 1 is a pure refactor. The existing `ChatInput` tests must pass unchanged before any voice code is written. |
| **R8.** Autoplay policies block `speechSynthesis` without a gesture | A silent reply | Speaking always follows a user press in the same session. Checked manually. On an error: `playback-failed`, and the text is shown. |
| **R9.** jsdom lacks the Speech APIs | Adapters untested in CI | Fakes on `globalThis` exercise the adapters' mapping logic. The real engines are covered manually only (stated in the test plan). |

## 30. Open decisions (all need approval)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| OD1 | Voice architecture | (a) browser-native STT/TTS over the existing turn · (b) an ai-service audio endpoint with provider interfaces and simulated providers · (c) a realtime WebRTC/LiveKit gateway | **(a)**. It is the only option that works without a real server-side provider, and it adds no transport. (b) would be a stub that ignores audio. |
| OD2 | The browser's cloud STT vs `CLAUDE.md` "no real voice provider" | (a) allow it: the repository integrates no provider, and the user sees a disclosure before first use · (b) the same, behind the build-time flag `NEXT_PUBLIC_VOICE_ENABLED` (default off) · (c) no STT this phase, TTS only | **(a)**, **but this is your call.** It is a privacy and policy question the code cannot settle. |
| OD3 | Turn detection | (a) tap to talk, browser end-of-speech, a 15 s cap · (b) hold-to-talk · (c) continuous or hands-free | **(a)** |
| OD4 | Final transcript | (a) send automatically · (b) put it in the text box for the user to edit or send | **(a)**. There are no order or clear tools, writes are reversible, and the transcript is shown. (b) is the safer choice if you prefer it, and costs one branch. |
| OD5 | Which replies are spoken | (a) only replies to voice turns · (b) all replies, with a "speak replies" toggle | **(a)**. It needs no setting. |
| OD6 | Barge-in | (a) manual: a microphone press cancels TTS · (b) automatic, detecting speech while TTS plays | **(a)**. (b) needs echo handling. |
| OD7 | Stop during processing | (a) mute the reply, never abort the HTTP turn · (b) abort the fetch | **(a)**. The turn may already have changed the cart, and aborting hides its reply. |
| OD8 | Contract change | (a) none: voice sends `{message}` · (b) add an optional `inputMode: "voice"` | **(a)**. Additive later, if a real model needs to shape spoken replies [L]. |
| OD9 | Unsupported browser | (a) no microphone button, a one-line hint · (b) render nothing | **(a)**. It explains the missing feature. It is not a disabled button, which honours ADR-0007's spirit. |
| OD10 | Language | (a) a fixed `en-US` constant · (b) the browser's `navigator.language` | **(a)**. The menu and replies are English. |
| OD11 | Recording the decision | (a) ADR-0023 supersedes ADR-0007 · (b) amend ADR-0007 | **(a)** |
| OD12 | Confirmation for sensitive actions | (a) none this phase: no voice-reachable action needs it, and the rule for later is recorded · (b) a voice-only confirmation step before any write | **(a)**. (b) would create a second, voice-only safety model. |

## 31. Implementation order (phases)

### Phase 1 — Shared turn path (refactor, no behaviour change)
- [ ] Extract `useAgentTurn` from `ChatInput`: the `inFlight` ref, the
  transcript, and send → dispatch → refresh → reply → apply.
- [ ] `ChatInput` uses it. Add `useAgentTurn.test.tsx` for `submit`
  returning the reply, or `null` when busy.
- **Done when:** AC1 holds. The existing `ChatInput.test.tsx` passes
  unedited. `pnpm --filter web` typecheck, lint and test pass.

### Phase 2 — Voice boundary
- [ ] `types.ts`, `voiceMessages.ts`, `browserSpeechToText.ts`,
  `browserTextToSpeech.ts`, `test/voiceFakes.ts`, and their tests.
- [ ] Add the ESLint block, verified with a temporary violating import,
  which is then removed.
- **Done when:** AC5–AC8 hold, and web typecheck, lint and test pass.

### Phase 3 — Voice session
- [ ] `voiceReducer.ts` and `useVoiceSession.ts`, with tests covering the
  transitions, stale ids, barge-in, mute, and the safety cap.
- **Done when:** AC9–AC13 hold.

### Phase 4 — UI integration
- [ ] `VoiceControl` (the buttons, the status region, the interim text, the
  disclosure, the unsupported hint, reduced motion), rendered in
  `ChatInput`.
- [ ] Integration tests: parity with text, ordering, one turn in flight, and
  accessibility.
- **Done when:** AC2–AC4 and AC14–AC18 hold, and `pnpm turbo run`
  typecheck, lint, test and build pass.

### Phase 5 — Docs, full validation, manual checks
- [ ] ADR-0023, marking ADR-0007 superseded, and the other §24 documents.
- [ ] The full validation set (§28), including the ai-service regression.
- [ ] The manual checks in `test-plan.md`, and the grep and diff checks
  (AC19, AC20).
- **Done when:** AC19–AC22 hold.

## 32. Expected final architecture

```text
 Browser (apps/web)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ ChatInput                                                                    │
 │   ├─ text form ───────────────────────────────┐                              │
 │   └─ VoiceControl ── useVoiceSession ─────────┤ submit(text)                 │
 │        │  (voiceReducer: idle/listening/      ▼                              │
 │        │   processing/speaking/error)     useAgentTurn  (one turn in flight) │
 │        │                                      │ sendAgentTurn → /api/ai/v1/agent/turns
 │        ├─ SpeechToText ◄─ browser STT [P]     │ ◄─ { reply, uiCommands? }    │
 │        └─ TextToSpeech ─► speaker             │ cart.refresh() → reply → dispatchBatch → uiStore
 │              ▲                                │                              │
 │              └──── reply (voice turns only, after commands) ◄─┘              │
 │  lib/voice ✗→ cartStore · lib/api · lib/commands · lib/agent · @contracts (ESLint) │
 └──────────────────────────────────────────────────────────────────────────────┘
                      │ unchanged
                      ▼
   ai-service (LangGraph · intent-validated tools · presentation tools) ──HTTP──► commerce-api ──► PostgreSQL
```

## Assumptions

| # | Assumption | Verified? |
| --- | --- | --- |
| A1 | No voice, audio or streaming infrastructure exists | **Yes** (a repository grep; ADR-0007; Phase 15 §14) |
| A2 | TS `lib.dom` has `SpeechSynthesis*` but no `SpeechRecognition` | **Yes** (`typescript@5.9.3` `lib.dom.d.ts`) |
| A3 | jsdom provides neither Speech API, so fakes are needed | **Partly.** No `SpeechRecognition` types or package are present. The absence at runtime is confirmed in Phase 2. |
| A4 | Browser support: Chromium and Safari have `(webkit)SpeechRecognition`, and Firefox does not | **No.** Based on general knowledge. Checked in the manual run. |
| A5 | Chromium may truncate long `speechSynthesis` utterances | **No.** It is a known report, not observed here. Checked manually (R4). |
| A6 | `SpeechRecognition.start()` triggers the permission prompt itself, so no `getUserMedia` is needed | **No.** Checked manually in Chrome. |
| A7 | Chromium's recognizer sends audio off-device by default | **No, not verifiable from this repository.** This is why OD2 is a human decision. |
| A8 | `ChatInput`'s logic can be extracted without changing any existing test assertion | **No.** Phase 1 verifies it. If an assertion must change, I stop and report. |
| A9 | `127.0.0.1` counts as a secure context for the microphone | **No.** Checked manually. |

## Not doing (deferred)

- A server-side or third-party STT/TTS provider, an audio upload endpoint,
  WebSocket, WebRTC or LiveKit
- Streaming the LLM, TTS or UI commands
- `inputMode` on the turn contract
- Automatic barge-in, echo cancellation, and hands-free listening or wake
  words
- Confirmation semantics for order or destructive tools, which belong to the
  phase that adds them
- Multi-language support, and voice or rate settings
- Server voice sessions, `conversationId`, and memory
- A `Permissions-Policy` header

## Follow-up (not done)

- FOLLOW-UP (not done): `apps/web/next.config.ts` — no `Permissions-Policy`
  header limits the microphone to this origin — add `headers()` with
  `microphone=(self)` and verify it with a live probe — LOW.
- Carried forward, unchanged: the Phase 15 follow-ups (an unknown
  `categoryId` empties the menu; the agent-unavailable copy; the case-variant
  proxy bypass), an idempotency key on `POST /v1/cart/items`, and a per-turn
  deadline. Voice makes a duplicate add *slightly* more likely only if a user
  repeats themselves. No retry is added.

## Specialised review needed?

- **Security / privacy: yes.** Microphone access and a third-party audio
  flow through the browser engine (OD2). Review the disclosure, the timing
  of the permission request, that no audio is handled by our code, the
  logging, and the ESLint boundary.
- **Performance: no.** It adds no network calls. STT and TTS are local or
  the browser's.
- **Data / migration: no.** It has no storage, schema or persistence change.

## As built (2026-09-27)

All five phases were implemented as approved. Deviations and findings,
each reported in its phase:

- **Phase 1: `ChatMessage` moved into `useAgentTurn.ts`.** `ChatTranscript`
  imports it and re-exports it, because nothing under `lib/` imports from
  `components/`. `useAgentTurn.submit` returns `null` synchronously when
  nothing was sent, so `ChatInput` clears its draft only for a real turn,
  exactly as before. A8 is confirmed: `ChatInput.test.tsx` passed with no
  edits.
- **Phases 2–3: the message limit is passed in.** §5 has the limit
  "imported by the hook, not by lib/voice", but §23 puts `useVoiceSession`
  in `lib/voice`, which cannot import contracts. `VoiceControl`
  (`components/voice/`) imports `MAX_TURN_MESSAGE_LENGTH` and passes it as
  `maxLength`.
- **Phase 4: speech starts after the "speaking" state renders**, in an
  effect keyed on status and turn. It no longer starts from the turn's
  promise. The AC3 ordering test caught the earlier version: `speak()` ran
  after the UI commands were dispatched but before they rendered.
- **Phase 4: `ChatInput` takes an optional `voice` prop** (the injected
  adapters). Only tests pass it. This follows the `RequestDeps` default
  pattern.
- **AC14 as approved, with a concern.** The microphone button changes its
  accessible name *and* sets `aria-pressed`. ARIA authoring guidance says to
  do one or the other. It is recorded as a follow-up.
- **getting-started's Phase 15 `web` count (364) was wrong.** The
  unchanged Phase 15 code has 338 tests. It is corrected there, and Phase
  16 brings it to 478.
- **Assumptions, as checked in Chrome 154 on Linux** (driven through
  DevTools):
  - **A6 and A9 are confirmed.** `127.0.0.1` is a secure context. One press
    gave exactly one `SpeechRecognition.start()`. Over 8 s with no
    interaction there were no starts. The microphone permission was already
    `granted` in that browser profile, so no prompt was shown.
  - **A4 is confirmed only for Chromium.** Firefox and Safari were not
    available.
  - **A7 is not verifiable from this repository.**
  - **A5 is not checked.** This machine has no speech voices
    (`getVoices()` returned 0), so Chrome raised `synthesis-failed`. The
    control showed "Couldn't play the reply — it's shown above", and the
    reply stayed on screen as text. **No audio was heard in any run.**
- **A voice turn in real Chrome, with only the audio capture scripted.**
  `SpeechRecognition.prototype.start` was replaced with one that delivers
  an interim result, then " add tiramisu " as the final result, then end.
  Everything else was real: our adapter, the session, the turn, the proxy,
  ai-service, commerce-api and `speechSynthesis`.
  - The recognizer settings were `en-US`, one utterance, interim results
    and one alternative.
  - The status went Listening… → Processing… → the playback-failed message.
  - The transcript line read "You: add tiramisu".
  - When `speak()` was called, the reply was already in the transcript and
    the cart already showed the new total.
  - Tiramisu went from 0 to 1 in the local cart. It was then removed, which
    restored the cart to how it was found (`garlic-bread ×1`).
- **Unexplained, not reproduced.** The first snapshot of the first tab
  showed the microphone as pressed, focused and "Listening…" with no action
  from the test. After a reload it was idle, and it stayed idle through an
  8 s watch. The focus suggests a click in the visible browser window, but
  this is unconfirmed.

- **Review finding 1 (MEDIUM), fixed at the human's request: option (a).**
  A typed turn sent while the microphone was still listening took the one
  in-flight slot. The final transcript was then refused by `submit`, and the
  session went quietly idle, so the utterance was lost with no message.
  `useVoiceSession` now calls `submit` *before* leaving "listening". A
  refusal becomes the new error kind `busy`, with the copy "Still working on
  your last message — try again in a moment." Nothing is sent, spoken or
  added to the transcript. The next press listens again.
  - The hook test "returns to idle when the shared turn refuses the text"
    now expects `busy`. That is the behaviour being fixed.
  - A `VoiceControl` test covers the interleaving.
  - Both tests fail with the old code, and pass with the new.
  - Send and the text box stay usable while listening, which is option (b)
    not taken.

- **Review LOW findings 2–6, fixed at the human's request**
  (`review-report.md`):
  - **2 (speaking could hang).** The TTS adapter now holds each utterance
    in a module-level set until it ends, fails or is cancelled.
    `interrupted`/`canceled` are silent only after the caller's own
    `cancel()`, and otherwise they are `playback-failed`. It cancels the
    browser's queue only when something is `speaking` or `pending`. One
    adapter test changed its expectation, from "never reported" to
    "reported unless we cancelled". That is the behaviour being fixed.
  - **3.** The mute control's name is now "Don't read reply aloud".
  - **4.** The ESLint voice block also matches `../../{state,api,commands,agent}/*`,
    for a future subfolder. It was verified with temporary violating files
    in `lib/voice/` and `lib/voice/zzsub/`: 12 of 12 expected errors, and
    the files were then removed.
  - **5a (AC9 amended).** A listening end with no accepted final result is
    now `error`/`no-speech`.
  - **5b (AC14 amended).** No `aria-pressed` on the microphone button.
  - **5c.** `next.config.ts` gains `headers()`: `Permissions-Policy:
    microphone=(self)` on every route. §24's "`next.config.ts` not
    modified" is superseded. A live probe of `pnpm --filter web dev` showed
    the header on `/`, `/cart`, `/checkout` and a 404 page. It is absent on
    the proxied `/api/*` JSON responses, where a permissions policy has no
    effect, and the rewrites are unchanged.
  - **6.** The disclosure now covers both directions: "Voice input and
    spoken replies use your browser's speech services, which may send your
    audio and the replies' text to their provider." A remote synthesis
    voice can receive the reply text, and restricting to on-device voices
    cannot guarantee otherwise, because the browser's default voice may
    itself be remote.

**Follow-up (not done)**

- Carried forward, unchanged: the Phase 15 follow-ups and the §8 gaps
  (an idempotency key on `POST /v1/cart/items`, a per-turn deadline).
