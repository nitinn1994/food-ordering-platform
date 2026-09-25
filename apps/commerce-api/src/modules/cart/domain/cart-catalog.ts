import type { MenuItemId } from "@contracts/common";
import type { CatalogItem } from "./cart.types";

// What the Cart domain needs to know about menu items, stated from Cart's
// side (docs/features/phase-8-cart-domain/plan.md §9, OD14). The Phase 8
// adapter (infrastructure/menu-catalog.adapter.ts) answers it from
// MenuService; Cart never imports the Menu domain's types, repository, or
// seed.
export abstract class CartCatalog {
  // undefined when no such item is on the menu — deciding whether that is
  // an error is CartService's job, not the catalog's.
  abstract findItem(itemId: MenuItemId): Promise<CatalogItem | undefined>;
}
