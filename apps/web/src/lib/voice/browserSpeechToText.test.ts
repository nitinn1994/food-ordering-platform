import { describe, expect, it, vi } from "vitest";
import {
  createBrowserSpeechToText,
  recognitionErrorKind,
  type RecognitionConstructor,
  type RecognitionLike,
} from "./browserSpeechToText";
import { VOICE_LANG, type RecognitionOptions } from "./types";

// docs/features/phase-16-voice-interaction/requirements.md AC6–AC8. jsdom has
// no SpeechRecognition, so a fake constructor stands in for the browser's.

class FakeRecognition implements RecognitionLike {
  static instances: FakeRecognition[] = [];
  static startThrows = false;

  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 5;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  start = vi.fn(() => {
    if (FakeRecognition.startThrows) {
      throw new Error("InvalidStateError");
    }
  });
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }

  // Delivers the session's results so far, as the browser does.
  emit(results: { transcript: string; isFinal: boolean }[]) {
    this.onresult?.({
      results: Object.assign(
        results.map((result) => Object.assign([{ transcript: result.transcript }], { isFinal: result.isFinal })),
        { length: results.length },
      ),
    });
  }
}

function options(): RecognitionOptions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    lang: VOICE_LANG,
    onInterim: (text) => calls.push(`interim:${text}`),
    onFinal: (text) => calls.push(`final:${text}`),
    onError: (kind) => calls.push(`error:${kind}`),
    onEnd: () => calls.push("end"),
  };
}

function setup() {
  FakeRecognition.instances = [];
  FakeRecognition.startThrows = false;
  const stt = createBrowserSpeechToText({
    SpeechRecognition: FakeRecognition as unknown as RecognitionConstructor,
  });
  const opts = options();
  const handle = stt.start(opts);
  const recognition = FakeRecognition.instances[0];
  if (!recognition) {
    throw new Error("no recognizer was created");
  }
  return { stt, opts, handle, recognition };
}

describe("browser SpeechToText — feature detection (AC6)", () => {
  it("is unsupported, and does not throw, when neither constructor exists", () => {
    const stt = createBrowserSpeechToText({});
    expect(stt.isSupported).toBe(false);

    const opts = options();
    expect(() => stt.start(opts).stop()).not.toThrow();
    expect(opts.calls).toEqual(["error:recognition-failed", "end"]);
  });

  it("uses the webkit-prefixed constructor when the standard one is absent", () => {
    FakeRecognition.instances = [];
    const stt = createBrowserSpeechToText({
      webkitSpeechRecognition: FakeRecognition as unknown as RecognitionConstructor,
    });
    expect(stt.isSupported).toBe(true);
    stt.start(options());
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("is unsupported with the default scope in jsdom, which has no SpeechRecognition", () => {
    expect(createBrowserSpeechToText().isSupported).toBe(false);
  });
});

describe("browser SpeechToText — one utterance (AC7)", () => {
  it("configures one utterance with interim results in the voice language, and starts it", () => {
    const { recognition } = setup();

    expect(recognition.lang).toBe("en-US");
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.maxAlternatives).toBe(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it("reports interim text for display, then the final text once", () => {
    const { opts, recognition } = setup();

    recognition.emit([{ transcript: "show me", isFinal: false }]);
    recognition.emit([{ transcript: "show me the desserts", isFinal: true }]);
    recognition.emit([{ transcript: "show me the desserts again", isFinal: true }]);
    recognition.onend?.();

    expect(opts.calls).toEqual([
      "interim:show me",
      "final:show me the desserts",
      "end",
    ]);
  });

  it("passes the final text on as heard — trimming and limits belong to the session", () => {
    const { opts, recognition } = setup();

    recognition.emit([{ transcript: "   ", isFinal: true }]);

    expect(opts.calls).toEqual(["final:   "]);
  });

  it("stops and aborts the browser recognizer through the handle", () => {
    const { handle, recognition } = setup();

    handle.stop();
    handle.abort();

    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(recognition.abort).toHaveBeenCalledTimes(1);
  });

  it("reports recognition-failed and ends, without throwing, when start() throws", () => {
    FakeRecognition.instances = [];
    FakeRecognition.startThrows = true;
    const stt = createBrowserSpeechToText({
      SpeechRecognition: FakeRecognition as unknown as RecognitionConstructor,
    });
    const opts = options();

    expect(() => stt.start(opts)).not.toThrow();
    expect(opts.calls).toEqual(["error:recognition-failed", "end"]);
  });
});

describe("browser SpeechToText — errors map to a closed kind (AC8)", () => {
  it.each([
    ["not-allowed", "permission-denied"],
    ["service-not-allowed", "permission-denied"],
    ["audio-capture", "no-microphone"],
    ["no-speech", "no-speech"],
    ["network", "recognition-unavailable"],
    ["language-not-supported", "recognition-failed"],
    ["bad-grammar", "recognition-failed"],
    ["something-new", "recognition-failed"],
    ["constructor", "recognition-failed"],
    ["__proto__", "recognition-failed"],
  ])("maps %s to %s", (code, kind) => {
    expect(recognitionErrorKind(code)).toBe(kind);
  });

  it("does not report aborted, which follows the caller's own abort()", () => {
    const { opts, recognition } = setup();

    recognition.onerror?.({ error: "aborted" });
    recognition.onend?.();

    expect(opts.calls).toEqual(["end"]);
  });

  it("passes on only the kind, never the browser's error text", () => {
    const { opts, recognition } = setup();

    recognition.onerror?.({ error: "network", message: "Browser detail that must never render." } as {
      error: string;
    });

    expect(opts.calls).toEqual(["error:recognition-unavailable"]);
    expect(opts.calls.join(" ")).not.toContain("Browser detail");
  });
});
