"use client";

import type { MenuItem } from "@contracts/api-contracts";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import styles from "./MenuItemCard.module.css";

// "Add to cart" is the one cart action that sends a delta (POST, quantity
// 1). Disabled while any cart mutation is in flight; the card whose add is
// in flight says so (docs/features/phase-11-web-commerce-integration/
// plan.md §4, §12). `available` is only a hint here — commerce-api is what
// enforces it.
export function MenuItemCard({ item }: { item: MenuItem }) {
  const { addItem, pending } = useCart();
  const isAdding = pending?.op === "add" && pending.itemId === item.id;
  const { highlightedItemId, showItemDetail } = useUi();
  const isHighlighted = item.id === highlightedItemId;

  return (
    <li
      className={
        isHighlighted ? `${styles.card} ${styles.highlighted}` : styles.card
      }
    >
      <button
        type="button"
        className={styles.detailsButton}
        onClick={() => showItemDetail(item.id)}
        aria-label={`View details for ${item.name}`}
      >
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <p>{formatCents(item.priceCents)}</p>
      </button>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => addItem(item.id)}
        disabled={!item.available || pending !== null}
      >
        {!item.available ? "Unavailable" : isAdding ? "Adding…" : "Add to cart"}
      </button>
    </li>
  );
}
