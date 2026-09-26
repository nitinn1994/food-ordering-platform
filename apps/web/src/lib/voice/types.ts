// The voice boundary — docs/features/phase-16-voice-interaction/plan.md §5–§8.
// Voice is an input/output adapter on the existing text turn: speech in
// becomes a transcript string, a reply string becomes speech out. Everything
// else in apps/web sees only these interfaces, strings, and a closed error
// kind — never a browser speech object, never audio. Provider-specific code
// lives only in browserSpeechToText.ts and browserTextToSpeech.ts.
//
// Nothing in lib/voice may reach cart state, the API client, the command
// dispatcher, the agent turn, or any contract (eslint.config.mjs, AC5).

// The one recognition and synthesis language (plan.md OD10): the page is
// <html lang="en"> and the menu is English.
export const VOICE_LANG = "en-US";

// Safety cap on one utterance, in case the browser never ends it on its own
// (plan.md §5, AC13).
export const MAX_LISTEN_MS = 15_000;

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error";

// Every failure the voice layer can report (plan.md §19). Browser error
// codes and messages never leave the adapters: they map to one of these, and
// each has fixed copy in voiceMessages.ts.
export type VoiceErrorKind =
  | "permission-denied"
  | "no-microphone"
  | "no-speech"
  | "too-long"
  // A turn from another channel (typed text) is already in flight, so the
  // utterance was not sent (Phase 16 review finding 1).
  | "busy"
  | "recognition-unavailable"
  | "recognition-failed"
  | "playback-failed";

export type RecognitionOptions = {
  lang: string;
  // Display only — never submitted (plan.md §5).
  onInterim: (text: string) => void;
  // The utterance as heard, untrimmed. At most once per start().
  onFinal: (text: string) => void;
  // Not called for a stop or abort the caller asked for.
  onError: (kind: VoiceErrorKind) => void;
  // The recognizer has finished, for any reason.
  onEnd: () => void;
};

export type RecognitionHandle = {
  // Stop listening; a final result the browser already has may still arrive.
  stop: () => void;
  // Stop listening and discard any result.
  abort: () => void;
};

export interface SpeechToText {
  readonly isSupported: boolean;
  start(options: RecognitionOptions): RecognitionHandle;
}

export type SpeechOptions = {
  lang: string;
  // Playback finished on its own. Not called after cancel().
  onEnd: () => void;
  // Playback failed. Not called for the caller's own cancel().
  onError: (kind: "playback-failed") => void;
};

export type SpeechHandle = {
  cancel: () => void;
};

export interface TextToSpeech {
  readonly isSupported: boolean;
  speak(text: string, options: SpeechOptions): SpeechHandle;
}
