"use client";

import { useEffect, useRef, useState } from "react";
import { useCart, type PendingCartOp } from "../state/cartStore";

export type ConfirmedAdd = { itemId: string; sequence: number };

// Calls `onSettled` once each time an "Add to cart" finishes, with whether
// it succeeded: the add is over and the item is in commerce-api's
// confirmed cart. Never for an add still in flight.
export function useAddSettled(onSettled: (itemId: string, confirmed: boolean) => void): void {
  const { cart, pending } = useCart();
  const previousPending = useRef<PendingCartOp | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    const was = previousPending.current;
    previousPending.current = pending;
    if (was?.op === "add" && pending === null) {
      onSettledRef.current(
        was.itemId,
        cart?.items.some((line) => line.itemId === was.itemId) ?? false,
      );
    }
  }, [pending, cart]);
}

// The customer's own "Add to cart" has succeeded: the add finished and the
// item is in commerce-api's confirmed cart. Moved out of NudgeToast
// (mcdelivery-redesign Phase 4) so the "Item added to cart" toast
// (mcdelivery-parity Phase 3, AC7) reacts to exactly the same moment — never
// to an add that is still in flight or failed. `sequence` rises with each
// success, so adding the same item twice is two events.
export function useConfirmedAdd(): ConfirmedAdd | null {
  const [added, setAdded] = useState<ConfirmedAdd | null>(null);

  useAddSettled((itemId, confirmed) => {
    if (confirmed) {
      setAdded((previous) => ({ itemId, sequence: (previous?.sequence ?? 0) + 1 }));
    }
  });

  return added;
}
