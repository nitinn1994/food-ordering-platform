import styles from "./CheckoutAnnouncer.module.css";

// One polite live region for checkout status — separate from CartAnnouncer
// (which stays cart-count only), so an order-confirmation cart-clear never
// competes with a checkout announcement in the same region. Unlike
// CartAnnouncer, this is a plain, prop-driven display: the owner
// (CheckoutFlow) decides exactly when the message changes (a failed
// submit, and — from sub-phase 4.4 — a placed order), so there is no
// internal "did it actually change" tracking to duplicate here. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §19.
export function CheckoutAnnouncer({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className={styles.visuallyHidden}>
      {message}
    </p>
  );
}
