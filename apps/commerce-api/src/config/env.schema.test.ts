import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env.schema";

// DATABASE_URL is required (Phase 10), so every call below supplies it —
// otherwise each rejection test would pass merely because it was missing,
// whatever else was wrong.
const REQUIRED = {
  DATABASE_URL: "postgres://commerce:commerce@127.0.0.1:5432/commerce",
} as const;

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
    expect(parseEnv({ ...REQUIRED })).toEqual({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: 3001,
      LOG_LEVEL: "log",
      LOG_FORMAT: "json",
      DATABASE_URL: REQUIRED.DATABASE_URL,
      DATABASE_POOL_MAX: 10,
    });
  });

  it("coerces PORT from a numeric string", () => {
    expect(parseEnv({ ...REQUIRED, PORT: "4000" }).PORT).toBe(4000);
  });

  it("accepts every documented NODE_ENV, LOG_LEVEL, and LOG_FORMAT value", () => {
    for (const NODE_ENV of ["development", "test", "production"] as const) {
      expect(parseEnv({ ...REQUIRED, NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
    }
    for (const LOG_LEVEL of [
      "verbose",
      "debug",
      "log",
      "warn",
      "error",
      "fatal",
    ] as const) {
      expect(parseEnv({ ...REQUIRED, LOG_LEVEL }).LOG_LEVEL).toBe(LOG_LEVEL);
    }
    for (const LOG_FORMAT of ["json", "pretty"] as const) {
      expect(parseEnv({ ...REQUIRED, LOG_FORMAT }).LOG_FORMAT).toBe(LOG_FORMAT);
    }
  });

  it("rejects a non-numeric PORT, naming the field (AC4)", () => {
    const error = captureError(() => parseEnv({ ...REQUIRED, PORT: "abc" }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).fieldErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("PORT")]),
    );
  });

  it("rejects an out-of-range PORT", () => {
    expect(captureError(() => parseEnv({ ...REQUIRED, PORT: "70000" }))).toBeInstanceOf(
      EnvValidationError,
    );
  });

  it("rejects an unrecognised NODE_ENV", () => {
    expect(
      captureError(() => parseEnv({ ...REQUIRED, NODE_ENV: "staging" })),
    ).toBeInstanceOf(EnvValidationError);
  });

  it("rejects an empty HOST", () => {
    expect(captureError(() => parseEnv({ ...REQUIRED, HOST: "" }))).toBeInstanceOf(
      EnvValidationError,
    );
  });

  it("never includes the invalid value anywhere in its error (AC4)", () => {
    const marker = "totally-invalid-marker-9f3a";
    const error = captureError(() => parseEnv({ ...REQUIRED, NODE_ENV: marker }));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(marker);
  });

  it("rejects a missing DATABASE_URL, naming the field (Phase 10 AC13)", () => {
    const error = captureError(() => parseEnv({}));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).fieldErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("DATABASE_URL")]),
    );
  });

  it("accepts postgres:// and postgresql:// DATABASE_URLs", () => {
    for (const url of [
      "postgres://u:p@localhost:5432/db",
      "postgresql://u:p@db.internal/db",
    ]) {
      expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
    }
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    for (const url of ["not a url", "mysql://u:p@localhost/db", ""]) {
      expect(captureError(() => parseEnv({ DATABASE_URL: url }))).toBeInstanceOf(
        EnvValidationError,
      );
    }
  });

  it("never includes the DATABASE_URL, or its password, in its error (AC13)", () => {
    const secret = "s3cret-marker-7c1d";
    const error = captureError(() =>
      parseEnv({ DATABASE_URL: `mysql://user:${secret}@host/db` }),
    );
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as Error).message).not.toContain(secret);
    expect((error as EnvValidationError).fieldErrors.join(" ")).not.toContain(secret);
  });

  it("coerces DATABASE_POOL_MAX and rejects it outside 1–50", () => {
    expect(parseEnv({ ...REQUIRED, DATABASE_POOL_MAX: "5" }).DATABASE_POOL_MAX).toBe(5);
    for (const value of ["0", "51", "2.5", "many"]) {
      expect(
        captureError(() => parseEnv({ ...REQUIRED, DATABASE_POOL_MAX: value })),
      ).toBeInstanceOf(EnvValidationError);
    }
  });

  it("returns a frozen config object", () => {
    expect(Object.isFrozen(parseEnv({ ...REQUIRED }))).toBe(true);
  });
});
