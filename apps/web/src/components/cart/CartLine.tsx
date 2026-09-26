"use client";

import { useEffect, useRef, useState } from "react";
import type { CartLine as CartLineData } from "@contracts/api-contracts";
import { MAX_QUANTITY } from "@contracts/common";
import { useCart } from "../../lib/state/cartStore";
import { formatCents } from "../../lib/money";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./CartLine.module.css";

const CHANGE_HIGHLIGHT_MS = 300;

// One commerce-api cart line: its name, quantity and lineSubtotalCents are
// the backend's, displayed as-is — no multiplication here
// (docs/features/phase-11-web-commerce-integration/plan.md §4).
//
// The stepper sets an absolute quantity (PATCH q±1), which is idempotent;
// only the menu's "Add to cart" adds a delta (plan.md OD5). Every control is
// disabled while any cart mutation is in flight (OD6). An unavailable line
// can only be removed — commerce-api refuses to re-quantify it (422
// MENU_ITEM_UNAVAILABLE), so offering the stepper would only produce an
// error (AC8).
export function CartLine({ line }: { line: CartLineData }) {
  const { setQuantity, removeItem, pending } = useCart();
  const [justChanged, setJustChanged] = useState(false);
  const previousQuantity = useRef(line.quantity);
  const busy = pending !== null;

  // A brief highlight when the confirmed quantity changes — now fired by a
  // backend response rather than a local reducer.
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
      <span>
        {line.name}
        {line.available ? null : (
          <strong className={styles.unavailable}> Unavailable</strong>
        )}
      </span>
      <QuantityStepper
        itemName={line.name}
        quantity={line.quantity}
        maxQuantity={MAX_QUANTITY}
        disabled={busy || !line.available}
        onIncrement={() => setQuantity(line.itemId, line.quantity + 1)}
        onDecrement={() => setQuantity(line.itemId, line.quantity - 1)}
      />
      <span>{formatCents(line.lineSubtotalCents)}</span>
      <button
        type="button"
        className={styles.removeButton}
        onClick={() => removeItem(line.itemId)}
        disabled={busy}
        aria-label={`Remove ${line.name} from cart`}
      >
        Remove
      </button>
    </li>
  );
}
