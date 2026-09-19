"use client";

import Link from "next/link";
import type { MenuCategory } from "../../lib/fixtures/menu";
import { findMenuItemIn } from "../../lib/menu/menuSource";
import { cartSubtotalCents } from "../../lib/cart/pricing";
import { useCart } from "../../lib/state/cartStore";
import { CartLine } from "./CartLine";
import { CartTotal } from "./CartTotal";
import styles from "./CartList.module.css";

// Full cart management for the /cart route. The menu page's CartPanel is a
// read-only summary; this is where lines are actually edited. See
// docs/features/phase-3-frontend-cart-simulation/plan.md.
export function CartList({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { lines } = useCart();

  if (lines.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Your cart is empty.</p>
        <Link href="/">Browse the menu</Link>
      </div>
    );
  }

  return (
    <>
      <ul className={styles.lines}>
        {lines.map((line) => {
          // See CartLine's comment — an unresolvable line is dropped here,
          // at the point where categories are in scope (Q12).
          const item = findMenuItemIn(categories, line.itemId);
          if (!item) {
            return null;
          }
          return <CartLine key={line.itemId} line={line} item={item} />;
        })}
      </ul>
      <CartTotal totalCents={cartSubtotalCents(lines, categories)} />
      <Link href="/checkout" className={styles.checkoutLink}>
        Proceed to checkout
      </Link>
    </>
  );
}
