import { describe, expect, it } from "vitest";
import { filterByDiet, isVegetarian } from "./diet";
import { MENU } from "../../test/fixtures/menu";

function itemIds(categories: ReturnType<typeof filterByDiet>): string[] {
  return categories.flatMap((category) => category.items.map((item) => item.id));
}

describe("isVegetarian", () => {
  it("is true for a vegetarian or vegan tag", () => {
    expect(isVegetarian({ dietaryTags: ["vegetarian"] })).toBe(true);
    expect(isVegetarian({ dietaryTags: ["vegan"] })).toBe(true);
  });

  it("is false without either tag", () => {
    expect(isVegetarian({ dietaryTags: [] })).toBe(false);
    expect(isVegetarian({ dietaryTags: ["spicy"] })).toBe(false);
  });
});

describe("filterByDiet", () => {
  it("returns every category unchanged with no filter", () => {
    expect(filterByDiet(MENU, null)).toEqual(MENU);
  });

  it("keeps only vegetarian items for veg", () => {
    const result = filterByDiet(MENU, "veg");
    expect(itemIds(result)).not.toContain("soup-of-the-day");
    expect(result.flatMap((c) => c.items).every(isVegetarian)).toBe(true);
  });

  it("keeps only non-vegetarian items for non-veg, dropping emptied categories", () => {
    const result = filterByDiet(MENU, "non-veg");
    expect(result.flatMap((c) => c.items).some(isVegetarian)).toBe(false);
    expect(result.every((category) => category.items.length > 0)).toBe(true);
    expect(itemIds(result)).toContain("soup-of-the-day");
  });
});
