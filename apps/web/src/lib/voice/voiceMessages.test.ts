import { describe, expect, it } from "vitest";
import {
  VOICE_DISCLOSURE,
  VOICE_ERROR_MESSAGES,
  VOICE_STATUS_MESSAGES,
  VOICE_UNSUPPORTED_HINT,
} from "./voiceMessages";

// docs/features/phase-16-voice-interaction/requirements.md AC8, AC15, AC16.

describe("voice copy", () => {
  it("has non-empty fixed copy for every error kind", () => {
    const kinds = Object.keys(VOICE_ERROR_MESSAGES);
    expect(kinds.sort()).toEqual(
      [
        "busy",
        "no-microphone",
        "no-speech",
        "permission-denied",
        "playback-failed",
        "recognition-failed",
        "recognition-unavailable",
        "too-long",
      ].sort(),
    );
    for (const message of Object.values(VOICE_ERROR_MESSAGES)) {
      expect(message.trim()).not.toBe("");
    }
  });

  it("offers typing as the way forward whenever voice input itself is unavailable", () => {
    for (const kind of [
      "permission-denied",
      "no-microphone",
      "recognition-unavailable",
      "recognition-failed",
    ] as const) {
      expect(VOICE_ERROR_MESSAGES[kind]).toMatch(/type instead/);
    }
    expect(VOICE_UNSUPPORTED_HINT).toMatch(/type instead/);
  });

  it("announces each active status, and nothing when idle", () => {
    expect(VOICE_STATUS_MESSAGES).toEqual({
      idle: "",
      listening: "Listening…",
      processing: "Processing…",
      speaking: "Speaking…",
    });
  });

  it("discloses that the browser's speech services may send audio and reply text to their provider", () => {
    expect(VOICE_DISCLOSURE).toMatch(/browser's speech services/);
    expect(VOICE_DISCLOSURE).toMatch(/your audio/);
    expect(VOICE_DISCLOSURE).toMatch(/replies' text/);
  });
});
