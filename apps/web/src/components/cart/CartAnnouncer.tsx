"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "../../lib/state/cartStore";
import styles from "./CartAnnouncer.module.css";

// One polite live region for the whole app, mounted once in the layout —
// not per-component — so a single cart mutation produces exactly one
// announcement. Polite, not assertive: cart changes are user-initiated and
// don't need to interrupt whatever the user is doing.
//
// The count is commerce-api's. Its arrival on first load (nothing → n) is
// not a change the user made, so it is recorded silently; only changes after
// that are announced (docs/features/phase-11-web-commerce-integration/
// plan.md §4).
export function CartAnnouncer() {
  const { itemCount, status } = useCart();
  const [message, setMessage] = useState("");
  const previousCount = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    if (previousCount.current === null) {
      previousCount.current = itemCount;
      return;
    }
    if (itemCount === previousCount.current) {
      return;
    }
    previousCount.current = itemCount;
    setMessage(itemCount === 1 ? "1 item in cart." : `${itemCount} items in cart.`);
  }, [itemCount, status]);

  return (
    <p role="status" aria-live="polite" className={styles.visuallyHidden}>
      {message}
    </p>
  );
}
