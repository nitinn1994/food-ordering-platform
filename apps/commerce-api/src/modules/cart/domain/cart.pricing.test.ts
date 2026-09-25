import type { MenuItemId } from "@contracts/common";
import { describe, expect, it } from "vitest";
import { priceCart } from "./cart.pricing";
import type { CatalogItem } from "./cart.types";

function catalogOf(items: CatalogItem[]): ReadonlyMap<MenuItemId, CatalogItem> {
  return new Map(items.map((item) => [item.id, item]));
}

const TIRAMISU: CatalogItem = {
  id: "tiramisu",
  name: "Tiramisu",
  priceCents: 750,
  available: true,
};
const GARLIC_BREAD: CatalogItem = {
  id: "garlic-bread",
  name: "Garlic Bread",
  priceCents: 595,
  available: true,
};

describe("priceCart (plan.md §10, §15)", () => {
  it("prices an empty cart at zero", () => {
    expect(priceCart([], catalogOf([TIRAMISU]))).toEqual({
      lines: [],
      itemCount: 0,
      subtotalCents: 0,
    });
  });

  it("computes line subtotal = unit price × quantity", () => {
    const priced = priceCart(
      [{ itemId: "tiramisu", quantity: 2 }],
      catalogOf([TIRAMISU]),
    );
    expect(priced.lines).toEqual([
      {
        itemId: "tiramisu",
        name: "Tiramisu",
        unitPriceCents: 750,
        quantity: 2,
        lineSubtotalCents: 1500,
        available: true,
      },
    ]);
  });

  it("sums line subtotals and quantities across lines, in line order", () => {
    const priced = priceCart(
      [
        { itemId: "garlic-bread", quantity: 3 },
        { itemId: "tiramisu", quantity: 2 },
      ],
      catalogOf([TIRAMISU, GARLIC_BREAD]),
    );
    expect(priced.lines.map((line) => line.itemId)).toEqual([
      "garlic-bread",
      "tiramisu",
    ]);
    expect(priced.subtotalCents).toBe(595 * 3 + 750 * 2);
    expect(priced.itemCount).toBe(5);
  });

  it("uses the catalog's current price, not any earlier one (OD4)", () => {
    const lines = [{ itemId: "tiramisu", quantity: 2 }];
    const before = priceCart(lines, catalogOf([TIRAMISU]));
    const after = priceCart(
      lines,
      catalogOf([{ ...TIRAMISU, priceCents: 800 }]),
    );
    expect(before.subtotalCents).toBe(1500);
    expect(after.subtotalCents).toBe(1600);
  });

  it("prices a free item at zero", () => {
    const priced = priceCart(
      [{ itemId: "tiramisu", quantity: 4 }],
      catalogOf([{ ...TIRAMISU, priceCents: 0 }]),
    );
    expect(priced.subtotalCents).toBe(0);
    expect(priced.itemCount).toBe(4);
  });

  it("keeps an unavailable line, flags it, and still counts it (OD8)", () => {
    const priced = priceCart(
      [{ itemId: "tiramisu", quantity: 2 }],
      catalogOf([{ ...TIRAMISU, available: false }]),
    );
    expect(priced.lines[0]?.available).toBe(false);
    expect(priced.subtotalCents).toBe(1500);
    expect(priced.itemCount).toBe(2);
  });

  it("leaves a line whose item is no longer on the menu out of the priced view (OD8)", () => {
    const priced = priceCart(
      [
        { itemId: "tiramisu", quantity: 2 },
        { itemId: "retired-item", quantity: 5 },
      ],
      catalogOf([TIRAMISU]),
    );
    expect(priced.lines.map((line) => line.itemId)).toEqual(["tiramisu"]);
    expect(priced.subtotalCents).toBe(1500);
    expect(priced.itemCount).toBe(2);
  });
});
