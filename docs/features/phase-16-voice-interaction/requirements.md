# Requirements — Phase 16: Voice Interaction

**Approval Status:** APPROVED (2026-09-27, OD1–OD12 as recommended)
**Approved by:** human reviewer, 2026-09-27 ("approved"; OD1–OD12 as recommended, including OD2 (a))
**Risk:** HIGH
**Path:** Full

## Risk justification

The highest dimension wins (`.claude/commands/forge.md`).

| Dimension | Level | Why |
| --- | --- | --- |
| Scope | MEDIUM | `apps/web` only, but it reverses an architectural decision (ADR-0007, "no voice surface") |
| Security impact | MEDIUM | A new input device (microphone). The transcript enters the existing validated turn path, so it opens no new trust boundary. |
| Data impact | **HIGH** | Voice audio is personal data. The recommended browser speech engine may send audio to the browser vendor's cloud service (OD2), which is a third-party data flow outside this repository's control. |
| API compatibility | LOW | No contract, route or schema changes (OD8) |
| Infrastructure | LOW | No new service, port, proxy path or environment variable |
| User / business impact | MEDIUM | A normal feature. A misheard phrase can change the cart through the existing tools, but nothing can place an order. |
| Reversibility | LOW | Web-only, and additive. It can be removed by reverting. |

Result: **HIGH → Full Path.** A specialised privacy and security review is
required (see `plan.md`, "Specialised review needed?").

## Problem

The platform's target is "voice, text, and touch" (`CLAUDE.md`). Today only
text and touch exist. ADR-0007 deferred voice until its constraints
(streaming, latency, interruption, partial transcripts) could be designed
against a real agent turn. Phases 12–15 now provide that turn:

```text
POST /api/ai/v1/agent/turns { message } → { reply, uiCommands? }
```

Voice can therefore be added as **another way to produce `message` and to
consume `reply`**, without a second agent, tool system, intent system or
commerce path.

## Goal

A customer can press a microphone button, speak a request, and hear the
reply. The spoken request travels through exactly the same turn as a typed
one: the same request body, the same proxy path, the same LangGraph agent,
the same tools and intents, the same cart re-read, and the same UI-command
dispatcher. Text input keeps working unchanged, including in browsers without
speech support.

## In scope

- One shared turn function in `apps/web`, used by both text and voice. It is
  extracted from `ChatInput` with no change in behaviour.
- A web-side voice boundary with two interfaces:
  - `SpeechToText`, with a browser adapter over the Web Speech API
    (`SpeechRecognition`) and a fake for tests
  - `TextToSpeech`, with a browser adapter over `speechSynthesis` and a fake
    for tests
- A client-only voice session state machine: `idle`, `listening`,
  `processing`, `speaking`, `error`. It uses a turn counter so a stale event
  cannot act on a newer turn.
- Tap-to-talk turn detection. The browser ends the utterance on silence, the
  user can tap again to stop, and a safety cap limits listening time.
- Manual barge-in: pressing the microphone while a reply is being spoken
  stops the speech and starts listening. There is also a "Stop speaking"
  control.
- Transcript visibility. The interim transcript is shown while listening, and
  final utterances and replies appear in the existing chat transcript.
- Fixed, user-friendly copy for microphone, recognition and synthesis errors.
- Accessibility: keyboard-operable controls, a visible recording state,
  announcements through `aria-live`, and a text fallback that always works.
- A disclosure that the browser's speech service processes the audio. It is
  shown before the first use of the microphone (OD2).
- An ESLint boundary: `src/lib/voice/**` cannot import cart state, the API
  client, the command dispatcher, the agent service or any contract package.
- Documentation that this phase would otherwise leave wrong: ADR-0023, which
  supersedes ADR-0007, system architecture, the product doc, and
  getting-started.

## Out of scope

- A server-side voice gateway, an audio upload endpoint, WebSocket, WebRTC,
  LiveKit or SSE (OD1)
- Any external STT/TTS provider SDK, API key or account (OD1, OD2)
- Changes to ai-service, commerce-api or `packages/contracts` (OD8)
- A `channel` or `inputMode` field on the agent-turn request (OD8, deferred)
- Streaming the LLM response, streaming TTS, or streaming UI commands
- Automatic voice-activity barge-in while the reply is playing (OD6)
- Hands-free continuous listening or wake words
- Confirmation dialogs for voice. No voice-reachable action needs one today
  (OD12).
- Persistent voice sessions, a server-side session id, conversation memory,
  and storing audio or transcripts
- A `Permissions-Policy` header (recorded as a follow-up)
- Languages other than English (OD10)
- Also out of scope, as the brief lists: RAG, embeddings, vector databases,
  long-term memory, MCP, multi-agent designs, new commerce APIs, payments,
  delivery tracking, notifications, Kubernetes, microservices, and any
  unrelated frontend redesign

## Acceptance criteria

**Shared turn path**

- [ ] **AC1.** `ChatInput`'s turn logic lives in one function or hook
  (`useAgentTurn`) that both text and voice call. The existing
  `ChatInput.test.tsx` cases pass without edits to their assertions.
- [ ] **AC2.** A voice utterance sends exactly the same HTTP request as the
  same text typed: `POST /api/ai/v1/agent/turns` with body
  `{"message": "<final transcript, trimmed>"}` and nothing else. A test
  compares the two `fetch` calls.
- [ ] **AC3.** A voice turn follows the Phase 15 order, and then speaks:
  receive the response, `cart.refresh()`, show the reply in the transcript,
  apply the UI commands through `dispatchBatch`, and only then call
  `TextToSpeech.speak(reply)`. A test asserts this order.
- [ ] **AC4.** Only one turn is in flight across both channels. While a text
  turn is pending the microphone is disabled, and while a voice turn is
  pending Send is disabled.

**Voice boundary**

- [ ] **AC5.** `src/lib/voice/**` imports none of `lib/state/*`, `lib/api/*`,
  `lib/commands/*`, `lib/agent/*` or `@contracts/*`. This is enforced by
  ESLint and verified with a temporary violating import. The existing
  `@contracts/agent-intents` ban still applies to those files.
- [ ] **AC6.** The browser adapters feature-detect
  (`SpeechRecognition ?? webkitSpeechRecognition`, `speechSynthesis`) and
  never throw on unsupported browsers. `isSupported` is `false` there.
- [ ] **AC7.** Recognition runs with `continuous = false` and
  `interimResults = true`. Only a final result is submitted. An empty or
  whitespace-only final result is not sent. A final result longer than
  `MAX_TURN_MESSAGE_LENGTH` is not sent, and the user sees fixed copy
  instead.
- [ ] **AC8.** The browser recognition error codes (`not-allowed`,
  `service-not-allowed`, `audio-capture`, `no-speech`, `network`, `aborted`,
  `language-not-supported`, and anything unknown) map to a closed
  `VoiceErrorKind`. Each kind has fixed copy, and the browser's error text is
  never shown or logged.

**Voice session**

- [ ] **AC9.** A pure reducer implements these transitions, and tests pin
  them: idle→listening, listening→processing, processing→speaking,
  speaking→idle, speaking→listening (barge-in), listening→idle (stop with no
  speech), any→error, error→listening. Every other event is a no-op.
  *Amended 2026-09-27 at the human's request (review finding 5a):* a stop or
  silence with no speech now goes listening→**error** (`no-speech`, "I didn't
  catch that — try again."), not listening→idle. Real Chrome ends a silent
  session without a `no-speech` error, which had left the customer with no
  message.
- [ ] **AC10.** An event tagged with an older turn id or recognizer instance
  is ignored. A test shows that a late `onFinal` from a stopped recognizer
  does not start a turn, and that a late TTS `onEnd` from a cancelled reply
  does not change state.
- [ ] **AC11.** Pressing the microphone while speaking cancels synthesis
  (`speechSynthesis.cancel()`) and starts listening. "Stop speaking"
  cancels synthesis and returns to idle.
- [ ] **AC12.** Stop during `processing` never aborts the HTTP turn. The
  reply is still shown and its commands still applied, but it is not spoken.
- [ ] **AC13.** Listening stops on its own after a fixed safety cap (15 s,
  a constant) if the browser has not ended it.

**UI and accessibility**

- [ ] **AC14.** The microphone control is a native `<button>`. It uses
  `aria-pressed` while listening and an accessible name that reflects the
  state. It can be operated with Enter and Space.
  *Amended 2026-09-27 at the human's request (review finding 5b):* no
  `aria-pressed`. The name alone carries the state ("Start voice input" /
  "Stop listening"), because ARIA guidance is to change the name *or* use a
  toggle, not both.
- [ ] **AC15.** The current voice status (Listening…, Processing…,
  Speaking…, or the error copy) is announced through a `role="status"`
  (`aria-live="polite"`) region. Recording is visibly distinct, and not by
  colour alone.
- [ ] **AC16.** Where recognition is unsupported, no microphone button is
  rendered. A one-line text hint is shown instead, and text chat works
  exactly as before.
- [ ] **AC17.** The microphone permission is requested only when the user
  first presses the microphone, never on page load. The disclosure (OD2) is
  visible before that first press.
- [ ] **AC18.** The interim transcript is rendered as text only, never as
  markup. Final utterances appear in the shared chat transcript as
  "You: …".

**Security, privacy and documentation**

- [ ] **AC19.** Nothing in the change logs, stores or transmits audio. No
  new `console.*` call carries a transcript or a reply. No new
  `localStorage` or `sessionStorage` write is added. This is verified by
  grep.
- [ ] **AC20.** There are no new npm or Python dependencies, no new
  environment variables, and no changes to ai-service, commerce-api or
  contract files. This is verified with `git diff --stat`.
- [ ] **AC21.** The documents in `plan.md` §24 are updated, and ADR-0023 is
  added (ADR-0007 is marked superseded).
- [ ] **AC22.** The full validation set runs, and the manual checks in
  `test-plan.md` are performed and reported.

## Open questions

These are the open decisions OD1–OD12 in `plan.md` §30. Each has a
recommendation, and each needs approval. The ones that shape everything else
are:

- **OD1:** the voice architecture (browser-native, or a server gateway)
- **OD2:** whether the browser's cloud speech engine is acceptable under
  `CLAUDE.md`'s "no real voice provider"
- **OD4:** whether a transcript is sent automatically or reviewed first
