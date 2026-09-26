"use client";

import type { MenuCategory } from "@contracts/api-contracts";
import { useUi } from "../../lib/state/uiStore";
import styles from "./CategoryFilter.module.css";

export function CategoryFilter({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { selectedCategory, selectCategory } = useUi();

  return (
    <div className={styles.filter} role="group" aria-label="Menu categories">
      <button
        type="button"
        className={selectedCategory === null ? styles.active : undefined}
        aria-pressed={selectedCategory === null}
        onClick={() => selectCategory(null)}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={selectedCategory === category.id ? styles.active : undefined}
          aria-pressed={selectedCategory === category.id}
          onClick={() => selectCategory(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
