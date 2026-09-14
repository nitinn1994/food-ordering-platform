"use client";

import type { MenuCategory } from "../../lib/fixtures/menu";
import { findMenuItemIn } from "../../lib/menu/menuSource";
import { formatCents } from "../../lib/money";
import { useUi } from "../../lib/state/uiStore";
import styles from "./ItemDetailPanel.module.css";

// Deliberately non-modal — no focus trap, no aria-modal, no Escape handling
// to get wrong. See docs/features/phase-2-menu-browsing/plan.md §6.
export function ItemDetailPanel({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { detailItemId, showItemDetail } = useUi();

  if (!detailItemId) {
    return null;
  }

  const item = findMenuItemIn(categories, detailItemId);

  if (!item) {
    return null;
  }

  return (
    <section className={styles.panel} aria-label={`${item.name} details`}>
      <button
        type="button"
        className={styles.close}
        onClick={() => showItemDetail(null)}
        aria-label="Close details"
      >
        ×
      </button>
      <h2>{item.name}</h2>
      <p>{item.longDescription}</p>
      <p>
        <strong>{formatCents(item.priceCents)}</strong> · {item.calories} cal
      </p>
      {item.dietaryTags.length > 0 && (
        <p>
          <strong>Dietary:</strong> {item.dietaryTags.join(", ")}
        </p>
      )}
      {item.allergens.length > 0 && (
        <p>
          <strong>Allergens:</strong> {item.allergens.join(", ")}
        </p>
      )}
      {!item.available && <p role="status">Currently unavailable.</p>}
    </section>
  );
}
