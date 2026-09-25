import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERROR_CODES,
  MAX_ERROR_MESSAGE_LENGTH,
  contractErrorCodeSchema,
  contractErrorSchema,
} from "./errors";

describe("contractErrorSchema (AC1, AC4)", () => {
  it("accepts a minimal error", () => {
    const result = contractErrorSchema.safeParse({
      code: CONTRACT_ERROR_CODES.INVALID_PAYLOAD,
      message: "Quantity must be between 1 and 99.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the optional field and details", () => {
    const result = contractErrorSchema.safeParse({
      code: CONTRACT_ERROR_CODES.INVALID_PAYLOAD,
      message: "Quantity must be between 1 and 99.",
      field: "quantity",
      details: { received: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown key", () => {
    // Strict everywhere: an unknown key is a rejection, never a silent strip.
    const result = contractErrorSchema.safeParse({
      code: CONTRACT_ERROR_CODES.INVALID_PAYLOAD,
      message: "nope",
      html: "<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("requires code and message", () => {
    expect(contractErrorSchema.safeParse({ message: "no code" }).success).toBe(
      false,
    );
    expect(
      contractErrorSchema.safeParse({
        code: CONTRACT_ERROR_CODES.UNKNOWN_TYPE,
      }).success,
    ).toBe(false);
  });

  it("bounds the message", () => {
    const code = CONTRACT_ERROR_CODES.UNKNOWN_TYPE;
    expect(
      contractErrorSchema.safeParse({
        code,
        message: "m".repeat(MAX_ERROR_MESSAGE_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      contractErrorSchema.safeParse({
        code,
        message: "m".repeat(MAX_ERROR_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("contractErrorCodeSchema", () => {
  it("accepts every code the contract layer itself produces", () => {
    for (const code of Object.values(CONTRACT_ERROR_CODES)) {
      expect(contractErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("accepts a domain code this package does not know about", () => {
    // Deliberately a pattern rather than an enum, so commerce-api can add its
    // own codes without a contract major bump. See errors.ts.
    expect(contractErrorCodeSchema.safeParse("ITEM_NOT_FOUND").success).toBe(
      true,
    );
  });

  it("rejects codes that are not SCREAMING_SNAKE_CASE", () => {
    for (const code of ["itemNotFound", "item-not-found", "_LEADING", "9LIVES", ""]) {
      expect(contractErrorCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});
