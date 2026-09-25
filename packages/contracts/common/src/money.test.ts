import { describe, expect, it } from "vitest";
import { MAX_QUANTITY, priceCentsSchema, quantitySchema } from "./money";

describe("quantitySchema (AC1)", () => {
  it("accepts the whole permitted range", () => {
    for (const quantity of [1, 2, MAX_QUANTITY]) {
      expect(quantitySchema.safeParse(quantity).success).toBe(true);
    }
  });

  it("rejects zero, negatives, and anything over the cap", () => {
    // Zero is not "remove the line" — RemoveItemFromCart is the only path to
    // deleting one, the same rule cartReducer's DECREMENT_ITEM already holds.
    for (const quantity of [0, -1, MAX_QUANTITY + 1]) {
      expect(quantitySchema.safeParse(quantity).success).toBe(false);
    }
  });

  it("rejects fractional and non-numeric quantities", () => {
    for (const quantity of [1.5, "2", null, NaN]) {
      expect(quantitySchema.safeParse(quantity).success).toBe(false);
    }
  });
});

describe("priceCentsSchema (AC1)", () => {
  it("accepts zero and positive integer cents", () => {
    expect(priceCentsSchema.safeParse(0).success).toBe(true);
    expect(priceCentsSchema.safeParse(595).success).toBe(true);
  });

  it("rejects negatives and floats", () => {
    // Money is integer cents everywhere — never a float, never a string.
    expect(priceCentsSchema.safeParse(-1).success).toBe(false);
    expect(priceCentsSchema.safeParse(5.95).success).toBe(false);
    expect(priceCentsSchema.safeParse("5.95").success).toBe(false);
  });
});
