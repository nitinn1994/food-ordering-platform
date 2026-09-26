import type { VoiceErrorKind, VoiceStatus } from "./types";

// Fixed voice copy — docs/features/phase-16-voice-interaction/plan.md §18–§20.
// Like lib/api/userMessages.ts: chosen by kind, never taken from the browser's
// error text. Every message offers a way forward, and none relies on voice.

export const VOICE_ERROR_MESSAGES: Record<VoiceErrorKind, string> = {
  "permission-denied":
    "Microphone access is blocked. Allow it in your browser settings, or type instead.",
  "no-microphone": "No microphone was found. You can type instead.",
  "no-speech": "I didn't catch that — try again.",
  "too-long": "That was too long — please try a shorter request.",
  busy: "Still working on your last message — try again in a moment.",
  "recognition-unavailable":
    "Voice recognition isn't available right now. You can type instead.",
  "recognition-failed": "Voice input didn't work. You can type instead.",
  "playback-failed": "Couldn't play the reply — it's shown above.",
};

// The live-region text for each non-error status (AC15). Idle announces
// nothing; an error announces its own message.
export const VOICE_STATUS_MESSAGES: Record<Exclude<VoiceStatus, "error">, string> = {
  idle: "",
  listening: "Listening…",
  processing: "Processing…",
  speaking: "Speaking…",
};

// Shown beside the microphone before its first use (plan.md OD2, AC17). It
// covers both directions: recognition may send the customer's audio, and a
// voice the browser does not synthesize on the device may send the reply's
// text (review finding 6).
export const VOICE_DISCLOSURE =
  "Voice input and spoken replies use your browser's speech services, which may send your audio and the replies' text to their provider.";

// Shown instead of the microphone where recognition is unsupported (AC16).
export const VOICE_UNSUPPORTED_HINT =
  "Voice input isn't available in this browser — type instead.";
