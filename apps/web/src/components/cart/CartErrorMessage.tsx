"use client";

import { useCart } from "../../lib/state/cartStore";
import styles from "./CartErrorMessage.module.css";

// The one place a cart failure is shown — rendered by CartPanel (menu page)
// and CartList (/cart), never both on one page. Copy comes from
// useCart().errorMessage, which is chosen by error code/kind only
// (docs/features/phase-11-web-commerce-integration/plan.md §11).
//
// If the cart never loaded, the recovery is "Try again" (a re-read);
// otherwise the cart on screen is still the last backend-confirmed one, and
// the message only needs dismissing.
export function CartErrorMessage() {
  const { errorMessage, status, refresh, dismissError } = useCart();

  if (!errorMessage) {
    return null;
  }

  return (
    <div role="alert" className={styles.alert}>
      <p>{errorMessage}</p>
      {status === "error" ? (
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      ) : (
        <button type="button" onClick={dismissError}>
          Dismiss
        </button>
      )}
    </div>
  );
}
