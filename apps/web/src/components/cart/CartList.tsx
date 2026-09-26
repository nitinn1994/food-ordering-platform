"use client";

import Link from "next/link";
import { useCart } from "../../lib/state/cartStore";
import { CartErrorMessage } from "./CartErrorMessage";
import { CartLine } from "./CartLine";
import { CartTotal } from "./CartTotal";
import styles from "./CartList.module.css";

// Full cart management for the /cart route. The menu page's CartPanel is a
// read-only summary; this is where lines are actually edited. See
// docs/features/phase-3-frontend-cart-simulation/plan.md.
//
// Renders commerce-api's cart exactly as returned: its lines (already
// priced, already without items no longer on the menu) and its subtotal
// (docs/features/phase-11-web-commerce-integration/plan.md §4). An
// unavailable line blocks checkout here, up front, rather than at placement
// (AC8, OD11).
export function CartList() {
  const { cart, status, pending } = useCart();

  if (cart === null) {
    return (
      <>
        <CartErrorMessage />
        {status === "loading" ? <p role="status">Loading your cart…</p> : null}
      </>
    );
  }

  if (cart.items.length === 0) {
    return (
      <>
        <CartErrorMessage />
        <div className={styles.empty}>
          <p>Your cart is empty.</p>
          <Link href="/">Browse the menu</Link>
        </div>
      </>
    );
  }

  const hasUnavailable = cart.items.some((line) => !line.available);

  return (
    <div aria-busy={pending !== null}>
      <CartErrorMessage />
      <ul className={styles.lines}>
        {cart.items.map((line) => (
          <CartLine key={line.itemId} line={line} />
        ))}
      </ul>
      <CartTotal totalCents={cart.subtotalCents} />
      {hasUnavailable ? (
        <p className={styles.checkoutBlocked}>
          Some items in your cart are unavailable. Remove them to continue to
          checkout.
        </p>
      ) : (
        <Link href="/checkout" className={styles.checkoutLink}>
          Proceed to checkout
        </Link>
      )}
    </div>
  );
}
