"use client";

import { useCart, type CartLine as CartLineData } from "../../lib/state/cartStore";
import { formatCents } from "../../lib/money";
import styles from "./CartLine.module.css";

export function CartLine({ line }: { line: CartLineData }) {
  const { removeItem, findItem } = useCart();
  const item = findItem(line.itemId);

  if (!item) {
    return null;
  }

  return (
    <li className={styles.line}>
      <span>{item.name}</span>
      <span>× {line.quantity}</span>
      <span>{formatCents(item.priceCents * line.quantity)}</span>
      <button
        type="button"
        onClick={() => removeItem(line.itemId)}
        aria-label={`Remove ${item.name} from cart`}
      >
        Remove
      </button>
    </li>
  );
}
