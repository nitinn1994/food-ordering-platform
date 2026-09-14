"use client";

import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";

export function CartTotal() {
  const { totalCents } = useCart();

  return (
    <p>
      <strong>Total: {formatCents(totalCents)}</strong>
    </p>
  );
}
