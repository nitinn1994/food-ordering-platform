"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "../../lib/fixtures/menu";
import { useCart, type CartLine as CartLineData } from "../../lib/state/cartStore";
import { formatCents } from "../../lib/money";
import { MAX_LINE_QUANTITY, lineSubtotalCents } from "../../lib/cart/pricing";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./CartLine.module.css";

const CHANGE_HIGHLIGHT_MS = 300;

// Takes the resolved item as a prop rather than looking it up itself — the
// caller already has categories in scope (see CartList/CartPanel), and an
// unresolvable line is the caller's decision not to render this component
// at all (Q12, docs/features/phase-3-frontend-cart-simulation/plan.md).
export function CartLine({
  line,
  item,
}: {
  line: CartLineData;
  item: MenuItem;
}) {
  const { addItem, decrementItem, removeItem } = useCart();
  const [justChanged, setJustChanged] = useState(false);
  const previousQuantity = useRef(line.quantity);

  // A brief highlight is the only "loading" feedback a synchronous local
  // mutation warrants — a spinner would fabricate latency the app doesn't
  // have (docs/features/phase-3-frontend-cart-simulation/plan.md §14).
  useEffect(() => {
    if (line.quantity === previousQuantity.current) {
      return;
    }
    previousQuantity.current = line.quantity;
    setJustChanged(true);
    const timeout = setTimeout(() => setJustChanged(false), CHANGE_HIGHLIGHT_MS);
    return () => clearTimeout(timeout);
  }, [line.quantity]);

  return (
    <li
      className={
        justChanged ? `${styles.line} ${styles.changed}` : styles.line
      }
    >
      <span>{item.name}</span>
      <QuantityStepper
        itemName={item.name}
        quantity={line.quantity}
        maxQuantity={MAX_LINE_QUANTITY}
        onIncrement={() => addItem(item.id)}
        onDecrement={() => decrementItem(item.id)}
      />
      <span>{formatCents(lineSubtotalCents(item, line.quantity))}</span>
      <button
        type="button"
        className={styles.removeButton}
        onClick={() => removeItem(item.id)}
        aria-label={`Remove ${item.name} from cart`}
      >
        Remove
      </button>
    </li>
  );
}
