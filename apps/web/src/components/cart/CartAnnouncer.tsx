"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "../../lib/state/cartStore";
import styles from "./CartAnnouncer.module.css";

// One polite live region for the whole app, mounted once in the layout —
// not per-component — so a single cart mutation produces exactly one
// announcement. Polite, not assertive: cart changes are user-initiated and
// don't need to interrupt whatever the user is doing.
export function CartAnnouncer() {
  const { itemCount } = useCart();
  const [message, setMessage] = useState("");
  const previousCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount === previousCount.current) {
      return;
    }
    previousCount.current = itemCount;
    setMessage(itemCount === 1 ? "1 item in cart." : `${itemCount} items in cart.`);
  }, [itemCount]);

  return (
    <p role="status" aria-live="polite" className={styles.visuallyHidden}>
      {message}
    </p>
  );
}
