import type { CartResponse } from "@contracts/api-contracts";
import { formatCents } from "../../lib/money";
import styles from "./TotalCharges.module.css";

// The reference's expandable "Total Charges" (docs/features/
// mcdelivery-parity/reference-inventory.md §7; AC13), with only what
// commerce-api returns: the item count and subtotal. The reference's
// handling and GST lines are left out — the backend has no such amounts,
// and the web never prices anything (Phase 11 §4).
export function TotalCharges({ cart }: { cart: CartResponse }) {
  return (
    <details className={styles.charges}>
      <summary>
        <span>Total Charges</span>
        <strong>{formatCents(cart.subtotalCents)}</strong>
      </summary>
      <dl className={styles.rows}>
        <div>
          <dt>
            Item total ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
          </dt>
          <dd>{formatCents(cart.subtotalCents)}</dd>
        </div>
        <div className={styles.toPay}>
          <dt>To pay</dt>
          <dd>{formatCents(cart.subtotalCents)}</dd>
        </div>
      </dl>
    </details>
  );
}
