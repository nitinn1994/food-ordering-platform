"use client";

import type { MenuCategory } from "@contracts/api-contracts";
import { useUi } from "../../lib/state/uiStore";
import { filterMenu } from "../../lib/menu/filter";
import { filterByDiet, type DietFilter } from "../../lib/menu/diet";
import {
  availableFeatures,
  FEATURE_LABELS,
  filterByFeature,
} from "../../lib/menu/featured";
import { MenuItemCard } from "./MenuItemCard";
import styles from "./MenuList.module.css";

export function MenuList({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  // The Veg / Non-Veg and Popular / Deals / New Launch chips (plan.md
  // Phases 1–2, AC-U4) live in uiStore, so a UI command that shows a
  // category, highlights an item or searches can clear them
  // (review-report.md finding 3). They reset on reload.
  const {
    selectedCategory,
    searchQuery,
    dietFilter: diet,
    featureFilter: feature,
    setDietFilter: setDiet,
    setFeatureFilter: setFeature,
  } = useUi();
  const features = availableFeatures(categories);

  const visibleCategories = filterByFeature(
    filterByDiet(
      filterMenu(categories, {
        categoryId: selectedCategory,
        query: searchQuery,
      }),
      diet,
    ),
    feature,
  );

  let body;
  if (visibleCategories.length === 0) {
    // Distinguishes "search found nothing" from "this category happens to
    // be empty" (AC10) — the two have different causes and different next
    // actions for the user (clear the search vs. nothing to do).
    body = (
      <p role="status">
        {searchQuery.trim()
          ? `No items match "${searchQuery.trim()}".`
          : diet !== null || feature !== null
            ? "No items match these filters."
            : "No items in this category."}
      </p>
    );
  } else {
    body = visibleCategories.map((category) => (
      <section key={category.id} className={styles.section}>
        <h2>{category.name}</h2>
        <ul className={styles.items}>
          {category.items.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </ul>
      </section>
    ));
  }

  const dietChip = (value: Exclude<DietFilter, null>, label: string) => (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={diet === value}
      onClick={() => setDiet(diet === value ? null : value)}
    >
      <span
        className={`${styles.marker} ${value === "veg" ? styles.veg : styles.nonVeg}`}
        aria-hidden="true"
      />
      {label}
    </button>
  );

  return (
    <div className={styles.list}>
      {features.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Featured">
          {features.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${styles.featureChip}`}
              aria-pressed={feature === value}
              onClick={() => setFeature(feature === value ? null : value)}
            >
              {FEATURE_LABELS[value]}
            </button>
          ))}
        </div>
      )}
      <div className={styles.chips} role="group" aria-label="Dietary filter">
        {dietChip("veg", "Veg")}
        {dietChip("non-veg", "Non-Veg")}
      </div>
      {body}
    </div>
  );
}
