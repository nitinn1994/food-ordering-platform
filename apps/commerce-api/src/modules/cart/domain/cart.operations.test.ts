import { describe, expect, it } from "vitest";
import {
  CartItemNotFoundError,
  CartItemQuantityLimitExceededError,
} from "./cart.errors";
import { CartInvariantViolationError } from "./cart.invariants";
import {
  addLine,
  clearLines,
  emptyCart,
  removeLine,
  setLineQuantity,
} from "./cart.operations";
import type { Cart } from "./cart.types";

const T0 = new Date("2026-09-25T10:00:00.000Z");
const T1 = new Date("2026-09-25T10:05:00.000Z");

function cartWith(lines: Cart["lines"], version = 3): Cart {
  return Object.freeze({
    ownerId: "owner-a",
    lines: Object.freeze(lines.map((line) => Object.freeze({ ...line }))),
    version,
    createdAt: T0,
    updatedAt: T0,
  });
}

describe("emptyCart", () => {
  it("has no lines, version 0, and both timestamps at now", () => {
    expect(emptyCart("owner-a", T0)).toEqual({
      ownerId: "owner-a",
      lines: [],
      version: 0,
      createdAt: T0,
      updatedAt: T0,
    });
  });
});

describe("addLine (AC2, AC3, AC4)", () => {
  it("appends a new line", () => {
    const next = addLine(emptyCart("owner-a", T0), "tiramisu", 2, T1);
    expect(next.lines).toEqual([{ itemId: "tiramisu", quantity: 2 }]);
  });

  it("merges a duplicate item into one line (2 + 3 = 5)", () => {
    const next = addLine(
      cartWith([{ itemId: "tiramisu", quantity: 2 }]),
      "tiramisu",
      3,
      T1,
    );
    expect(next.lines).toEqual([{ itemId: "tiramisu", quantity: 5 }]);
  });

  it("keeps first-add order when merging an earlier line", () => {
    const next = addLine(
      cartWith([
        { itemId: "garlic-bread", quantity: 1 },
        { itemId: "tiramisu", quantity: 1 },
      ]),
      "garlic-bread",
      1,
      T1,
    );
    expect(next.lines.map((line) => line.itemId)).toEqual([
      "garlic-bread",
      "tiramisu",
    ]);
  });

  it("allows a merge up to exactly 99", () => {
    const next = addLine(
      cartWith([{ itemId: "tiramisu", quantity: 98 }]),
      "tiramisu",
      1,
      T1,
    );
    expect(next.lines[0]?.quantity).toBe(99);
  });

  it("rejects a merge above 99 rather than clamping", () => {
    expect(() =>
      addLine(cartWith([{ itemId: "tiramisu", quantity: 98 }]), "tiramisu", 2, T1),
    ).toThrow(CartItemQuantityLimitExceededError);
  });

  it("maps the over-limit error to 422 CART_ITEM_QUANTITY_LIMIT_EXCEEDED", () => {
    try {
      addLine(cartWith([{ itemId: "tiramisu", quantity: 99 }]), "tiramisu", 1, T1);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        code: "CART_ITEM_QUANTITY_LIMIT_EXCEEDED",
      });
    }
  });

  it("bumps version by one and sets updatedAt, keeping createdAt", () => {
    const next = addLine(cartWith([], 3), "tiramisu", 1, T1);
    expect(next.version).toBe(4);
    expect(next.updatedAt).toBe(T1);
    expect(next.createdAt).toBe(T0);
  });

  it("rejects an out-of-range quantity that bypassed request validation", () => {
    expect(() => addLine(cartWith([]), "tiramisu", 0, T1)).toThrow(
      CartInvariantViolationError,
    );
  });
});

describe("setLineQuantity (AC6, AC7)", () => {
  it("sets the quantity absolutely, not additively", () => {
    const next = setLineQuantity(
      cartWith([{ itemId: "tiramisu", quantity: 2 }]),
      "tiramisu",
      7,
      T1,
    );
    expect(next.lines).toEqual([{ itemId: "tiramisu", quantity: 7 }]);
  });

  it("is idempotent — the same set twice gives the same lines", () => {
    const start = cartWith([{ itemId: "tiramisu", quantity: 2 }]);
    const once = setLineQuantity(start, "tiramisu", 4, T1);
    const twice = setLineQuantity(once, "tiramisu", 4, T1);
    expect(twice.lines).toEqual(once.lines);
  });

  it("rejects an item not in the cart with CART_ITEM_NOT_FOUND (no upsert)", () => {
    expect(() =>
      setLineQuantity(cartWith([]), "tiramisu", 1, T1),
    ).toThrow(CartItemNotFoundError);
  });
});

describe("removeLine (AC7, AC8)", () => {
  it("removes the whole line regardless of quantity", () => {
    const next = removeLine(
      cartWith([
        { itemId: "tiramisu", quantity: 5 },
        { itemId: "garlic-bread", quantity: 1 },
      ]),
      "tiramisu",
      T1,
    );
    expect(next.lines).toEqual([{ itemId: "garlic-bread", quantity: 1 }]);
  });

  it("rejects an item not in the cart with CART_ITEM_NOT_FOUND", () => {
    try {
      removeLine(cartWith([]), "tiramisu", T1);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CartItemNotFoundError);
      expect(error).toMatchObject({ status: 404, code: "CART_ITEM_NOT_FOUND" });
    }
  });

  it("can empty the cart by removing its last line", () => {
    const next = removeLine(
      cartWith([{ itemId: "tiramisu", quantity: 1 }]),
      "tiramisu",
      T1,
    );
    expect(next.lines).toEqual([]);
  });
});

describe("clearLines (AC16)", () => {
  it("removes every line and bumps the version", () => {
    const next = clearLines(
      cartWith(
        [
          { itemId: "tiramisu", quantity: 5 },
          { itemId: "garlic-bread", quantity: 1 },
        ],
        3,
      ),
      T1,
    );
    expect(next.lines).toEqual([]);
    expect(next.version).toBe(4);
  });
});

describe("purity", () => {
  // Inputs are deep-frozen above, so any in-place mutation would throw in
  // strict mode — these pass only if every operation returns a new Cart.
  it("never mutates the input cart", () => {
    const start = cartWith([{ itemId: "tiramisu", quantity: 2 }]);
    const snapshot = structuredClone(start);

    addLine(start, "tiramisu", 1, T1);
    addLine(start, "garlic-bread", 1, T1);
    setLineQuantity(start, "tiramisu", 9, T1);
    removeLine(start, "tiramisu", T1);
    clearLines(start, T1);

    expect(start).toEqual(snapshot);
  });
});
