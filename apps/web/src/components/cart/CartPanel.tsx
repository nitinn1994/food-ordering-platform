"use client";

import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { CartLine } from "./CartLine";
import { CartTotal } from "./CartTotal";
import styles from "./CartPanel.module.css";

export function CartPanel() {
  const { lines } = useCart();
  const { cartPanelOpen } = useUi();

  return (
    <aside
      className={cartPanelOpen ? `${styles.panel} ${styles.opened}` : styles.panel}
      aria-label="Cart"
    >
      <h2>Cart</h2>
      {lines.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <ul className={styles.lines}>
          {lines.map((line) => (
            <CartLine key={line.itemId} line={line} />
          ))}
        </ul>
      )}
      <CartTotal />
    </aside>
  );
}
