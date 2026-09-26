import { formatCents } from "../../lib/money";
import { CartTotal } from "../cart/CartTotal";
import type { OrderSummaryLine } from "../../lib/checkout/types";
import styles from "./OrderSummary.module.css";

// Read-only order summary — plain props only, never reads useCart or the
// checkout reducer directly, so it renders identically whether given the
// backend cart's live lines (CheckoutReview) or commerce-api's placed
// order (OrderConfirmation) — both are already priced by commerce-api. Reuses CartTotal for the total line, the exact
// component /cart already renders its own total through, rather than
// re-implementing the same "Total: $X.XX" markup here. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §11, §13.
export function OrderSummary({
  lines,
  totalCents,
}: {
  lines: readonly OrderSummaryLine[];
  totalCents: number;
}) {
  return (
    <div className={styles.summary}>
      <ul className={styles.lines}>
        {lines.map((line) => (
          <li key={line.itemId} className={styles.line}>
            <span>
              {line.name} × {line.quantity}
            </span>
            <span>{formatCents(line.lineSubtotalCents)}</span>
          </li>
        ))}
      </ul>
      <CartTotal totalCents={totalCents} />
    </div>
  );
}
