"use client";

import type { MenuCategory } from "@contracts/api-contracts";
import { useUi } from "../../lib/state/uiStore";
import { CategoryInitial } from "../brand/illustrations";
import styles from "./CategoryFilter.module.css";

export function CategoryFilter({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { selectedCategory, selectCategory } = useUi();

  // The reference design's left category rail (a horizontal scroller on
  // narrow screens). Selecting still filters, as before: ShowMenuCategory
  // and the aria-pressed toggle-button pattern (Phase 2 AC2) are unchanged.
  const thumb = (label: string, imageUrl?: string) => (
    <span className={styles.thumb}>
      {imageUrl !== undefined ? (
        <img src={imageUrl} alt="" width={40} height={30} />
      ) : (
        <CategoryInitial name={label} />
      )}
    </span>
  );

  return (
    <div className={styles.filter} role="group" aria-label="Menu categories">
      <button
        type="button"
        className={selectedCategory === null ? styles.active : undefined}
        aria-pressed={selectedCategory === null}
        onClick={() => selectCategory(null)}
      >
        {thumb("All")}
        <span className={styles.name}>All</span>
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={selectedCategory === category.id ? styles.active : undefined}
          aria-pressed={selectedCategory === category.id}
          onClick={() => selectCategory(category.id)}
        >
          {thumb(category.name, category.imageUrl)}
          <span className={styles.name}>{category.name}</span>
        </button>
      ))}
    </div>
  );
}
