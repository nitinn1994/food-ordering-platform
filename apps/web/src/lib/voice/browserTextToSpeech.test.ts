import { describe, expect, it, vi } from "vitest";
import {
  createBrowserTextToSpeech,
  liveUtteranceCount,
  pickVoice,
  type SynthesisLike,
  type UtteranceConstructor,
} from "./browserTextToSpeech";
import { VOICE_LANG, type SpeechOptions } from "./types";

// docs/features/phase-16-voice-interaction/plan.md §6, requirements.md AC6.
// jsdom has no speechSynthesis, so fakes stand in for it.

type FakeUtterance = {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function voice(lang: string, localService: boolean, name = `${lang}-${String(localService)}`) {
  return { lang, localService, name } as SpeechSynthesisVoice;
}

function setup(voices: SpeechSynthesisVoice[] = []) {
  const events: string[] = [];
  const utterances: FakeUtterance[] = [];
  const synthesis = {
    speaking: false,
    pending: false,
    speak: vi.fn((utterance: FakeUtterance) => events.push(`speak:${utterance.text}`)),
    cancel: vi.fn(() => events.push("cancel")),
    getVoices: vi.fn(() => voices),
  };
  class Utterance implements FakeUtterance {
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    onend: FakeUtterance["onend"] = null;
    onerror: FakeUtterance["onerror"] = null;
    constructor(readonly text: string) {
      utterances.push(this);
    }
  }
  const tts = createBrowserTextToSpeech({
    speechSynthesis: synthesis as unknown as SynthesisLike,
    SpeechSynthesisUtterance: Utterance as unknown as UtteranceConstructor,
  });
  const calls: string[] = [];
  const options: SpeechOptions = {
    lang: VOICE_LANG,
    onEnd: () => calls.push("end"),
    onError: (kind) => calls.push(`error:${kind}`),
  };
  return { tts, synthesis, events, utterances, calls, options };
}

function only(utterances: FakeUtterance[]): FakeUtterance {
  const [utterance] = utterances;
  if (!utterance || utterances.length !== 1) {
    throw new Error(`expected one utterance, got ${String(utterances.length)}`);
  }
  return utterance;
}

describe("browser TextToSpeech — feature detection (AC6)", () => {
  it("is unsupported with the default scope in jsdom, and speak() reports instead of throwing", () => {
    const tts = createBrowserTextToSpeech();
    expect(tts.isSupported).toBe(false);

    const calls: string[] = [];
    expect(() =>
      tts.speak("Hi", {
        lang: VOICE_LANG,
        onEnd: () => calls.push("end"),
        onError: (kind) => calls.push(`error:${kind}`),
      }),
    ).not.toThrow();
    expect(calls).toEqual(["error:playback-failed"]);
  });
});

describe("browser TextToSpeech — speaking a reply", () => {
  it("cancels anything still speaking, then speaks the whole reply in the voice language", () => {
    const { tts, synthesis, events, utterances, options } = setup();
    synthesis.speaking = true;

    tts.speak("Here are the desserts.", options);

    expect(events).toEqual(["cancel", "speak:Here are the desserts."]);
    expect(only(utterances).lang).toBe("en-US");
  });

  it("does not cancel when nothing is playing or queued", () => {
    const { tts, events, options } = setup();

    tts.speak("Hi", options);

    expect(events).toEqual(["speak:Hi"]);
  });

  it("cancels a queued utterance too", () => {
    const { tts, synthesis, events, options } = setup();
    synthesis.pending = true;

    tts.speak("Hi", options);

    expect(events).toEqual(["cancel", "speak:Hi"]);
  });

  it("reports the end once, even when the browser fires error and end", () => {
    const { tts, utterances, calls, options } = setup();

    tts.speak("Hi", options);
    const utterance = only(utterances);
    utterance.onerror?.({ error: "synthesis-failed" });
    utterance.onend?.();

    expect(calls).toEqual(["error:playback-failed"]);
  });

  it("holds each utterance until it ends, fails or is cancelled, so it cannot be collected mid-speech", () => {
    const { tts, utterances, options } = setup();
    const before = liveUtteranceCount();

    tts.speak("One", options);
    expect(liveUtteranceCount()).toBe(before + 1);
    utterances[0]?.onend?.();
    expect(liveUtteranceCount()).toBe(before);

    tts.speak("Two", options);
    utterances[1]?.onerror?.({ error: "synthesis-failed" });
    expect(liveUtteranceCount()).toBe(before);

    const handle = tts.speak("Three", options);
    handle.cancel();
    expect(liveUtteranceCount()).toBe(before);
  });

  it("reports a natural end", () => {
    const { tts, utterances, calls, options } = setup();

    tts.speak("Hi", options);
    only(utterances).onend?.();

    expect(calls).toEqual(["end"]);
  });

  it("reports nothing after the caller's cancel(), including the browser's interrupted error", () => {
    const { tts, synthesis, utterances, calls, options } = setup();

    const handle = tts.speak("Hi", options);
    handle.cancel();
    const utterance = only(utterances);
    utterance.onerror?.({ error: "interrupted" });
    utterance.onend?.();

    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it.each(["interrupted", "canceled"])(
    "reports %s as a playback failure when the caller did not cancel, so speaking cannot hang",
    (error) => {
      const { tts, utterances, calls, options } = setup();

      tts.speak("Hi", options);
      only(utterances).onerror?.({ error });

      expect(calls).toEqual(["error:playback-failed"]);
    },
  );

  it("reports playback-failed, without throwing, when speak() throws", () => {
    const { tts, synthesis, calls, options } = setup();
    synthesis.speak.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => tts.speak("Hi", options)).not.toThrow();
    expect(calls).toEqual(["error:playback-failed"]);
  });

  it("uses the chosen voice when one is available", () => {
    const local = voice("en-GB", true);
    const { tts, utterances, options } = setup([voice("fr-FR", true), voice("en-US", false), local]);

    tts.speak("Hi", options);

    expect(only(utterances).voice).toBe(local);
  });
});

describe("pickVoice", () => {
  it("prefers an on-device voice in the language", () => {
    const local = voice("en-US", true);
    expect(pickVoice([voice("en-US", false), voice("de-DE", true), local], "en-US")).toBe(local);
  });

  it("falls back to any voice in the language", () => {
    const remote = voice("en-US", false);
    expect(pickVoice([voice("de-DE", true), remote], "en-US")).toBe(remote);
  });

  it("returns null — the browser default — when no voice matches or none are loaded yet", () => {
    expect(pickVoice([voice("de-DE", true)], "en-US")).toBeNull();
    expect(pickVoice([], "en-US")).toBeNull();
  });
});
