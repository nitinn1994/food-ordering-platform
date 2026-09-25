import { describe, expect, it } from "vitest";
import { menuResponseSchema } from "@contracts/api-contracts";
import { assertMenuInvariants, MenuInvariantViolationError } from "../domain/menu.invariants";
import { InMemoryMenuRepository } from "./in-memory-menu.repository";
import { MENU_SEED } from "./menu.seed";

describe("MENU_SEED", () => {
  it("parses against the api-contracts menu response schema (AC1, AC8)", () => {
    const result = menuResponseSchema.safeParse({ categories: MENU_SEED });
    expect(result.success).toBe(true);
  });

  it("satisfies the domain invariants", () => {
    expect(() => assertMenuInvariants(MENU_SEED)).not.toThrow();
  });

  it("has 3 categories and 6 items", () => {
    expect(MENU_SEED).toHaveLength(3);
    expect(MENU_SEED.flatMap((category) => category.items)).toHaveLength(6);
  });

  it("marks gelato unavailable and every other item available (AC2)", () => {
    const items = MENU_SEED.flatMap((category) => category.items);
    const gelato = items.find((item) => item.id === "gelato");

    expect(gelato?.available).toBe(false);
    expect(
      items.filter((item) => item.id !== "gelato").every((item) => item.available),
    ).toBe(true);
  });
});

describe("InMemoryMenuRepository", () => {
  it("returns categories and items in seed (display) order (AC1)", async () => {
    const repository = new InMemoryMenuRepository();

    const categories = await repository.listCategories();

    expect(categories.map((category) => category.id)).toEqual([
      "starters",
      "mains",
      "desserts",
    ]);
    expect(categories[0]?.items.map((item) => item.id)).toEqual([
      "garlic-bread",
      "soup-of-the-day",
    ]);
  });

  it("finds an item by id across categories (AC2)", async () => {
    const repository = new InMemoryMenuRepository();

    const item = await repository.findItemById("tiramisu");

    expect(item?.name).toBe("Tiramisu");
    expect(item?.categoryId).toBe("desserts");
  });

  it("returns undefined for an unknown item id, rather than throwing", async () => {
    const repository = new InMemoryMenuRepository();

    await expect(repository.findItemById("does-not-exist")).resolves.toBeUndefined();
  });

  it("returns frozen data — mutating a category or item throws (AC7)", async () => {
    const repository = new InMemoryMenuRepository();

    const categories = await repository.listCategories();
    const [firstCategory] = categories;
    const [firstItem] = firstCategory!.items;

    expect(() => {
      (categories as unknown as { push: (value: unknown) => void }).push({});
    }).toThrow();
    expect(() => {
      (firstCategory as { name: string }).name = "Mutated";
    }).toThrow();
    expect(() => {
      (firstItem as { priceCents: number }).priceCents = 0;
    }).toThrow();
  });

  it("fails construction when the seed violates a domain invariant (AC6)", () => {
    // The real seed is well-formed (asserted above), so the failure path is
    // proven directly against assertMenuInvariants rather than by mutating
    // the module-level MENU_SEED import (which would leak into other
    // tests). This is the same check InMemoryMenuRepository's constructor
    // runs before freezing its data.
    const brokenSeed = [
      {
        id: "desserts",
        name: "Desserts",
        items: [
          {
            id: "tiramisu",
            categoryId: "mains", // mismatched on purpose
            name: "Tiramisu",
            description: "d",
            longDescription: "d",
            priceCents: 750,
            available: true,
            dietaryTags: [],
            allergens: [],
            calories: 450,
          },
        ],
      },
    ];

    expect(() => assertMenuInvariants(brokenSeed)).toThrow(
      MenuInvariantViolationError,
    );
  });
});
