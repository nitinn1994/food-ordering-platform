import type { SpeechHandle, SpeechOptions, TextToSpeech } from "./types";

// TextToSpeech over the browser's speechSynthesis — docs/features/phase-16-
// voice-interaction/plan.md §6. The reply is spoken whole: it is only known
// when the turn ends. It is a string in and sound out, with no commerce
// logic; what is spoken is exactly the reply already shown as text.

// The surface used here, so tests can pass a fake (jsdom has none).
export type SynthesisLike = Pick<
  SpeechSynthesis,
  "speak" | "cancel" | "getVoices" | "speaking" | "pending"
>;
export type UtteranceConstructor = new (text: string) => SpeechSynthesisUtterance;

export type SpeechSynthesisScope = {
  speechSynthesis?: SynthesisLike;
  SpeechSynthesisUtterance?: UtteranceConstructor;
};

// Every utterance handed to the browser and not yet settled or cancelled.
// Chromium can garbage-collect an utterance nothing references before its
// end event fires, which would leave the caller "speaking" forever (review
// finding 2); holding it here until it settles prevents that.
const liveUtterances = new Set<SpeechSynthesisUtterance>();

function defaultScope(): SpeechSynthesisScope {
  return typeof window === "undefined" ? {} : (window as unknown as SpeechSynthesisScope);
}

// Prefer a voice synthesized on this device (localService), so the reply
// text is not sent to a remote voice service; then any voice in the
// language; otherwise the browser's default (plan.md §6). The voice list can
// still be empty on first use in some browsers, which leaves the default.
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | null {
  const language = lang.split("-")[0]?.toLowerCase() ?? "";
  const inLanguage = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  return inLanguage.find((voice) => voice.localService) ?? inLanguage[0] ?? null;
}

// For tests: how many utterances are still held.
export function liveUtteranceCount(): number {
  return liveUtterances.size;
}

export function createBrowserTextToSpeech(scope: SpeechSynthesisScope = defaultScope()): TextToSpeech {
  const synthesis = scope.speechSynthesis;
  const Utterance = scope.SpeechSynthesisUtterance;

  return {
    isSupported: synthesis !== undefined && Utterance !== undefined,

    speak(text: string, options: SpeechOptions): SpeechHandle {
      // Settled once: by the first end or error, or by the caller's cancel(),
      // after which nothing is reported (Chromium fires error then end). So
      // "interrupted"/"canceled" after the caller's own cancel() is silent,
      // but the same errors arriving any other way — Chromium can interrupt
      // an utterance it was just handed — are a failure, not a silence that
      // would leave the caller waiting for an end (review finding 2).
      let settled = false;
      let utterance: SpeechSynthesisUtterance | null = null;
      const release = () => {
        settled = true;
        if (utterance) {
          liveUtterances.delete(utterance);
        }
      };
      const settle = (report: () => void) => {
        if (!settled) {
          release();
          report();
        }
      };

      if (synthesis === undefined || Utterance === undefined) {
        settle(() => options.onError("playback-failed"));
        return { cancel: () => {} };
      }

      try {
        // Never queue behind an earlier reply — but cancel only when something
        // is playing or queued: a cancel() just before speak() is what
        // Chromium is reported to interrupt the new utterance after.
        if (synthesis.speaking || synthesis.pending) {
          synthesis.cancel();
        }
        utterance = new Utterance(text);
        utterance.lang = options.lang;
        const voice = pickVoice(synthesis.getVoices(), options.lang);
        if (voice) {
          utterance.voice = voice;
        }
        utterance.onend = () => settle(options.onEnd);
        utterance.onerror = () => settle(() => options.onError("playback-failed"));
        liveUtterances.add(utterance);
        synthesis.speak(utterance);
      } catch {
        settle(() => options.onError("playback-failed"));
        return { cancel: () => {} };
      }

      return {
        cancel: () => {
          release();
          synthesis.cancel();
        },
      };
    },
  };
}
