"use client";

import type { MenuItem } from "../../lib/fixtures/menu";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import styles from "./MenuItemCard.module.css";

export function MenuItemCard({ item }: { item: MenuItem }) {
  const { addItem } = useCart();
  const { highlightedItemId } = useUi();
  const isHighlighted = item.id === highlightedItemId;

  return (
    <li
      className={
        isHighlighted ? `${styles.card} ${styles.highlighted}` : styles.card
      }
    >
      <div>
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <p>{formatCents(item.priceCents)}</p>
      </div>
      <button
        type="button"
        onClick={() => addItem(item.id)}
        disabled={!item.available}
      >
        {item.available ? "Add to cart" : "Unavailable"}
      </button>
    </li>
  );
}
