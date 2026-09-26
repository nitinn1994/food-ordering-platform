"use client";

import type { MenuCategory } from "@contracts/api-contracts";
import { useUi } from "../../lib/state/uiStore";
import { filterMenu } from "../../lib/menu/filter";
import { MenuItemCard } from "./MenuItemCard";
import styles from "./MenuList.module.css";

export function MenuList({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { selectedCategory, searchQuery } = useUi();

  const visibleCategories = filterMenu(categories, {
    categoryId: selectedCategory,
    query: searchQuery,
  });

  if (visibleCategories.length === 0) {
    // Distinguishes "search found nothing" from "this category happens to
    // be empty" (AC10) — the two have different causes and different next
    // actions for the user (clear the search vs. nothing to do).
    return (
      <p role="status">
        {searchQuery.trim()
          ? `No items match "${searchQuery.trim()}".`
          : "No items in this category."}
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {visibleCategories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul className={styles.items}>
            {category.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
