import type { VoiceErrorKind, VoiceStatus } from "./types";

// The voice session's state machine — docs/features/phase-16-voice-
// interaction/plan.md §8, §11, AC9, AC10. Pure: no timers, no browser APIs,
// no I/O. Presentation/session state only — it never holds, or stands in
// for, cart or order state, and nothing here is persisted or sent anywhere.
//
//   idle ──START──► listening ──FINAL──► processing ──REPLY(speak)──► speaking ──SPOKEN──► idle
//                      │                     └──REPLY(silent)──► idle             │  │
//                      └─RECOGNITION_ERROR / RECOGNITION_END─► error ◄─PLAYBACK_ERROR┘  │
//                                              │                                    │
//   error ──START──► listening        speaking ──START (barge-in)──► listening      │
//                                     speaking ──STOP_SPEAKING──► idle ◄────────────┘
//
// Race protection: every recognizer event carries the recognitionId it was
// started with, every reply/playback event the turnId it belongs to. An
// event whose id is not the current one is ignored, so a late result from a
// stopped recognizer cannot start a turn and a late end from a cancelled
// reply cannot end a newer one (AC10). Every event not listed for the
// current status is a no-op, returning the same state object.

export type VoiceState = {
  status: VoiceStatus;
  // Incremented when a final transcript is accepted as a turn.
  turnId: number;
  // Incremented on every START; tags that recognizer's events.
  recognitionId: number;
  // The interim transcript, for display only. Cleared whenever listening ends.
  interim: string;
  // "Don't speak this turn's reply" — Stop pressed while processing (AC12).
  muted: boolean;
  error: VoiceErrorKind | null;
};

export type VoiceEvent =
  | { type: "START" }
  | { type: "INTERIM"; recognitionId: number; text: string }
  | { type: "FINAL"; recognitionId: number }
  | { type: "RECOGNITION_ERROR"; recognitionId: number; kind: VoiceErrorKind }
  | { type: "RECOGNITION_END"; recognitionId: number }
  | { type: "MUTE" }
  | { type: "REPLY"; turnId: number; speak: boolean }
  | { type: "SPOKEN"; turnId: number }
  | { type: "PLAYBACK_ERROR"; turnId: number }
  | { type: "STOP_SPEAKING" };

export const INITIAL_VOICE_STATE: VoiceState = {
  status: "idle",
  turnId: 0,
  recognitionId: 0,
  interim: "",
  muted: false,
  error: null,
};

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "START":
      // From speaking this is barge-in: the caller cancels playback first.
      if (state.status === "idle" || state.status === "error" || state.status === "speaking") {
        return {
          ...state,
          status: "listening",
          recognitionId: state.recognitionId + 1,
          interim: "",
          muted: false,
          error: null,
        };
      }
      return state;

    case "INTERIM":
      if (isCurrentRecognition(state, event.recognitionId)) {
        return { ...state, interim: event.text };
      }
      return state;

    case "FINAL":
      if (isCurrentRecognition(state, event.recognitionId)) {
        return { ...state, status: "processing", turnId: state.turnId + 1, interim: "" };
      }
      return state;

    case "RECOGNITION_ERROR":
      if (isCurrentRecognition(state, event.recognitionId)) {
        return { ...state, status: "error", interim: "", error: event.kind };
      }
      return state;

    case "RECOGNITION_END":
      // Ended while still listening: no final result was accepted — the
      // customer stopped, or stayed silent. Real Chrome ends a silent
      // session without a no-speech error, so it is reported here, never as
      // a silent return to idle (Phase 16 review finding 5a).
      if (isCurrentRecognition(state, event.recognitionId)) {
        return { ...state, status: "error", interim: "", error: "no-speech" };
      }
      return state;

    case "MUTE":
      if (state.status === "processing" && !state.muted) {
        return { ...state, muted: true };
      }
      return state;

    case "REPLY":
      if (state.status === "processing" && event.turnId === state.turnId) {
        return {
          ...state,
          status: event.speak && !state.muted ? "speaking" : "idle",
          muted: false,
        };
      }
      return state;

    case "SPOKEN":
      if (state.status === "speaking" && event.turnId === state.turnId) {
        return { ...state, status: "idle" };
      }
      return state;

    case "PLAYBACK_ERROR":
      if (state.status === "speaking" && event.turnId === state.turnId) {
        return { ...state, status: "error", error: "playback-failed" };
      }
      return state;

    case "STOP_SPEAKING":
      if (state.status === "speaking") {
        return { ...state, status: "idle" };
      }
      return state;
  }
}

function isCurrentRecognition(state: VoiceState, recognitionId: number): boolean {
  return state.status === "listening" && recognitionId === state.recognitionId;
}
