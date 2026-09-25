import { describe, expect, it } from "vitest";
import type { MenuItemId } from "@contracts/common";
import { MenuRepository } from "../../menu/domain/menu.repository";
import type { MenuCategory, MenuItem } from "../../menu/domain/menu.types";
import { MenuService } from "../../menu/menu.service";
import { MenuCatalogAdapter } from "./menu-catalog.adapter";

const GELATO: MenuItem = {
  id: "gelato",
  categoryId: "desserts",
  name: "Gelato",
  description: "Two scoops.",
  longDescription: "Two scoops of house gelato.",
  priceCents: 550,
  available: false,
  dietaryTags: [],
  allergens: ["dairy"],
  calories: 300,
};

class FakeMenuRepository extends MenuRepository {
  async listCategories(): Promise<readonly MenuCategory[]> {
    return [{ id: "desserts", name: "Desserts", items: [GELATO] }];
  }

  async findItemById(id: MenuItemId): Promise<MenuItem | undefined> {
    return id === GELATO.id ? GELATO : undefined;
  }
}

describe("MenuCatalogAdapter (OD14)", () => {
  const adapter = new MenuCatalogAdapter(new MenuService(new FakeMenuRepository()));

  it("returns exactly the four fields Cart needs, availability passed through", async () => {
    await expect(adapter.findItem("gelato")).resolves.toEqual({
      id: "gelato",
      name: "Gelato",
      priceCents: 550,
      available: false,
    });
  });

  it("returns undefined for an item not on the menu", async () => {
    await expect(adapter.findItem("does-not-exist")).resolves.toBeUndefined();
  });
});
