import type { MenuCategory } from "./menu.types";

// Thrown only at boot, when a repository is constructed from seed data
// (infrastructure/in-memory-menu.repository.ts) — never on a request. A bad
// seed must stop the process from starting, the same fail-fast rule
// env.schema.ts already applies to configuration (requirements.md AC6).
export class MenuInvariantViolationError extends Error {
  constructor(message: string) {
    super(`Menu data invariant violated: ${message}`);
    this.name = "MenuInvariantViolationError";
  }
}

// Checked once, not per-request: every category id is unique, every item id
// is unique across the whole menu (not just within its own category), and
// every item's categoryId names the category it actually appears under.
export function assertMenuInvariants(
  categories: readonly MenuCategory[],
): void {
  const seenCategoryIds = new Set<string>();
  const seenItemIds = new Set<string>();

  for (const category of categories) {
    if (seenCategoryIds.has(category.id)) {
      throw new MenuInvariantViolationError(
        `duplicate category id "${category.id}"`,
      );
    }
    seenCategoryIds.add(category.id);

    for (const item of category.items) {
      if (seenItemIds.has(item.id)) {
        throw new MenuInvariantViolationError(
          `duplicate item id "${item.id}"`,
        );
      }
      seenItemIds.add(item.id);

      if (item.categoryId !== category.id) {
        throw new MenuInvariantViolationError(
          `item "${item.id}" has categoryId "${item.categoryId}" but appears ` +
            `under category "${category.id}"`,
        );
      }
    }
  }
}
