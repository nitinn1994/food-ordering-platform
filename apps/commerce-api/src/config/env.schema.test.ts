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
      DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
      ALLOW_LOOPBACK_DATABASE: false,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("coerces PORT from a numeric string", () => {
    expect(parseEnv({ ...REQUIRED, PORT: "4000" }).PORT).toBe(4000);
  });

  it("accepts every documented NODE_ENV, LOG_LEVEL, and LOG_FORMAT value", () => {
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(parseEnv({ ...REQUIRED, NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
    }
    // Production also needs DATABASE_SSL and a non-loopback database
    // (Phase 18 — see "production rules" below).
    expect(
      parseEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://u:p@db.internal/db",
        DATABASE_SSL: "require",
      }).NODE_ENV,
    ).toBe("production");
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

  // Phase 18 (plan.md §20 C-3, OD14; requirements.md AC7, AC10).
  describe("production rules (Phase 18)", () => {
    const PRODUCTION = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://app:marker-pass@db.internal:5432/commerce",
      DATABASE_SSL: "verify-full",
    } as const;

    function fieldErrorsOf(source: Record<string, string>): readonly string[] {
      const error = captureError(() => parseEnv(source));
      expect(error).toBeInstanceOf(EnvValidationError);
      return (error as EnvValidationError).fieldErrors;
    }

    it("accepts a remote database with DATABASE_SSL set", () => {
      const config = parseEnv({ ...PRODUCTION });
      expect(config.DATABASE_SSL).toBe("verify-full");
    });

    it("requires DATABASE_SSL", () => {
      const withoutSsl = { NODE_ENV: PRODUCTION.NODE_ENV, DATABASE_URL: PRODUCTION.DATABASE_URL };
      expect(fieldErrorsOf(withoutSsl)).toEqual([
        "DATABASE_SSL (required when NODE_ENV=production)",
      ]);
    });

    it("accepts DATABASE_SSL=disable as an explicit choice", () => {
      expect(parseEnv({ ...PRODUCTION, DATABASE_SSL: "disable" }).DATABASE_SSL).toBe("disable");
    });

    it.each([
      "postgres://u:p@localhost:5432/db",
      "postgres://u:p@127.0.0.1:5432/db",
      "postgres://u:p@127.10.0.3/db",
      "postgres://u:p@[::1]:5432/db",
      "postgres:///db?host=/var/run/postgresql",
      // Spellings a non-special URL leaves uncanonicalised (Phase 18
      // security review S2).
      "postgres://u:p@LOCALHOST/db",
      "postgres://u:p@localhost./db",
      "postgres://u:p@0.0.0.0/db",
      "postgres://u:p@[::]/db",
      "postgres://u:p@[::ffff:127.0.0.1]/db",
      "postgres://u:p@[0:0:0:0:0:0:0:1]/db",
      "postgres://u:p@2130706433/db",
      "postgres://u:p@0x7f000001/db",
      "postgres://u:p@0177.0.0.1/db",
    ])("refuses the loopback database %s unless allowed", (url) => {
      expect(fieldErrorsOf({ ...PRODUCTION, DATABASE_URL: url })).toEqual([
        expect.stringMatching(/^DATABASE_URL \(loopback host refused/),
      ]);
      expect(
        parseEnv({ ...PRODUCTION, DATABASE_URL: url, ALLOW_LOOPBACK_DATABASE: "true" })
          .ALLOW_LOOPBACK_DATABASE,
      ).toBe(true);
    });

    it.each([
      "postgres://u:p@db.internal:5432/db",
      "postgres://u:p@10.0.0.5/db",
      "postgres://u:p@127db.example.com/db",
      "postgres://u:p@[2001:db8::1]/db",
      // Valid for postgres: but not for http:, which must not crash the check.
      "postgres://u:p@db%20x/db",
    ])("accepts the non-loopback database %s", (url) => {
      expect(parseEnv({ ...PRODUCTION, DATABASE_URL: url }).DATABASE_URL).toBe(url);
    });

    it("never prints the DATABASE_URL in a production-rule error", () => {
      const error = captureError(() =>
        parseEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://u:marker-pass@localhost/db" }),
      );
      expect((error as Error).message).not.toContain("marker-pass");
      expect((error as Error).message).not.toContain("localhost");
    });

    it("leaves development defaults unchanged: loopback and no TLS are fine", () => {
      expect(() => parseEnv({ ...REQUIRED })).not.toThrow();
      expect(() => parseEnv({ ...REQUIRED, NODE_ENV: "test" })).not.toThrow();
    });
  });

  describe("cross-field and new settings (Phase 18)", () => {
    it("refuses sslmode in DATABASE_URL when DATABASE_SSL is set (pg would let it win)", () => {
      const error = captureError(() =>
        parseEnv({
          DATABASE_URL: "postgres://u:p@db.internal/db?sslmode=disable",
          DATABASE_SSL: "require",
        }),
      );
      expect((error as EnvValidationError).fieldErrors).toEqual([
        "DATABASE_URL (must not carry sslmode when DATABASE_SSL is set)",
      ]);
    });

    it("rejects an unknown DATABASE_SSL mode", () => {
      expect(
        captureError(() => parseEnv({ ...REQUIRED, DATABASE_SSL: "prefer" })),
      ).toBeInstanceOf(EnvValidationError);
    });

    it("bounds DATABASE_STATEMENT_TIMEOUT_MS to 1–60 s", () => {
      expect(parseEnv({ ...REQUIRED, DATABASE_STATEMENT_TIMEOUT_MS: "2500" }).DATABASE_STATEMENT_TIMEOUT_MS).toBe(2500);
      for (const value of ["999", "60001", "abc"]) {
        expect(
          captureError(() => parseEnv({ ...REQUIRED, DATABASE_STATEMENT_TIMEOUT_MS: value })),
        ).toBeInstanceOf(EnvValidationError);
      }
    });

    it("parses TRUST_PROXY_HOPS as 0–5", () => {
      expect(parseEnv({ ...REQUIRED, TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS).toBe(1);
      expect(
        captureError(() => parseEnv({ ...REQUIRED, TRUST_PROXY_HOPS: "6" })),
      ).toBeInstanceOf(EnvValidationError);
    });

    it("rejects a non-boolean ALLOW_LOOPBACK_DATABASE", () => {
      expect(
        captureError(() => parseEnv({ ...REQUIRED, ALLOW_LOOPBACK_DATABASE: "maybe" })),
      ).toBeInstanceOf(EnvValidationError);
    });
  });
});
