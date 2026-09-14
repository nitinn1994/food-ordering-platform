import { describe, expect, it } from "vitest";
import {
  MAX_LINE_QUANTITY,
  cartItemCount,
  cartSubtotalCents,
  lineSubtotalCents,
} from "./pricing";
import { MENU, findMenuItem } from "../fixtures/menu";
import type { CartLine } from "../state/cartStore";

function requireMenuItem(itemId: string) {
  const item = findMenuItem(itemId);
  if (!item) {
    throw new Error(`fixture missing expected item: ${itemId}`);
  }
  return item;
}

describe("lineSubtotalCents", () => {
  it("multiplies price by quantity", () => {
    const garlicBread = requireMenuItem("garlic-bread");
    expect(lineSubtotalCents(garlicBread, 3)).toBe(595 * 3);
  });

  it("is zero at quantity zero", () => {
    const garlicBread = requireMenuItem("garlic-bread");
    expect(lineSubtotalCents(garlicBread, 0)).toBe(0);
  });
});

describe("cartSubtotalCents", () => {
  it("sums subtotals across lines", () => {
    const lines: CartLine[] = [
      { itemId: "garlic-bread", quantity: 2 },
      { itemId: "tiramisu", quantity: 1 },
    ];
    expect(cartSubtotalCents(lines, MENU)).toBe(595 * 2 + 750);
  });

  it("is zero for an empty cart", () => {
    expect(cartSubtotalCents([], MENU)).toBe(0);
  });

  it("treats an unresolvable line as contributing zero, not throwing", () => {
    const lines: CartLine[] = [{ itemId: "does-not-exist", quantity: 5 }];
    expect(cartSubtotalCents(lines, MENU)).toBe(0);
  });
});

describe("cartItemCount", () => {
  it("sums quantities, not the number of distinct lines", () => {
    const lines: CartLine[] = [
      { itemId: "garlic-bread", quantity: 2 },
      { itemId: "tiramisu", quantity: 3 },
    ];
    expect(cartItemCount(lines)).toBe(5);
  });

  it("is zero for an empty cart", () => {
    expect(cartItemCount([])).toBe(0);
  });
});

describe("MAX_LINE_QUANTITY", () => {
  it("is 99", () => {
    expect(MAX_LINE_QUANTITY).toBe(99);
  });
});
