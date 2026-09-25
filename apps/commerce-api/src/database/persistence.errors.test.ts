import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "../common/errors/api-error-codes";
import { DomainError } from "../common/errors/domain.error";
import {
  DatabaseUnavailableError,
  PersistenceError,
  describeDriverError,
  isDatabaseUnreachable,
  isUniqueViolation,
  toPersistenceError,
} from "./persistence.errors";

// Shaped like pg's DatabaseError: every field a real driver error can carry,
// with personal data planted in each one that must not survive
// (docs/features/phase-10-database-persistence/plan.md §14, AC12).
const PII = "Ada Lovelace";
const PHONE = "5551234";

function driverError(fields: Record<string, unknown>): Error {
  return Object.assign(
    new Error(`new row violates something: (${PII}, ${PHONE})`),
    {
      detail: `Failing row contains (${PII}, ${PHONE}).`,
      where: `SQL statement with ${PII}`,
      hint: `hint mentioning ${PHONE}`,
      schema: "public",
      table: "orders",
      ...fields,
    },
  );
}

function everythingAbout(error: Error): string {
  return JSON.stringify({
    message: error.message,
    name: error.name,
    stack: error.stack,
    cause: (error as { cause?: unknown }).cause,
    own: Object.fromEntries(Object.entries(error)),
  });
}

describe("describeDriverError", () => {
  it("keeps only the code and the constraint name", () => {
    expect(
      describeDriverError(
        driverError({ code: "23514", constraint: "orders_status_check" }),
      ),
    ).toEqual({ code: "23514", constraint: "orders_status_check" });
  });

  it("drops a code or constraint that does not have the expected shape", () => {
    expect(
      describeDriverError(
        driverError({ code: `x ${PII}`, constraint: `Robert'); DROP ${PII}` }),
      ),
    ).toEqual({});
  });

  it("reads the code from the first inner error of an AggregateError", () => {
    const inner = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), {
      code: "ECONNREFUSED",
    });
    expect(describeDriverError(new AggregateError([inner]))).toEqual({
      code: "ECONNREFUSED",
    });
  });

  it("returns nothing for a non-object", () => {
    expect(describeDriverError("boom")).toEqual({});
    expect(describeDriverError(undefined)).toEqual({});
  });
});

describe("isDatabaseUnreachable", () => {
  it.each([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "08006",
    "08001",
    "57P01",
    "57P03",
    "53300",
  ])("treats %s as unreachable", (code) => {
    expect(isDatabaseUnreachable(driverError({ code }))).toBe(true);
  });

  it.each([
    "timeout exceeded when trying to connect",
    "Connection terminated unexpectedly",
    "Client has encountered a connection error and is not queryable",
  ])("treats pg's code-less %j as unreachable", (message) => {
    expect(isDatabaseUnreachable(new Error(message))).toBe(true);
  });

  it.each(["23505", "23514", "42P01", "40001"])(
    "does not treat %s as unreachable",
    (code) => {
      expect(isDatabaseUnreachable(driverError({ code }))).toBe(false);
    },
  );
});

describe("isUniqueViolation", () => {
  it("matches a 23505 on the named constraint only", () => {
    const error = driverError({ code: "23505", constraint: "orders_pkey" });
    expect(isUniqueViolation(error, "orders_pkey")).toBe(true);
    expect(isUniqueViolation(error, "orders_owner_idempotency_key_key")).toBe(false);
    expect(
      isUniqueViolation(
        driverError({ code: "23514", constraint: "orders_pkey" }),
        "orders_pkey",
      ),
    ).toBe(false);
  });
});

describe("toPersistenceError", () => {
  it("maps an unreachable database to a 503 SERVICE_UNAVAILABLE domain error", () => {
    const mapped = toPersistenceError(
      driverError({ code: "ECONNREFUSED" }),
      "cart.save",
    );
    expect(mapped).toBeInstanceOf(DatabaseUnavailableError);
    expect(mapped).toBeInstanceOf(DomainError);
    expect((mapped as DatabaseUnavailableError).status).toBe(503);
    expect((mapped as DatabaseUnavailableError).code).toBe(
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
    );
  });

  it("maps any other failure to a plain PersistenceError naming operation, code and constraint", () => {
    const mapped = toPersistenceError(
      driverError({ code: "23514", constraint: "orders_status_check" }),
      "order.create",
    );
    expect(mapped).toBeInstanceOf(PersistenceError);
    expect(mapped).not.toBeInstanceOf(DomainError);
    expect(mapped.message).toBe(
      "order.create failed (code 23514, constraint orders_status_check)",
    );
  });

  it("returns an already-mapped error unchanged, so mapping twice cannot turn a 503 into a 500", () => {
    const unavailable = new DatabaseUnavailableError();
    const persistence = new PersistenceError("cart.save", { code: "23514" });
    expect(toPersistenceError(unavailable, "cart.save")).toBe(unavailable);
    expect(toPersistenceError(persistence, "order.create")).toBe(persistence);
  });

  it("says 'unknown' when there is no usable code", () => {
    expect(toPersistenceError(new Error(PII), "menu.list").message).toBe(
      "menu.list failed (code unknown)",
    );
  });

  it("never carries the driver's message, detail, where, hint, or a cause (AC12)", () => {
    for (const code of ["23514", "ECONNREFUSED", "42P01"]) {
      const mapped = toPersistenceError(
        driverError({ code, constraint: "orders_status_check" }),
        "order.create",
      );
      const dump = everythingAbout(mapped);
      expect(dump).not.toContain(PII);
      expect(dump).not.toContain(PHONE);
      expect(dump).not.toContain("Failing row");
      expect((mapped as { cause?: unknown }).cause).toBeUndefined();
    }
  });
});
