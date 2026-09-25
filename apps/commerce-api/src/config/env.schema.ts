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
});

export type Env = z.infer<typeof envSchema>;
export type AppConfig = Readonly<Env>;

// Thrown by parseEnv on any invalid value. `fieldErrors` names the field and
// the failure kind only — never `issue.message` or the offending value
// itself (requirements.md AC4: "not printing its value"), so this is safe to
// log and to put directly in a process-exit message.
export class EnvValidationError extends Error {
  constructor(public readonly fieldErrors: readonly string[]) {
    super(`Invalid environment configuration: ${fieldErrors.join("; ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${field} (${issue.code})`;
    });
    throw new EnvValidationError(fieldErrors);
  }

  return Object.freeze(result.data);
}
