"use client";

import { MENU } from "../../lib/fixtures/menu";
import { useUi } from "../../lib/state/uiStore";
import styles from "./CategoryFilter.module.css";

export function CategoryFilter() {
  const { selectedCategory, selectCategory } = useUi();

  return (
    <div className={styles.filter} role="tablist" aria-label="Menu categories">
      <button
        type="button"
        className={selectedCategory === null ? styles.active : undefined}
        aria-pressed={selectedCategory === null}
        onClick={() => selectCategory(null)}
      >
        All
      </button>
      {MENU.map((category) => (
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
