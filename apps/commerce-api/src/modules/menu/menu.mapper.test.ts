import { describe, expect, it } from "vitest";
import { menuItemResponseSchema, menuResponseSchema } from "@contracts/api-contracts";
import type { MenuItem } from "./domain/menu.types";
import { toMenuItemResponse, toMenuResponse } from "./menu.mapper";

// The optional presentation fields (docs/features/mcdelivery-redesign/
// plan.md Phase 2): sent when present, absent — not null — otherwise.
const PLAIN: MenuItem = {
  id: "fries-medium",
  categoryId: "fries-sides",
  name: "Fries (Medium)",
  description: "Golden, salted fries.",
  longDescription: "Thin-cut potato fries.",
  priceCents: 10900,
  available: true,
  dietaryTags: ["vegetarian"],
  allergens: [],
  calories: 320,
};

describe("menu.mapper — presentation fields", () => {
  it("omits every presentation field an item does not have", () => {
    const response = toMenuItemResponse(PLAIN);
    for (const key of ["imageUrl", "weightGrams", "badge", "featured"]) {
      expect(response).not.toHaveProperty(key);
    }
    expect(menuItemResponseSchema.safeParse(response).success).toBe(true);
  });

  it("omits an empty featured list", () => {
    expect(toMenuItemResponse({ ...PLAIN, featured: [] })).not.toHaveProperty("featured");
  });

  it("copies every presentation field an item has", () => {
    const response = toMenuItemResponse({
      ...PLAIN,
      imageUrl: "/menu/fries.svg",
      weightGrams: 110,
      badge: "bestseller",
      featured: ["popular"],
    });
    expect(response).toMatchObject({
      imageUrl: "/menu/fries.svg",
      weightGrams: 110,
      badge: "bestseller",
      featured: ["popular"],
    });
    expect(menuItemResponseSchema.safeParse(response).success).toBe(true);
  });

  it("copies a category's image only when it has one", () => {
    const response = toMenuResponse([
      { id: "fries-sides", name: "Fries & Sides", imageUrl: "/menu/fries.svg", items: [PLAIN] },
      { id: "other", name: "Other", items: [] },
    ]);
    expect(response.categories[0]).toHaveProperty("imageUrl", "/menu/fries.svg");
    expect(response.categories[1]).not.toHaveProperty("imageUrl");
    expect(menuResponseSchema.safeParse(response).success).toBe(true);
  });
});
