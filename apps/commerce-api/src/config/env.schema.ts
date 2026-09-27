import { z } from "zod";

// This service's entire environment configuration, in one place. Parsed
// once in main.ts before the Nest application is created (plan.md, Phase 6,
// §8) — an invalid value must stop the process before it starts listening,
// not surface as a runtime error on whichever request first needs it.
//
// LOG_LEVEL's ordering matters beyond this schema: src/common/logging/logger.ts
// treats it as a severity threshold, least to most severe.
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(["verbose", "debug", "log", "warn", "error", "fatal"])
    .default("log"),
  // "pretty" is for local development only; production and test both use
  // "json" (plan.md, Phase 6, §8 — "production is a placeholder only").
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  // Required, with no default: a missing database is a configuration error
  // at boot, not a silently non-persistent API
  // (docs/features/phase-10-database-persistence/plan.md §15). Never logged
  // — EnvValidationError below names the field only.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // TLS to PostgreSQL (Phase 18, plan.md §11, OD14). Unset means no TLS,
  // which production refuses below. "verify-full" checks the server
  // certificate against Node's CA store (add a private CA with
  // NODE_EXTRA_CA_CERTS); "require" encrypts without verifying it.
  DATABASE_SSL: z.enum(["disable", "require", "verify-full"]).optional(),
  // Bounds any single statement (plan.md §20 C-5); was fixed at 10 s.
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  // Production refuses a loopback database host unless this says otherwise
  // — a localhost default must never become a production database by
  // accident (plan.md §20).
  ALLOW_LOOPBACK_DATABASE: z.stringbool().default(false),
  // How many reverse-proxy hops Express trusts for X-Forwarded-* (plan.md
  // AC10). 0, the default, trusts none.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

// This machine, however it is spelled: localhost, the unspecified address
// (0.0.0.0 and [::] connect locally too), and an empty hostname (a
// Unix-socket connection is local by definition).
const LOOPBACK_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "[::]", ""]);

// `postgres:` is not a WHATWG "special" scheme, so `new URL()` leaves its
// host as written: "LOCALHOST", "localhost.", "2130706433" or "0x7f000001"
// would slip past a plain comparison (Phase 18 security review S2).
// Re-parsing the host under `http:` canonicalises it — lowercase, and every
// numeric IPv4 form to dotted-decimal — and a trailing dot is dropped
// before comparing.
function canonicalHost(databaseUrl: string): string {
  const { hostname } = new URL(databaseUrl);
  if (hostname === "") {
    return "";
  }
  try {
    return new URL(`http://${hostname}`).hostname.replace(/\.$/, "");
  } catch {
    // Not a valid http host (e.g. percent-encoded): no loopback spelling
    // is, so compare it as written, lowercased.
    return hostname.toLowerCase().replace(/\.$/, "");
  }
}

function hasLoopbackHost(databaseUrl: string): boolean {
  const host = canonicalHost(databaseUrl);
  return (
    LOOPBACK_HOSTNAMES.has(host) ||
    /^127\./.test(host) ||
    // IPv4-mapped IPv6 loopback, e.g. [::ffff:127.0.0.1] → [::ffff:7f00:1].
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
  );
}

// Rules that span fields, and the production-only ones (Phase 18, plan.md
// §20 C-3, OD14). Messages are fixed text: never a value, so they are as
// safe to print as the field names EnvValidationError already prints.
const configSchema = envSchema.superRefine((env, ctx) => {
  if (
    env.DATABASE_SSL !== undefined &&
    new URL(env.DATABASE_URL).searchParams.has("sslmode")
  ) {
    // pg lets the URL's sslmode silently override the ssl option.
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: "must not carry sslmode when DATABASE_SSL is set",
    });
  }
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.DATABASE_SSL === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_SSL"],
      message: "required when NODE_ENV=production",
    });
  }
  if (!env.ALLOW_LOOPBACK_DATABASE && hasLoopbackHost(env.DATABASE_URL)) {
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message:
        "loopback host refused when NODE_ENV=production (set ALLOW_LOOPBACK_DATABASE=true to allow)",
    });
  }
});

export type Env = z.infer<typeof envSchema>;
export type AppConfig = Readonly<Env>;

// Thrown by parseEnv on any invalid value. `fieldErrors` names the field and
// the failure kind only — never the offending value itself (requirements.md
// AC4: "not printing its value"), so this is safe to log and to put directly
// in a process-exit message. The one `issue.message` it includes is a
// "custom" issue's, which is always configSchema's own fixed text above.
export class EnvValidationError extends Error {
  constructor(public readonly fieldErrors: readonly string[]) {
    super(`Invalid environment configuration: ${fieldErrors.join("; ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = configSchema.safeParse(source);

  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return issue.code === "custom"
        ? `${field} (${issue.message})`
        : `${field} (${issue.code})`;
    });
    throw new EnvValidationError(fieldErrors);
  }

  return Object.freeze(result.data);
}
