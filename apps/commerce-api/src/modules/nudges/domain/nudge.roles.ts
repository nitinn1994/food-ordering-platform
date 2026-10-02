import type { NudgeMenuItem } from "./nudge.types";

// What part of a meal each menu category is, for the meal rules. Keyed by
// category id: the demo menu's (demo-menu.seed.ts) and the test menu's
// (menu.seed.ts). A category with no role is never suggested by a meal
// rule and never counts towards one — it can still appear through a
// feature-based rule. Adding a category to the menu means adding it here.
export type MealRole = "main" | "side" | "drink" | "dessert" | "meal" | "breakfast";

const CATEGORY_ROLES: Readonly<Record<string, MealRole>> = {
  // Demo menu.
  breakfast: "breakfast",
  "burgers-wraps": "main",
  "fried-chicken": "main",
  "fries-sides": "side",
  meals: "meal",
  beverages: "drink",
  coffee: "drink",
  sweets: "dessert",
  // Test menu.
  starters: "side",
  mains: "main",
  desserts: "dessert",
};

export function roleOf(item: Pick<NudgeMenuItem, "categoryId">): MealRole | undefined {
  return CATEGORY_ROLES[item.categoryId];
}

// A meal item ("Burger, fries and a drink") already covers a main, a side
// and a drink.
export function covers(role: MealRole | undefined, wanted: "main" | "side" | "drink"): boolean {
  return role === wanted || role === "meal";
}
