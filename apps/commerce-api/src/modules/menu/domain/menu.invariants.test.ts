import { describe, expect, it } from "vitest";
import { assertMenuInvariants, MenuInvariantViolationError } from "./menu.invariants";
import type { MenuCategory } from "./menu.types";

const ITEM = {
  name: "Tiramisu",
  description: "Espresso-soaked ladyfingers, mascarpone.",
  longDescription: "Espresso-soaked ladyfingers layered with mascarpone.",
  priceCents: 750,
  available: true,
  dietaryTags: [],
  allergens: [],
  calories: 450,
};

function validMenu(): MenuCategory[] {
  return [
    {
      id: "desserts",
      name: "Desserts",
      items: [{ ...ITEM, id: "tiramisu", categoryId: "desserts" }],
    },
  ];
}

describe("assertMenuInvariants (AC6)", () => {
  it("accepts a well-formed menu", () => {
    expect(() => assertMenuInvariants(validMenu())).not.toThrow();
  });

  it("rejects a duplicate category id", () => {
    const categories = validMenu();
    categories.push({ ...categories[0]! });

    expect(() => assertMenuInvariants(categories)).toThrow(
      MenuInvariantViolationError,
    );
  });

  it("rejects a duplicate item id across different categories", () => {
    const categories = validMenu();
    categories.push({
      id: "mains",
      name: "Mains",
      items: [{ ...ITEM, id: "tiramisu", categoryId: "mains" }],
    });

    expect(() => assertMenuInvariants(categories)).toThrow(
      /duplicate item id "tiramisu"/,
    );
  });

  it("rejects an item whose categoryId does not match its parent category", () => {
    const categories = [
      {
        id: "desserts",
        name: "Desserts",
        items: [{ ...ITEM, id: "tiramisu", categoryId: "mains" }],
      },
    ];

    expect(() => assertMenuInvariants(categories)).toThrow(
      /categoryId "mains" but appears under category "desserts"/,
    );
  });
});
