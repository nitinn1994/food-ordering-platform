import type { MenuCategoryId, MenuItemId, PriceCents } from "@contracts/common";

// The Menu domain's own types — deliberately separate from
// @contracts/api-contracts's wire schemas (menu.ts, plan.md §2), so a future
// database row shape, this domain model, and the HTTP response can each
// change without forcing the others to. Identifier and money *types* are
// still reused from @contracts/common (the same primitives every consumer
// shares); the object shapes below are this module's own.
//
// Every field is readonly: nothing in this domain mutates a MenuItem or
// MenuCategory once built — see infrastructure/in-memory-menu.repository.ts,
// which freezes what it returns.

export interface MenuItem {
  readonly id: MenuItemId;
  readonly categoryId: MenuCategoryId;
  readonly name: string;
  readonly description: string;
  readonly longDescription: string;
  readonly priceCents: PriceCents;
  readonly available: boolean;
  readonly dietaryTags: readonly string[];
  readonly allergens: readonly string[];
  readonly calories: number;
}

export interface MenuCategory {
  readonly id: MenuCategoryId;
  readonly name: string;
  // Display order — the order a repository returns items in is the order
  // they render in, so there is no separate sortOrder field.
  readonly items: readonly MenuItem[];
}
