import { describe, expect, it } from "vitest";
import type { MenuItemId } from "@contracts/common";
import type { MenuCategory, MenuItem } from "./domain/menu.types";
import { MenuItemNotFoundError } from "./domain/menu.errors";
import { MenuRepository } from "./domain/menu.repository";
import { MenuService } from "./menu.service";

const ITEM: MenuItem = {
  id: "tiramisu",
  categoryId: "desserts",
  name: "Tiramisu",
  description: "Espresso-soaked ladyfingers, mascarpone.",
  longDescription: "Espresso-soaked ladyfingers layered with mascarpone.",
  priceCents: 750,
  available: true,
  dietaryTags: ["vegetarian"],
  allergens: ["gluten", "dairy", "egg"],
  calories: 450,
};

const CATEGORIES: readonly MenuCategory[] = [
  { id: "desserts", name: "Desserts", items: [ITEM] },
];

// A fake, not a mock — this is the abstraction itself being exercised
// (requirements.md AC5): MenuService is constructed with nothing but this
// class, proving it depends on MenuRepository's contract and not on
// InMemoryMenuRepository or the seed.
class FakeMenuRepository extends MenuRepository {
  async listCategories(): Promise<readonly MenuCategory[]> {
    return CATEGORIES;
  }

  async findItemById(id: MenuItemId): Promise<MenuItem | undefined> {
    return CATEGORIES.flatMap((category) => category.items).find(
      (item) => item.id === id,
    );
  }
}

describe("MenuService", () => {
  it("getMenu() maps the repository's categories to the wire shape (AC1)", async () => {
    const service = new MenuService(new FakeMenuRepository());

    const result = await service.getMenu();

    expect(result).toEqual({
      categories: [
        {
          id: "desserts",
          name: "Desserts",
          items: [
            {
              id: "tiramisu",
              categoryId: "desserts",
              name: "Tiramisu",
              description: "Espresso-soaked ladyfingers, mascarpone.",
              longDescription:
                "Espresso-soaked ladyfingers layered with mascarpone.",
              priceCents: 750,
              available: true,
              dietaryTags: ["vegetarian"],
              allergens: ["gluten", "dairy", "egg"],
              calories: 450,
            },
          ],
        },
      ],
    });
  });

  it("getItem() maps a found item to the wire shape (AC2)", async () => {
    const service = new MenuService(new FakeMenuRepository());

    const result = await service.getItem("tiramisu");

    expect(result.id).toBe("tiramisu");
    expect(result.name).toBe("Tiramisu");
  });

  it("getItem() throws MenuItemNotFoundError for an unknown id (AC3)", async () => {
    const service = new MenuService(new FakeMenuRepository());

    await expect(service.getItem("does-not-exist")).rejects.toBeInstanceOf(
      MenuItemNotFoundError,
    );
  });
});
