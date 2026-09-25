import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import { MenuService } from "../../menu/menu.service";
import { CartCatalog } from "../domain/cart-catalog";
import type { CatalogItem } from "../domain/cart.types";

// Answers the Cart domain's CartCatalog port from the Menu module's exported
// MenuService — the one file in the Cart module that knows Menu exists
// (docs/features/phase-8-cart-domain/plan.md §9, OD14). It copies exactly
// the four fields Cart needs, so nothing else of Menu's model leaks into
// Cart.
@Injectable()
export class MenuCatalogAdapter extends CartCatalog {
  constructor(private readonly menuService: MenuService) {
    super();
  }

  async findItem(itemId: MenuItemId): Promise<CatalogItem | undefined> {
    const item = await this.menuService.findItemById(itemId);
    if (!item) {
      return undefined;
    }
    return {
      id: item.id,
      name: item.name,
      priceCents: item.priceCents,
      available: item.available,
    };
  }
}
