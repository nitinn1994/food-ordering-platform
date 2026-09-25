import type {
  MenuCategory as MenuCategoryResponse,
  MenuItemResponse,
  MenuResponse,
} from "@contracts/api-contracts";
import type { MenuCategory, MenuItem } from "./domain/menu.types";

// Translates this module's domain types into @contracts/api-contracts's
// wire shapes, field by field — the domain and the contract happen to look
// alike today, but this is the one place that would change if they diverge
// (plan.md §2). MenuService is the only caller.

export function toMenuItemResponse(item: MenuItem): MenuItemResponse {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    longDescription: item.longDescription,
    priceCents: item.priceCents,
    available: item.available,
    dietaryTags: [...item.dietaryTags],
    allergens: [...item.allergens],
    calories: item.calories,
  };
}

function toMenuCategoryResponse(category: MenuCategory): MenuCategoryResponse {
  return {
    id: category.id,
    name: category.name,
    items: category.items.map(toMenuItemResponse),
  };
}

export function toMenuResponse(
  categories: readonly MenuCategory[],
): MenuResponse {
  return { categories: categories.map(toMenuCategoryResponse) };
}
