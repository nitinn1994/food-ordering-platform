import {
  ConsoleLogger,
  type ConsoleLoggerOptions,
  type LogLevel,
} from "@nestjs/common";
import { getRequestContext } from "../request-context/request-context";

// Ascending by severity (Nest's own convention: least to most severe).
// env.schema.ts's LOG_LEVEL is a single threshold; ConsoleLoggerOptions
// wants the list of levels that are *enabled*, so logLevelsFrom expands one
// into the other.
const LOG_LEVELS_ASCENDING: readonly LogLevel[] = [
  "verbose",
  "debug",
  "log",
  "warn",
  "error",
  "fatal",
];

export function logLevelsFrom(minimum: LogLevel): LogLevel[] {
  const cutoff = LOG_LEVELS_ASCENDING.indexOf(minimum);
  return [...LOG_LEVELS_ASCENDING.slice(cutoff)];
}

interface JsonLogObjectOptions {
  context: string;
  logLevel: LogLevel;
  writeStreamType?: "stdout" | "stderr";
  errorStack?: unknown;
  params?: Record<string, unknown>;
}

// Mirrors ConsoleLogger.getJsonLogObject's own return type exactly (its
// .d.ts declares this shape inline, with no exported name to import).
// getJsonLogObject must return this precise shape, not a loosened
// Record<string, unknown> — TypeScript's override checking (noImplicitOverride)
// rejects a narrower or differently-shaped return type.
interface JsonLogObject {
  [key: string]: unknown;
  level: LogLevel;
  pid: number;
  timestamp: number;
  message: unknown;
  context?: string;
  stack?: unknown;
  params?: Record<string, unknown>;
}

// Nest's own JSON logger (ConsoleLogger with `json: true`), augmented with
// the current request's ids from AsyncLocalStorage (plan.md, Phase 6, §11)
// so every log line — not just the request-log middleware's — carries them
// without any call site passing them explicitly. Only whatever a caller
// logs as its message, plus these two ids, ever appears in a line: no
// request body, header, or query string is ever added here or anywhere
// else in this service (requirements.md AC9).
//
// Limitation, deliberately not solved here: this only adds the ids to the
// JSON branch (getJsonLogObject). LOG_FORMAT=pretty — development-only,
// per env.schema.ts — does not gain them; that formatting path is untouched.
export class AppLogger extends ConsoleLogger {
  constructor(options: ConsoleLoggerOptions) {
    // flattenParams is harmless when `json` is false; it only changes
    // behaviour inside the JSON branch this class overrides.
    super({ ...options, flattenParams: true });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: JsonLogObjectOptions,
  ): JsonLogObject {
    const base = super.getJsonLogObject(message, options);
    const context = getRequestContext();

    if (!context) {
      return base;
    }

    return {
      ...base,
      requestId: context.requestId,
      correlationId: context.correlationId,
    };
  }
}
