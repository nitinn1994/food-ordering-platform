"use client";

import Link from "next/link";
import type { MenuCategory } from "../../lib/fixtures/menu";
import { cartItemCount, cartSubtotalCents } from "../../lib/cart/pricing";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { CartTotal } from "./CartTotal";
import styles from "./CartPanel.module.css";

// Read-only summary for the menu page — count, subtotal, and a link to
// /cart, which is where lines are actually edited (CartList). Keeps the
// menu page uncluttered and gives /cart a reason to exist. See
// docs/features/phase-3-frontend-cart-simulation/plan.md.
export function CartPanel({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { lines } = useCart();
  const { cartPanelOpen } = useUi();
  const panelClassName = cartPanelOpen
    ? `${styles.panel} ${styles.opened}`
    : styles.panel;

  if (lines.length === 0) {
    return (
      <aside className={panelClassName} aria-label="Cart">
        <h2>Cart</h2>
        <p>Your cart is empty.</p>
      </aside>
    );
  }

  return (
    <aside className={panelClassName} aria-label="Cart">
      <h2>Cart ({cartItemCount(lines)})</h2>
      <CartTotal totalCents={cartSubtotalCents(lines, categories)} />
      <Link href="/cart">View cart →</Link>
    </aside>
  );
}
