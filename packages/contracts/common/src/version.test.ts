import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, contractVersionSchema } from "./version";

describe("contractVersionSchema (AC1, AC6)", () => {
  it("accepts the current major", () => {
    expect(contractVersionSchema.safeParse(CONTRACT_VERSION).success).toBe(true);
  });

  it("rejects a version this consumer does not implement", () => {
    // The whole point of the field: a v1 consumer must refuse a v2 producer
    // rather than interpret it optimistically.
    expect(contractVersionSchema.safeParse(2).success).toBe(false);
    expect(contractVersionSchema.safeParse(0).success).toBe(false);
  });

  it("rejects a version that is not a number", () => {
    expect(contractVersionSchema.safeParse("1").success).toBe(false);
    expect(contractVersionSchema.safeParse(null).success).toBe(false);
  });
});
