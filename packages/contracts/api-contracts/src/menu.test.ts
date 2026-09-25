import { describe, expect, it } from "vitest";
import {
  menuCategorySchema,
  menuItemParamsSchema,
  menuItemSchema,
  menuResponseSchema,
} from "./menu";

const VALID_ITEM = {
  id: "tiramisu",
  categoryId: "desserts",
  name: "Tiramisu",
  description: "Espresso-soaked sponge, mascarpone, cocoa.",
  longDescription:
    "Layers of espresso-soaked sponge and whipped mascarpone, dusted with cocoa.",
  priceCents: 750,
  available: true,
  dietaryTags: ["vegetarian"],
  allergens: ["gluten", "dairy", "egg"],
  calories: 480,
};

describe("menuItemSchema", () => {
  it("accepts a well-formed item", () => {
    expect(menuItemSchema.safeParse(VALID_ITEM).success).toBe(true);
  });

  it("rejects an unknown key (strict object)", () => {
    const result = menuItemSchema.safeParse({ ...VALID_ITEM, extra: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      priceCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fractional price", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      priceCents: 7.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an id that is not lowercase kebab-case", () => {
    const result = menuItemSchema.safeParse({ ...VALID_ITEM, id: "Bad_ID" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-slug dietary tag", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      dietaryTags: ["Not A Slug"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 dietary tags", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      dietaryTags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 allergens", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      allergens: Array.from({ length: 21 }, (_, i) => `allergen-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative calorie count", () => {
    const result = menuItemSchema.safeParse({ ...VALID_ITEM, calories: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 200 characters", () => {
    const result = menuItemSchema.safeParse({
      ...VALID_ITEM,
      description: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("menuCategorySchema", () => {
  it("accepts a category with nested items", () => {
    const result = menuCategorySchema.safeParse({
      id: "desserts",
      name: "Desserts",
      items: [VALID_ITEM],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown key", () => {
    const result = menuCategorySchema.safeParse({
      id: "desserts",
      name: "Desserts",
      items: [],
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("menuResponseSchema", () => {
  it("accepts a list of categories", () => {
    const result = menuResponseSchema.safeParse({
      categories: [{ id: "desserts", name: "Desserts", items: [VALID_ITEM] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bare array (must be wrapped in { categories })", () => {
    const result = menuResponseSchema.safeParse([
      { id: "desserts", name: "Desserts", items: [] },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("menuItemParamsSchema", () => {
  it("accepts a well-formed itemId", () => {
    expect(
      menuItemParamsSchema.safeParse({ itemId: "tiramisu" }).success,
    ).toBe(true);
  });

  it("rejects an itemId with invalid characters", () => {
    expect(
      menuItemParamsSchema.safeParse({ itemId: "Bad_ID" }).success,
    ).toBe(false);
  });

  it("rejects an itemId over 64 characters", () => {
    expect(
      menuItemParamsSchema.safeParse({ itemId: "a".repeat(65) }).success,
    ).toBe(false);
  });

  it("rejects an unknown key", () => {
    expect(
      menuItemParamsSchema.safeParse({ itemId: "tiramisu", extra: 1 })
        .success,
    ).toBe(false);
  });
});
