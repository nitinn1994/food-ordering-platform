import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceSession, type VoiceSubmit } from "./useVoiceSession";
import { MAX_LISTEN_MS } from "./types";
import { FakeSpeechToText, FakeTextToSpeech } from "../../test/voiceFakes";
import { deferred } from "../../test/fetchStub";

// docs/features/phase-16-voice-interaction/requirements.md AC7, AC10–AC13.
// The adapters are fakes; `submit` stands in for the shared text turn
// (useAgentTurn), which ChatInput/VoiceControl tests exercise for real.

type Outcome = { reply: string; failed: boolean };

function setup({
  submit,
  stt = new FakeSpeechToText(),
  tts = new FakeTextToSpeech(),
  maxLength = 2000,
}: { submit?: VoiceSubmit; stt?: FakeSpeechToText; tts?: FakeTextToSpeech; maxLength?: number } = {}) {
  const turn = deferred<Outcome>();
  const submitFn = vi.fn<VoiceSubmit>(submit ?? (() => turn.promise));
  const hook = renderHook(() => useVoiceSession({ stt, tts, submit: submitFn, maxLength }));
  return { hook, stt, tts, submit: submitFn, turn };
}

async function settle(promise: Promise<unknown>) {
  await act(async () => {
    await promise;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useVoiceSession — a voice turn", () => {
  it("listens, shows interim text, submits the trimmed final text, then speaks the reply", async () => {
    const { hook, stt, tts, submit, turn } = setup();

    act(() => hook.result.current.start());
    expect(hook.result.current.state.status).toBe("listening");
    expect(stt.latest.options.lang).toBe("en-US");

    act(() => stt.latest.interim("show me"));
    expect(hook.result.current.state.interim).toBe("show me");

    act(() => stt.latest.final("  show me the desserts "));
    expect(hook.result.current.state.status).toBe("processing");
    expect(submit).toHaveBeenCalledExactlyOnceWith("show me the desserts");
    expect(tts.utterances).toHaveLength(0);

    turn.resolve({ reply: "Here are the desserts.", failed: false });
    await settle(turn.promise);
    expect(hook.result.current.state.status).toBe("speaking");
    expect(tts.latest.text).toBe("Here are the desserts.");
    expect(tts.latest.options.lang).toBe("en-US");

    act(() => tts.latest.finish());
    expect(hook.result.current.state.status).toBe("idle");
  });

  it("the recognizer's end after an accepted final does not interrupt the turn", () => {
    const { hook, stt } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    act(() => stt.latest.end());

    expect(hook.result.current.state.status).toBe("processing");
  });

  it("does not speak failure copy", async () => {
    const { hook, stt, tts, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.resolve({ reply: "Something went wrong on our side. Please try again.", failed: true });
    await settle(turn.promise);

    expect(hook.result.current.state.status).toBe("idle");
    expect(tts.utterances).toHaveLength(0);
  });

  it("shows replies as text only, never speaking, when synthesis is unsupported", async () => {
    const { hook, stt, tts, turn } = setup({ tts: new FakeTextToSpeech(false) });

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.resolve({ reply: "Hi", failed: false });
    await settle(turn.promise);

    expect(hook.result.current.state.status).toBe("idle");
    expect(tts.utterances).toHaveLength(0);
  });

  it("reports busy, never dropping the utterance silently, when the shared turn refuses it", () => {
    const { hook, stt, tts } = setup({ submit: () => null });

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));

    expect(hook.result.current.state).toMatchObject({ status: "error", error: "busy", turnId: 0 });
    expect(tts.utterances).toHaveLength(0);

    act(() => hook.result.current.start());
    expect(hook.result.current.state).toMatchObject({ status: "listening", error: null });
  });

  it("ends in idle, not stuck, if the turn's promise rejects", async () => {
    const { hook, stt, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.reject(new Error("unexpected"));
    await settle(turn.promise.catch(() => undefined));

    expect(hook.result.current.state.status).toBe("idle");
  });

  it("reports a playback failure as an error", async () => {
    const { hook, stt, tts, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.resolve({ reply: "Hi", failed: false });
    await settle(turn.promise);
    act(() => tts.latest.fail());

    expect(hook.result.current.state).toMatchObject({ status: "error", error: "playback-failed" });
  });
});

describe("useVoiceSession — what is not sent (AC7)", () => {
  it("sends nothing for an empty or whitespace-only final result", () => {
    const { hook, stt, submit } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("   "));

    expect(submit).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ status: "error", error: "no-speech" });
  });

  it("sends nothing for a final result longer than the message limit", () => {
    const { hook, stt, submit } = setup({ maxLength: 10 });

    act(() => hook.result.current.start());
    act(() => stt.latest.final("x".repeat(11)));

    expect(submit).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ status: "error", error: "too-long" });
  });

  it("never submits interim text", () => {
    const { hook, stt, submit } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.interim("add ten"));
    act(() => stt.latest.end());

    expect(submit).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ status: "error", error: "no-speech" });
  });

  it("shows a recognizer error and recovers on the next start", () => {
    const { hook, stt } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.error("permission-denied"));
    expect(hook.result.current.state).toMatchObject({ status: "error", error: "permission-denied" });

    act(() => hook.result.current.start());
    expect(hook.result.current.state).toMatchObject({ status: "listening", error: null });
    expect(stt.sessions).toHaveLength(2);
  });
});

describe("useVoiceSession — stale events (AC10)", () => {
  it("a late final result from a stopped recognizer does not start a turn", () => {
    const { hook, stt, submit } = setup();

    act(() => hook.result.current.start());
    const first = stt.latest;
    act(() => first.error("no-speech"));
    act(() => hook.result.current.start());
    act(() => first.final("add tiramisu"));

    expect(submit).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe("listening");
  });

  it("a late end from a cancelled reply does not change the newer state", async () => {
    const { hook, stt, tts, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.resolve({ reply: "Hi", failed: false });
    await settle(turn.promise);
    const cancelled = tts.latest;

    act(() => hook.result.current.start());
    act(() => cancelled.finish());

    expect(cancelled.cancelled).toBe(true);
    expect(hook.result.current.state.status).toBe("listening");
  });
});

describe("useVoiceSession — interruption (AC11, AC12)", () => {
  async function speaking() {
    const context = setup();
    act(() => context.hook.result.current.start());
    act(() => context.stt.latest.final("hello"));
    context.turn.resolve({ reply: "Hi", failed: false });
    await settle(context.turn.promise);
    expect(context.hook.result.current.state.status).toBe("speaking");
    return context;
  }

  it("start while speaking cancels playback, then listens (barge-in)", async () => {
    const { hook, stt, tts } = await speaking();

    act(() => hook.result.current.start());

    expect(tts.latest.cancelled).toBe(true);
    expect(stt.sessions).toHaveLength(2);
    expect(hook.result.current.state.status).toBe("listening");
  });

  it("Stop speaking cancels playback and returns to idle", async () => {
    const { hook, tts } = await speaking();

    act(() => hook.result.current.stopSpeaking());

    expect(tts.latest.cancelled).toBe(true);
    expect(hook.result.current.state.status).toBe("idle");
  });

  it("mute while processing never aborts the turn: it completes, but is not spoken", async () => {
    const { hook, stt, tts, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("add tiramisu"));
    act(() => hook.result.current.mute());
    expect(hook.result.current.state).toMatchObject({ status: "processing", muted: true });

    turn.resolve({ reply: "Added Tiramisu.", failed: false });
    await settle(turn.promise);

    expect(hook.result.current.state.status).toBe("idle");
    expect(tts.utterances).toHaveLength(0);
  });

  it("start is ignored while processing", () => {
    const { hook, stt } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    act(() => hook.result.current.start());

    expect(stt.sessions).toHaveLength(1);
    expect(hook.result.current.state.status).toBe("processing");
  });

  it("stopListening stops — not aborts — so a final result still arrives and is used", () => {
    const { hook, stt, submit } = setup();

    act(() => hook.result.current.start());
    act(() => hook.result.current.stopListening());
    expect(stt.latest.stopped).toBe(true);
    expect(stt.latest.aborted).toBe(false);

    act(() => stt.latest.final("hello"));
    expect(submit).toHaveBeenCalledExactlyOnceWith("hello");
  });
});

describe("useVoiceSession — the safety cap and leaving (AC13)", () => {
  it("stops listening after MAX_LISTEN_MS if the browser has not ended it", () => {
    vi.useFakeTimers();
    const { hook, stt } = setup();

    act(() => hook.result.current.start());
    act(() => vi.advanceTimersByTime(MAX_LISTEN_MS - 1));
    expect(stt.latest.stopped).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(stt.latest.stopped).toBe(true);
  });

  it("does not stop a later recognition when an earlier one ended in time", () => {
    vi.useFakeTimers();
    const { hook, stt } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.end());
    act(() => vi.advanceTimersByTime(MAX_LISTEN_MS / 2));
    act(() => hook.result.current.start());
    act(() => vi.advanceTimersByTime(MAX_LISTEN_MS / 2 + 1));

    expect(stt.latest.stopped).toBe(false);
  });

  it("aborts listening and cancels speech on unmount", async () => {
    const { hook, stt, tts, turn } = setup();

    act(() => hook.result.current.start());
    act(() => stt.latest.final("hello"));
    turn.resolve({ reply: "Hi", failed: false });
    await settle(turn.promise);
    act(() => hook.result.current.start());

    hook.unmount();

    expect(stt.latest.aborted).toBe(true);
    expect(tts.latest.cancelled).toBe(true);
  });
});
