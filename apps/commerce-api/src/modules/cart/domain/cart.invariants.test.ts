import { describe, expect, it } from "vitest";
import {
  assertCartInvariants,
  CartInvariantViolationError,
} from "./cart.invariants";
import type { Cart } from "./cart.types";

const T0 = new Date("2026-09-25T10:00:00.000Z");

function cart(overrides: Partial<Cart>): Cart {
  return {
    ownerId: "owner-a",
    lines: [],
    version: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

describe("assertCartInvariants", () => {
  it("accepts an empty cart", () => {
    expect(() => assertCartInvariants(cart({}))).not.toThrow();
  });

  it("accepts distinct lines at both quantity bounds", () => {
    expect(() =>
      assertCartInvariants(
        cart({
          lines: [
            { itemId: "tiramisu", quantity: 1 },
            { itemId: "garlic-bread", quantity: 99 },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects two lines for the same item", () => {
    expect(() =>
      assertCartInvariants(
        cart({
          lines: [
            { itemId: "tiramisu", quantity: 1 },
            { itemId: "tiramisu", quantity: 2 },
          ],
        }),
      ),
    ).toThrow(/duplicate line for item "tiramisu"/);
  });

  it.each([0, -1, 100, 1.5])("rejects quantity %s", (quantity) => {
    expect(() =>
      assertCartInvariants(cart({ lines: [{ itemId: "tiramisu", quantity }] })),
    ).toThrow(CartInvariantViolationError);
  });

  it.each([-1, 0.5])("rejects version %s", (version) => {
    expect(() => assertCartInvariants(cart({ version }))).toThrow(
      CartInvariantViolationError,
    );
  });

  // Reaching an invariant violation is a bug, not a client error — it must
  // not carry a DomainError status/code that the filter would serialize.
  it("is a plain Error, not a DomainError", () => {
    const error = new CartInvariantViolationError("x");
    expect(error).not.toHaveProperty("status");
    expect(error).not.toHaveProperty("code");
  });
});
