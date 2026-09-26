import { describe, expect, it } from "vitest";
import { INITIAL_VOICE_STATE, voiceReducer, type VoiceEvent, type VoiceState } from "./voiceReducer";
import type { VoiceStatus } from "./types";

// docs/features/phase-16-voice-interaction/requirements.md AC9, AC10.

// A state at `status` whose current ids are 3 (recognition) and 5 (turn).
function at(status: VoiceStatus, overrides: Partial<VoiceState> = {}): VoiceState {
  return {
    ...INITIAL_VOICE_STATE,
    status,
    recognitionId: 3,
    turnId: 5,
    error: status === "error" ? "no-speech" : null,
    ...overrides,
  };
}

// Every event, tagged with the current ids.
const EVENTS: Record<VoiceEvent["type"], VoiceEvent> = {
  START: { type: "START" },
  INTERIM: { type: "INTERIM", recognitionId: 3, text: "show me" },
  FINAL: { type: "FINAL", recognitionId: 3 },
  RECOGNITION_ERROR: { type: "RECOGNITION_ERROR", recognitionId: 3, kind: "permission-denied" },
  RECOGNITION_END: { type: "RECOGNITION_END", recognitionId: 3 },
  MUTE: { type: "MUTE" },
  REPLY: { type: "REPLY", turnId: 5, speak: true },
  SPOKEN: { type: "SPOKEN", turnId: 5 },
  PLAYBACK_ERROR: { type: "PLAYBACK_ERROR", turnId: 5 },
  STOP_SPEAKING: { type: "STOP_SPEAKING" },
};

// The only (status, event) pairs that change state (AC9). INTERIM keeps the
// status but updates the text; MUTE keeps it but sets `muted`.
const TRANSITIONS: Partial<Record<VoiceStatus, Partial<Record<VoiceEvent["type"], VoiceStatus>>>> = {
  idle: { START: "listening" },
  listening: {
    INTERIM: "listening",
    FINAL: "processing",
    RECOGNITION_ERROR: "error",
    RECOGNITION_END: "error",
  },
  processing: { MUTE: "processing", REPLY: "speaking" },
  speaking: { START: "listening", SPOKEN: "idle", PLAYBACK_ERROR: "error", STOP_SPEAKING: "idle" },
  error: { START: "listening" },
};

const STATUSES: VoiceStatus[] = ["idle", "listening", "processing", "speaking", "error"];

describe("voiceReducer — the transition table (AC9)", () => {
  for (const status of STATUSES) {
    for (const [type, event] of Object.entries(EVENTS)) {
      const expected = TRANSITIONS[status]?.[type as VoiceEvent["type"]];
      if (expected) {
        it(`${status} --${type}--> ${expected}`, () => {
          const next = voiceReducer(at(status), event);
          expect(next).not.toBe(at(status));
          expect(next.status).toBe(expected);
        });
      } else {
        it(`${status} --${type}--> no-op`, () => {
          const state = at(status);
          expect(voiceReducer(state, event)).toBe(state);
        });
      }
    }
  }
});

describe("voiceReducer — what each transition carries", () => {
  it("START opens a new recognition and clears the last error, interim and mute", () => {
    const next = voiceReducer(at("error", { interim: "old", muted: true }), EVENTS.START);
    expect(next).toMatchObject({
      status: "listening",
      recognitionId: 4,
      turnId: 5,
      interim: "",
      muted: false,
      error: null,
    });
  });

  it("INTERIM updates the display text only", () => {
    expect(voiceReducer(at("listening"), EVENTS.INTERIM)).toMatchObject({
      status: "listening",
      interim: "show me",
    });
  });

  it("FINAL starts a new turn and clears the interim text", () => {
    expect(voiceReducer(at("listening", { interim: "show me" }), EVENTS.FINAL)).toMatchObject({
      status: "processing",
      turnId: 6,
      interim: "",
    });
  });

  it("RECOGNITION_ERROR records the kind", () => {
    expect(voiceReducer(at("listening"), EVENTS.RECOGNITION_ERROR)).toMatchObject({
      status: "error",
      error: "permission-denied",
      interim: "",
    });
  });

  it("REPLY stays silent when speaking is not wanted, or the turn was muted", () => {
    expect(voiceReducer(at("processing"), { type: "REPLY", turnId: 5, speak: false }).status).toBe("idle");
    const muted = voiceReducer(at("processing"), EVENTS.MUTE);
    expect(muted.muted).toBe(true);
    expect(voiceReducer(muted, EVENTS.REPLY)).toMatchObject({ status: "idle", muted: false });
  });

  it("RECOGNITION_END with no accepted final result records no-speech", () => {
    expect(voiceReducer(at("listening", { interim: "add" }), EVENTS.RECOGNITION_END)).toMatchObject({
      status: "error",
      error: "no-speech",
      interim: "",
    });
  });

  it("PLAYBACK_ERROR records playback-failed", () => {
    expect(voiceReducer(at("speaking"), EVENTS.PLAYBACK_ERROR)).toMatchObject({
      status: "error",
      error: "playback-failed",
    });
  });

  it("MUTE twice is a no-op the second time", () => {
    const muted = voiceReducer(at("processing"), EVENTS.MUTE);
    expect(voiceReducer(muted, EVENTS.MUTE)).toBe(muted);
  });
});

describe("voiceReducer — stale events are ignored (AC10)", () => {
  it.each([
    { type: "INTERIM", recognitionId: 2, text: "late" },
    { type: "FINAL", recognitionId: 2 },
    { type: "RECOGNITION_ERROR", recognitionId: 2, kind: "no-speech" },
    { type: "RECOGNITION_END", recognitionId: 2 },
  ] satisfies VoiceEvent[])("ignores $type from an older recognizer", (event) => {
    const state = at("listening");
    expect(voiceReducer(state, event)).toBe(state);
  });

  it.each([
    { type: "REPLY", turnId: 4, speak: true },
    { type: "SPOKEN", turnId: 4 },
    { type: "PLAYBACK_ERROR", turnId: 4 },
  ] satisfies VoiceEvent[])("ignores $type for an older turn", (event) => {
    const state = at(event.type === "REPLY" ? "processing" : "speaking");
    expect(voiceReducer(state, event)).toBe(state);
  });
});
