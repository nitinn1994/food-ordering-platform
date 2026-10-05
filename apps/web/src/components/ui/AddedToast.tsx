"use client";

import { useEffect, useState } from "react";
import { useCart } from "../../lib/state/cartStore";
import { useConfirmedAdd } from "../../lib/cart/useConfirmedAdd";
import styles from "./AddedToast.module.css";

// The reference's light "Item added to cart" toast (docs/features/
// mcdelivery-parity/reference-inventory.md, M-toast; AC7). It appears only
// once commerce-api has confirmed the add (useConfirmedAdd), names the line
// as the backend has it, and fades after a few seconds. Visual only:
// CartAnnouncer is the app's one live region for cart changes, so a screen
// reader hears each add once, not twice. It holds no controls, so its
// timeout takes nothing away (WCAG 2.2.1).
export const ADDED_TOAST_MS = 3000;

export function AddedToast() {
  const added = useConfirmedAdd();
  const { cart } = useCart();
  const [visible, setVisible] = useState<{ name: string; sequence: number } | null>(null);

  useEffect(() => {
    if (added === null) return;
    const name = cart?.items.find((line) => line.itemId === added.itemId)?.name;
    if (name === undefined) return;
    setVisible({ name, sequence: added.sequence });
    const timer = window.setTimeout(() => setVisible(null), ADDED_TOAST_MS);
    return () => window.clearTimeout(timer);
    // Only a new confirmed add shows the toast; later cart changes do not.
  }, [added]);

  return (
    <div className={styles.region} aria-hidden="true">
      {visible !== null && (
        <p key={visible.sequence} className={styles.toast}>
          <span className={styles.tick}>✓</span>
          {visible.name} added to cart
        </p>
      )}
    </div>
  );
}
