import { describe, expect, it } from "vitest";
import { z } from "zod";
import { envelopeBaseShape, isoTimestampSchema } from "./metadata";
import { CONTRACT_VERSION } from "./version";

describe("isoTimestampSchema (AC1)", () => {
  it("accepts an ISO-8601 UTC timestamp", () => {
    expect(isoTimestampSchema.safeParse("2026-09-19T10:04:11.000Z").success).toBe(
      true,
    );
  });

  it("rejects epoch milliseconds", () => {
    // The wire format is deliberately not the frontend's internal
    // CommandLogEntry.receivedAt representation (D9).
    expect(isoTimestampSchema.safeParse(1758276251000).success).toBe(false);
    expect(isoTimestampSchema.safeParse("1758276251000").success).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    for (const value of ["yesterday", "2026-13-01T00:00:00Z", ""]) {
      expect(isoTimestampSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("envelopeBaseShape (AC1)", () => {
  const envelope = z.strictObject(envelopeBaseShape);

  it("composes into an envelope carrying all three shared fields", () => {
    const result = envelope.safeParse({
      contractVersion: CONTRACT_VERSION,
      correlationId: "turn_7f3a",
      issuedAt: "2026-09-19T10:04:11.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("requires every shared field", () => {
    expect(
      envelope.safeParse({
        contractVersion: CONTRACT_VERSION,
        issuedAt: "2026-09-19T10:04:11.000Z",
      }).success,
    ).toBe(false);
  });
});
