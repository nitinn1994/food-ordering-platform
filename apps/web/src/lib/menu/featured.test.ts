import { describe, expect, it } from "vitest";
import type { MenuCategory } from "@contracts/api-contracts";
import { availableFeatures, filterByFeature } from "./featured";
import { MENU } from "../../test/fixtures/menu";

// The test fixture has no presentation fields; add some to two items.
const FEATURED: readonly MenuCategory[] = MENU.map((category) => ({
  ...category,
  items: category.items.map((item) =>
    item.id === "tiramisu"
      ? { ...item, featured: ["popular", "deal"] as const }
      : item.id === "garlic-bread"
        ? { ...item, featured: ["new-launch"] as const }
        : item,
  ),
})) as MenuCategory[];

function itemIds(categories: readonly MenuCategory[]): string[] {
  return categories.flatMap((category) => category.items.map((item) => item.id));
}

describe("filterByFeature", () => {
  it("returns everything with no filter", () => {
    expect(filterByFeature(FEATURED, null)).toEqual(FEATURED);
  });

  it("keeps only items carrying the feature, dropping emptied categories", () => {
    expect(itemIds(filterByFeature(FEATURED, "deal"))).toEqual(["tiramisu"]);
    expect(filterByFeature(FEATURED, "deal")).toHaveLength(1);
    expect(itemIds(filterByFeature(FEATURED, "new-launch"))).toEqual(["garlic-bread"]);
  });

  it("treats an item without featured as matching nothing", () => {
    expect(filterByFeature(MENU, "popular")).toEqual([]);
  });
});

describe("availableFeatures", () => {
  it("lists only features some item has, in chip order", () => {
    expect(availableFeatures(FEATURED)).toEqual(["popular", "deal", "new-launch"]);
    expect(availableFeatures(MENU)).toEqual([]);
  });
});
