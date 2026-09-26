import type { RecognitionHandle, RecognitionOptions, SpeechToText, VoiceErrorKind } from "./types";

// SpeechToText over the browser's Web Speech API — docs/features/phase-16-
// voice-interaction/plan.md §4, §5. The browser owns the microphone and the
// audio: this code never calls getUserMedia and never sees a sample; it gets
// strings back. start() triggers the permission prompt on the first press
// (AC17). Chromium's engine may send the audio to its vendor's service
// (plan.md OD2) — that is the browser's transport, not this app's.

// TypeScript's lib.dom has no SpeechRecognition types (plan.md A2), so the
// minimal surface used here is declared by hand rather than adding
// @types/dom-speech-recognition (plan.md §25).
type RecognitionAlternativeLike = { readonly transcript: string };
type RecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternativeLike | undefined;
};
type RecognitionEventLike = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: RecognitionResultLike | undefined;
  };
};
type RecognitionErrorEventLike = { readonly error: string };

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => RecognitionLike;

// Where the constructor is looked up: `window` in the browser, a fake in
// tests (jsdom has neither name, plan.md A3).
export type SpeechRecognitionScope = {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

// The browser's error codes (Web Speech API SpeechRecognitionErrorEvent.error)
// → the closed kind. "aborted" is absent: it follows the caller's own
// abort(), so it is not an error to report. Anything unlisted is
// recognition-failed (AC8).
// A Map, not an object literal, so a code such as "constructor" cannot hit
// a prototype key.
const ERROR_KINDS: ReadonlyMap<string, VoiceErrorKind> = new Map([
  ["not-allowed", "permission-denied"],
  ["service-not-allowed", "permission-denied"],
  ["audio-capture", "no-microphone"],
  ["no-speech", "no-speech"],
  ["network", "recognition-unavailable"],
  ["language-not-supported", "recognition-failed"],
]);

export function recognitionErrorKind(code: string): VoiceErrorKind | null {
  if (code === "aborted") {
    return null;
  }
  return ERROR_KINDS.get(code) ?? "recognition-failed";
}

function defaultScope(): SpeechRecognitionScope {
  // Server render and non-browser environments have no window.
  return typeof window === "undefined" ? {} : (window as unknown as SpeechRecognitionScope);
}

// One utterance's text so far. With continuous = false the browser keeps
// every result for this session in `results`, so it is read from the start
// each time.
function readResults(event: RecognitionEventLike): { finalText: string; interimText: string; isFinal: boolean } {
  let finalText = "";
  let interimText = "";
  let isFinal = false;
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript ?? "";
    interimText += transcript;
    if (result?.isFinal) {
      finalText += transcript;
      isFinal = true;
    }
  }
  return { finalText, interimText, isFinal };
}

export function createBrowserSpeechToText(scope: SpeechRecognitionScope = defaultScope()): SpeechToText {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;

  return {
    isSupported: Recognition !== undefined,

    start(options: RecognitionOptions): RecognitionHandle {
      if (Recognition === undefined) {
        options.onError("recognition-failed");
        options.onEnd();
        return { stop: () => {}, abort: () => {} };
      }

      let recognition: RecognitionLike;
      try {
        recognition = new Recognition();
      } catch {
        options.onError("recognition-failed");
        options.onEnd();
        return { stop: () => {}, abort: () => {} };
      }

      // One utterance, ended by the browser's own end-of-speech detection
      // (plan.md OD3); interim results for display only (AC7).
      recognition.lang = options.lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalDelivered = false;
      recognition.onresult = (event) => {
        if (finalDelivered) {
          return;
        }
        const { finalText, interimText, isFinal } = readResults(event);
        if (isFinal) {
          finalDelivered = true;
          options.onFinal(finalText);
        } else {
          options.onInterim(interimText);
        }
      };
      // Only the mapped kind is passed on — never the event's message (AC8).
      recognition.onerror = (event) => {
        const kind = recognitionErrorKind(event.error);
        if (kind !== null) {
          options.onError(kind);
        }
      };
      recognition.onend = () => options.onEnd();

      try {
        recognition.start();
      } catch {
        // For example InvalidStateError when a session is already running.
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        options.onError("recognition-failed");
        options.onEnd();
        return { stop: () => {}, abort: () => {} };
      }

      return {
        stop: () => recognition.stop(),
        abort: () => recognition.abort(),
      };
    },
  };
}
