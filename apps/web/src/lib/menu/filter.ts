import type { MenuCategory } from "@contracts/api-contracts";

export type MenuFilter = {
  categoryId: string | null;
  query: string;
};

// Category and query combine with AND semantics: a category filter narrows
// which categories are considered at all, then the query narrows items
// within what's left. Categories left with zero matching items are dropped
// from the result — MenuList distinguishes "dropped by search" from
// "structurally empty" by whether a query was active (AC10).
export function filterMenu(
  categories: readonly MenuCategory[],
  filter: MenuFilter,
): MenuCategory[] {
  const normalizedQuery = filter.query.trim().toLowerCase();

  return categories
    .filter(
      (category) =>
        filter.categoryId === null || category.id === filter.categoryId,
    )
    .map((category) => ({
      ...category,
      items: normalizedQuery
        ? category.items.filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.description.toLowerCase().includes(normalizedQuery),
          )
        : category.items,
    }))
    .filter((category) => category.items.length > 0);
}
