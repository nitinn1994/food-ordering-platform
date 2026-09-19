import Link from "next/link";
import styles from "./EmptyCheckoutNotice.module.css";

// The empty-cart guard for /checkout — rendered whenever there is nothing
// to check out. A plain message, not a redirect: the cart lives in client
// state the server cannot see. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §15.
export function EmptyCheckoutNotice() {
  return (
    <div className={styles.empty}>
      <p>Your cart is empty.</p>
      <Link href="/">Browse the menu</Link>
    </div>
  );
}
