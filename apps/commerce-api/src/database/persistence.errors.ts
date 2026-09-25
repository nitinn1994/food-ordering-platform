import { API_ERROR_CODES } from "../common/errors/api-error-codes";
import { DomainError } from "../common/errors/domain.error";

const HTTP_SERVICE_UNAVAILABLE = 503;

// The one place a database driver error is turned into something the rest
// of commerce-api may see (docs/features/phase-10-database-persistence/
// plan.md §14, OD9). Only two facts survive from a driver error: its code
// (a SQLSTATE or a Node errno name) and the constraint it names. Everything
// else is dropped on purpose, and never copied into a message, a `cause`,
// or a log line:
//
//   - `detail` — for a check violation it is "Failing row contains (…)",
//     i.e. every column value, customer name and phone included;
//   - `where`, `hint`, the query text, its parameters, and the message
//     itself (which can quote an offending value).
//
// Both surviving facts are also shape-checked, so not even a code or a
// constraint name can smuggle arbitrary text through.

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const ERRNO_PATTERN = /^E[A-Z_]+$/; // e.g. ECONNREFUSED, EAI_AGAIN
const CONSTRAINT_PATTERN = /^[a-z0-9_]{1,63}$/;

// Node socket errors that mean "the database is not reachable".
const UNREACHABLE_ERRNOS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EAI_AGAIN",
]);

// SQLSTATEs that mean the same: admin/crash shutdown, cannot connect now,
// too many connections. Class 08 (connection exception) is matched by prefix.
const UNREACHABLE_SQLSTATES = new Set(["57P01", "57P02", "57P03", "53300"]);

// `pg` raises these without any code at all — a pool that timed out waiting
// for a connection, and a connection that dropped mid-query. Matched
// exactly; they are pg's own fixed strings, never data.
const UNREACHABLE_PG_MESSAGES = new Set([
  "timeout exceeded when trying to connect",
  "Connection terminated unexpectedly",
  "Connection terminated",
  "Connection terminated due to connection timeout",
  // A statement sent on a client whose connection had already been lost.
  "Client has encountered a connection error and is not queryable",
]);

export interface DriverErrorFacts {
  readonly code?: string;
  readonly constraint?: string;
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

// The only two facts kept from a driver error, each dropped unless it has
// the shape it should. A connection failure to a host with several
// addresses arrives as an AggregateError whose own code may be missing; the
// first inner error's code is used then.
export function describeDriverError(error: unknown): DriverErrorFacts {
  let code = readString(error, "code");
  if (code === undefined && error instanceof AggregateError) {
    code = readString(error.errors[0], "code");
  }
  const constraint = readString(error, "constraint");
  return {
    ...(code !== undefined &&
    (SQLSTATE_PATTERN.test(code) || ERRNO_PATTERN.test(code))
      ? { code }
      : {}),
    ...(constraint !== undefined && CONSTRAINT_PATTERN.test(constraint)
      ? { constraint }
      : {}),
  };
}

export function isDatabaseUnreachable(error: unknown): boolean {
  const { code } = describeDriverError(error);
  if (code !== undefined) {
    return (
      UNREACHABLE_ERRNOS.has(code) ||
      UNREACHABLE_SQLSTATES.has(code) ||
      code.startsWith("08")
    );
  }
  return error instanceof Error && UNREACHABLE_PG_MESSAGES.has(error.message);
}

// A unique violation (23505) on one specific, named constraint — how the
// Order adapter recognizes a duplicate id or (owner, idempotency key).
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const facts = describeDriverError(error);
  return facts.code === "23505" && facts.constraint === constraint;
}

// The database could not be reached. A DomainError so AllExceptionsFilter
// turns it into 503 SERVICE_UNAVAILABLE with no filter change; the message
// is static — no host, no URL, no driver text.
export class DatabaseUnavailableError extends DomainError {
  constructor() {
    super(
      HTTP_SERVICE_UNAVAILABLE,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      "The service is temporarily unavailable. Retry later.",
    );
  }
}

// Any other database failure. A plain Error, not a DomainError: it becomes
// a generic 500 and is logged, and what is logged is only this message —
// the operation, the code, and the constraint name.
export class PersistenceError extends Error {
  constructor(operation: string, facts: DriverErrorFacts) {
    const code = facts.code ?? "unknown";
    const constraint =
      facts.constraint === undefined ? "" : `, constraint ${facts.constraint}`;
    super(`${operation} failed (code ${code}${constraint})`);
    this.name = "PersistenceError";
  }
}

// What a repository throws in place of a driver error it does not handle
// itself. `operation` is a fixed string naming the repository method (e.g.
// "cart.save") — never anything derived from the request.
//
// Idempotent: an error that is already one of the two mapped types is
// returned as it is. That matters because a repository's own transaction
// (DatabaseClient.transaction) maps what it throws, and the repository's
// `catch` then maps again — without this, a DatabaseUnavailableError's own
// `code` ("SERVICE_UNAVAILABLE") would fail the shape check and turn a 503
// into a 500.
export function toPersistenceError(
  error: unknown,
  operation: string,
): DatabaseUnavailableError | PersistenceError {
  if (error instanceof DatabaseUnavailableError || error instanceof PersistenceError) {
    return error;
  }
  if (isDatabaseUnreachable(error)) {
    return new DatabaseUnavailableError();
  }
  return new PersistenceError(operation, describeDriverError(error));
}
