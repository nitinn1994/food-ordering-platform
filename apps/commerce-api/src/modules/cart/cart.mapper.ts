import type { CartResponse } from "@contracts/api-contracts";
import type { PricedCart } from "./domain/cart.types";

// Translates a priced domain cart into @contracts/api-contracts's wire
// shape, field by field — the one place that changes if the two diverge,
// the same role menu.mapper.ts plays for Menu. CartService is the only
// caller. Nothing internal (owner, version, timestamps) crosses this line
// (docs/features/phase-8-cart-domain/plan.md §3, §8).
export function toCartResponse(cart: PricedCart): CartResponse {
  return {
    items: cart.lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      lineSubtotalCents: line.lineSubtotalCents,
      available: line.available,
    })),
    itemCount: cart.itemCount,
    subtotalCents: cart.subtotalCents,
  };
}
