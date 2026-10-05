"use client";

import type { MenuCategory } from "@contracts/api-contracts";
import { useUi } from "../../lib/state/uiStore";
import { scrollToMenu } from "../../lib/menu/scrollToMenu";
import { CategoryInitial } from "../brand/illustrations";
import styles from "./CategoryBento.module.css";

// The reference's mobile category grid (docs/features/mcdelivery-parity/
// reference-inventory.md M1; AC5): one full-width tile, then rows of two,
// then rows of three. A tile selects the category — the same state as the
// rail and ShowMenuCategory — and scrolls the menu into view.
export function tileSize(index: number): "full" | "half" | "third" {
  if (index === 0) return "full";
  if (index <= 2) return "half";
  return "third";
}

export function CategoryBento({ categories }: { categories: readonly MenuCategory[] }) {
  const { selectCategory } = useUi();

  if (categories.length === 0) {
    return null;
  }

  return (
    <nav className={styles.bento} aria-label="Browse categories">
      <ul className={styles.grid}>
        {categories.map((category, index) => (
          <li key={category.id} className={styles[tileSize(index)]}>
            <button
              type="button"
              className={styles.tile}
              onClick={() => {
                selectCategory(category.id);
                scrollToMenu();
              }}
            >
              <span className={styles.name}>{category.name}</span>
              <span className={styles.art}>
                {category.imageUrl !== undefined ? (
                  <img src={category.imageUrl} alt="" width={120} height={90} />
                ) : (
                  <CategoryInitial name={category.name} />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
