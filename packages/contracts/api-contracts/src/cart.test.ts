import { describe, expect, it } from "vitest";
import {
  addCartItemRequestSchema,
  cartItemParamsSchema,
  cartLineSchema,
  cartResponseSchema,
  updateCartItemRequestSchema,
} from "./cart";

const VALID_LINE = {
  itemId: "tiramisu",
  name: "Tiramisu",
  unitPriceCents: 750,
  quantity: 2,
  lineSubtotalCents: 1500,
  available: true,
};

describe("addCartItemRequestSchema", () => {
  it("accepts a well-formed request", () => {
    const result = addCartItemRequestSchema.safeParse({
      itemId: "tiramisu",
      quantity: 2,
    });
    expect(result.success).toBe(true);
  });

  // AC11: price authority is commerce-api's — a caller-supplied price is
  // rejected by strictness, not silently ignored.
  it("rejects a caller-supplied price (strict object)", () => {
    const result = addCartItemRequestSchema.safeParse({
      itemId: "tiramisu",
      quantity: 2,
      unitPriceCents: 1,
    });
    expect(result.success).toBe(false);
  });

  // AC10: no client value selects a cart.
  it.each(["cartId", "ownerId"])("rejects a caller-supplied %s", (key) => {
    const result = addCartItemRequestSchema.safeParse({
      itemId: "tiramisu",
      quantity: 2,
      [key]: "someone-else",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing quantity", () => {
    const result = addCartItemRequestSchema.safeParse({ itemId: "tiramisu" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed itemId", () => {
    const result = addCartItemRequestSchema.safeParse({
      itemId: "Not A Slug",
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCartItemRequestSchema", () => {
  it("accepts quantity at both bounds", () => {
    expect(updateCartItemRequestSchema.safeParse({ quantity: 1 }).success).toBe(
      true,
    );
    expect(
      updateCartItemRequestSchema.safeParse({ quantity: 99 }).success,
    ).toBe(true);
  });

  // quantity 0 is a validation error, not a removal (plan.md §12).
  it.each([0, -1, 1.5, 100, "2", null])(
    "rejects quantity %s",
    (quantity) => {
      const result = updateCartItemRequestSchema.safeParse({ quantity });
      expect(result.success).toBe(false);
    },
  );

  it("rejects an itemId in the body (it belongs to the path)", () => {
    const result = updateCartItemRequestSchema.safeParse({
      quantity: 1,
      itemId: "tiramisu",
    });
    expect(result.success).toBe(false);
  });
});

describe("cartItemParamsSchema", () => {
  it("accepts a slug itemId", () => {
    expect(cartItemParamsSchema.safeParse({ itemId: "garlic-bread" }).success).toBe(
      true,
    );
  });

  it("rejects a malformed itemId", () => {
    expect(cartItemParamsSchema.safeParse({ itemId: "garlic--bread" }).success).toBe(
      false,
    );
  });
});

describe("cartLineSchema", () => {
  it("accepts a well-formed line", () => {
    expect(cartLineSchema.safeParse(VALID_LINE).success).toBe(true);
  });

  it("rejects an unknown key (strict object)", () => {
    expect(
      cartLineSchema.safeParse({ ...VALID_LINE, priceSnapshotCents: 750 })
        .success,
    ).toBe(false);
  });

  it("rejects a negative subtotal", () => {
    expect(
      cartLineSchema.safeParse({ ...VALID_LINE, lineSubtotalCents: -1 }).success,
    ).toBe(false);
  });
});

describe("cartResponseSchema", () => {
  it("accepts an empty cart", () => {
    const result = cartResponseSchema.safeParse({
      items: [],
      itemCount: 0,
      subtotalCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cart with lines", () => {
    const result = cartResponseSchema.safeParse({
      items: [VALID_LINE],
      itemCount: 2,
      subtotalCents: 1500,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-integer itemCount", () => {
    const result = cartResponseSchema.safeParse({
      items: [],
      itemCount: 0.5,
      subtotalCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key (strict object)", () => {
    const result = cartResponseSchema.safeParse({
      items: [],
      itemCount: 0,
      subtotalCents: 0,
      cartId: "x",
    });
    expect(result.success).toBe(false);
  });
});
