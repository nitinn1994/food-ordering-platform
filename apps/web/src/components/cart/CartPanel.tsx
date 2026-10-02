"use client";

import Link from "next/link";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { CartErrorMessage } from "./CartErrorMessage";
import { CartTotal } from "./CartTotal";
import { EmptyBagIllustration } from "../brand/illustrations";
import styles from "./CartPanel.module.css";

// Read-only summary for the menu page — count, subtotal, and a link to
// /cart, which is where lines are actually edited (CartList). See
// docs/features/phase-3-frontend-cart-simulation/plan.md.
//
// Both figures are commerce-api's own (itemCount, subtotalCents), shown
// as-is — nothing here prices anything
// (docs/features/phase-11-web-commerce-integration/plan.md §4). Also where a
// failed "Add to cart" on the menu page surfaces, via CartErrorMessage.
//
// Styled as the reference design's sticky "Your Cart" column on wide
// screens and as a bottom bar on narrow ones (docs/features/
// mcdelivery-redesign/requirements.md AC-U2) — the markup is the same.
export function CartPanel() {
  const { cart, status } = useCart();
  const { cartPanelOpen } = useUi();
  const panelClassName = cartPanelOpen
    ? `${styles.panel} ${styles.opened}`
    : styles.panel;

  let body;
  if (cart === null) {
    body =
      status === "loading" ? <p role="status">Loading your cart…</p> : null;
  } else if (cart.items.length === 0) {
    body = (
      <div className={styles.empty}>
        <span className={styles.illustration}>
          <EmptyBagIllustration />
        </span>
        <p>Your cart is empty.</p>
      </div>
    );
  } else {
    body = (
      <>
        <CartTotal totalCents={cart.subtotalCents} />
        <Link href="/cart" className={styles.viewCart}>
          View cart →
        </Link>
      </>
    );
  }

  return (
    <aside className={panelClassName} aria-label="Cart">
      <h2>{cart && cart.items.length > 0 ? `Cart (${cart.itemCount})` : "Cart"}</h2>
      <CartErrorMessage />
      {body}
    </aside>
  );
}
