"use client";

import type { MenuItem } from "../../lib/fixtures/menu";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import styles from "./MenuItemCard.module.css";

export function MenuItemCard({ item }: { item: MenuItem }) {
  const { addItem } = useCart();
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
        disabled={!item.available}
      >
        {item.available ? "Add to cart" : "Unavailable"}
      </button>
    </li>
  );
}
