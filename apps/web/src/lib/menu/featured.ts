import {
  MENU_ITEM_FEATURES,
  type MenuCategory,
  type MenuItem,
  type MenuItemBadge,
  type MenuItemFeature,
} from "@contracts/api-contracts";

// The "Our Menu" chips and card badges (docs/features/mcdelivery-redesign/
// requirements.md AC-U3, AC-U4), driven by the menu's optional `featured`
// and `badge` fields (Phase 2). The chips are curated, not personalised, so
// the reference's "For You" is labelled "Popular" here.
export const FEATURE_LABELS: Readonly<Record<MenuItemFeature, string>> = {
  popular: "Popular",
  deal: "Deals",
  "new-launch": "New Launch",
};

export const BADGE_LABELS: Readonly<Record<MenuItemBadge, string>> = {
  new: "New",
  bestseller: "Bestseller",
  value: "Value pick",
};


// Narrows items within each category and drops categories left empty, like
// filterMenu and filterByDiet. Used by featuredItems (the /tag pages and
// search's popular items).
export function filterByFeature(
  categories: readonly MenuCategory[],
  feature: MenuItemFeature | null,
): MenuCategory[] {
  if (feature === null) {
    return [...categories];
  }
  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.featured?.includes(feature) ?? false),
    }))
    .filter((category) => category.items.length > 0);
}

// Only the chips some item on the menu can satisfy — a chip that could only
// ever show "nothing here" is not offered.
export function availableFeatures(categories: readonly MenuCategory[]): MenuItemFeature[] {
  const present = new Set(
    categories.flatMap((category) => category.items.flatMap((item) => item.featured ?? [])),
  );
  return (Object.keys(FEATURE_LABELS) as MenuItemFeature[]).filter((feature) =>
    present.has(feature),
  );
}

// The /tag/[feature] route segment (mcdelivery-parity AC6): only the
// contract's own features are pages; anything else is a 404.
export function isMenuItemFeature(value: string): value is MenuItemFeature {
  return (MENU_ITEM_FEATURES as readonly string[]).includes(value);
}

// Every item carrying the feature, in menu order, flattened for the tag
// page's grid.
export function featuredItems(
  categories: readonly MenuCategory[],
  feature: MenuItemFeature,
): MenuItem[] {
  return filterByFeature(categories, feature).flatMap((category) => category.items);
}
