import type { MenuItemId } from "@contracts/common";
import type {
  CartLine,
  CatalogItem,
  PricedCart,
  PricedCartLine,
} from "./cart.types";

// The one place a cart is priced (docs/features/phase-8-cart-domain/plan.md
// §10, OD4: live menu price). Every line is priced from the catalog's
// *current* values on every read — nothing is snapshotted into the cart;
// price commitment belongs to the Order domain, at placement. When
// discounts or promotions arrive, this function is the seam that becomes
// (or delegates to) a pricing component; its callers do not change.
//
// Formulas are the ones apps/web/src/lib/cart/pricing.ts already uses
// (plan.md §15): line = unit × quantity, subtotal = Σ lines,
// itemCount = Σ quantities. Integer cents throughout. No tax, fee, or
// discount.
//
// Lines whose item is currently unavailable are kept, flagged
// `available: false`, and still counted — refusing to place such an order
// is the Order domain's decision. A line whose item is no longer on the
// menu at all has no price to show and is left out of the priced view; the
// stored line is untouched (plan.md OD8). Neither case is reachable in
// Phase 8 — the menu seed is static — but both have a defined result.
export function priceCart(
  lines: readonly CartLine[],
  catalog: ReadonlyMap<MenuItemId, CatalogItem>,
): PricedCart {
  const pricedLines: PricedCartLine[] = [];
  for (const line of lines) {
    const item = catalog.get(line.itemId);
    if (!item) {
      continue;
    }
    pricedLines.push({
      itemId: line.itemId,
      name: item.name,
      unitPriceCents: item.priceCents,
      quantity: line.quantity,
      lineSubtotalCents: item.priceCents * line.quantity,
      available: item.available,
    });
  }

  return {
    lines: pricedLines,
    itemCount: pricedLines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents: pricedLines.reduce(
      (total, line) => total + line.lineSubtotalCents,
      0,
    ),
  };
}
