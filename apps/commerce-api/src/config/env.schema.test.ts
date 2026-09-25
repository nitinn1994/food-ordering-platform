import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env.schema";

function captureError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("parseEnv", () => {
  it("applies every default when nothing is set", () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: 3001,
      LOG_LEVEL: "log",
      LOG_FORMAT: "json",
    });
  });

  it("coerces PORT from a numeric string", () => {
    expect(parseEnv({ PORT: "4000" }).PORT).toBe(4000);
  });

  it("accepts every documented NODE_ENV, LOG_LEVEL, and LOG_FORMAT value", () => {
    for (const NODE_ENV of ["development", "test", "production"] as const) {
      expect(parseEnv({ NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
    }
    for (const LOG_LEVEL of [
      "verbose",
      "debug",
      "log",
      "warn",
      "error",
      "fatal",
    ] as const) {
      expect(parseEnv({ LOG_LEVEL }).LOG_LEVEL).toBe(LOG_LEVEL);
    }
    for (const LOG_FORMAT of ["json", "pretty"] as const) {
      expect(parseEnv({ LOG_FORMAT }).LOG_FORMAT).toBe(LOG_FORMAT);
    }
  });

  it("rejects a non-numeric PORT, naming the field (AC4)", () => {
    const error = captureError(() => parseEnv({ PORT: "abc" }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).fieldErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("PORT")]),
    );
  });

  it("rejects an out-of-range PORT", () => {
    expect(captureError(() => parseEnv({ PORT: "70000" }))).toBeInstanceOf(
      EnvValidationError,
    );
  });

  it("rejects an unrecognised NODE_ENV", () => {
    expect(
      captureError(() => parseEnv({ NODE_ENV: "staging" })),
    ).toBeInstanceOf(EnvValidationError);
  });

  it("rejects an empty HOST", () => {
    expect(captureError(() => parseEnv({ HOST: "" }))).toBeInstanceOf(
      EnvValidationError,
    );
  });

  it("never includes the invalid value anywhere in its error (AC4)", () => {
    const marker = "totally-invalid-marker-9f3a";
    const error = captureError(() => parseEnv({ NODE_ENV: marker }));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(marker);
  });

  it("returns a frozen config object", () => {
    expect(Object.isFrozen(parseEnv({}))).toBe(true);
  });
});
