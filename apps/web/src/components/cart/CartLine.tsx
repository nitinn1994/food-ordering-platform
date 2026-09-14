"use client";

import type { CartLine as CartLineData } from "../../lib/state/cartStore";
import { useCart } from "../../lib/state/cartStore";
import { findMenuItem } from "../../lib/fixtures/menu";
import { formatCents } from "../../lib/money";
import styles from "./CartLine.module.css";

export function CartLine({ line }: { line: CartLineData }) {
  const { removeItem } = useCart();
  const item = findMenuItem(line.itemId);

  if (!item) {
    return null;
  }

  return (
    <li className={styles.line}>
      <span>{item.name}</span>
      <span>× {line.quantity}</span>
      <span>{formatCents(item.priceCents * line.quantity)}</span>
      <button type="button" onClick={() => removeItem(line.itemId)}>
        Remove
      </button>
    </li>
  );
}
