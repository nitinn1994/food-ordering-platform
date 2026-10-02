import type { MenuCategory, MenuItem } from "@contracts/api-contracts";
import type { DietFilter } from "../state/uiStore";

export type { DietFilter };

// The reference design's Veg / Non-Veg marker and filter
// (docs/features/mcdelivery-redesign/requirements.md AC-U3, AC-U4). The menu
// has no explicit veg flag, so an item is vegetarian when commerce-api tags
// it "vegetarian" or "vegan", and non-vegetarian otherwise.
const VEGETARIAN_TAGS: readonly string[] = ["vegetarian", "vegan"];


export function isVegetarian(item: Pick<MenuItem, "dietaryTags">): boolean {
  return item.dietaryTags.some((tag) => VEGETARIAN_TAGS.includes(tag));
}

// Narrows items within each category and drops categories left empty, like
// filterMenu (filter.ts) — the two compose.
export function filterByDiet(
  categories: readonly MenuCategory[],
  diet: DietFilter,
): MenuCategory[] {
  if (diet === null) {
    return [...categories];
  }
  const wantVegetarian = diet === "veg";
  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter(
        (item) => isVegetarian(item) === wantVegetarian,
      ),
    }))
    .filter((category) => category.items.length > 0);
}
