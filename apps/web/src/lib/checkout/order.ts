import type { MenuCategory } from "../fixtures/menu";
import { findMenuItemIn } from "../menu/menuSource";
import { cartSubtotalCents, lineSubtotalCents } from "../cart/pricing";
import type { CartLine } from "../state/cartStore";
import type {
  CustomerDetails,
  SimulatedOrder,
  SimulatedOrderLine,
} from "./types";

// TEMPORARY — builds a locally simulated order snapshot. There is no real
// order here: commerce-api owns order creation, identity, and persistence
// once it exists (system-architecture.md §4.4, §5), and this module is
// deleted wholesale when that lands. See ADR-0011 and
// docs/product/food-ordering-frontend-mvp.md §7, item 4. Nothing produced
// by this module is sent anywhere, stored, or logged.
//
// Reuses lib/cart/pricing.ts exclusively for money — no new pricing
// concept is introduced here. totalCents is set equal to subtotalCents on
// its own line, deliberately, rather than left implicit, so the point
// where a real total (tax, fees, tips) will diverge from this simulation
// is visible (D5).

// Resolves cart lines against already-fetched menu data into the shape
// OrderSummary renders — shared by CheckoutReview (from the *live* cart,
// before an order exists) and buildSimulatedOrder below (frozen into a
// snapshot at submit time), so the "find the item, drop what doesn't
// resolve" rule CartList/CartLine already apply lives in exactly one
// place rather than being re-implemented per caller.
export function resolveOrderLines(
  lines: readonly CartLine[],
  categories: readonly MenuCategory[],
): SimulatedOrderLine[] {
  const orderLines: SimulatedOrderLine[] = [];
  for (const line of lines) {
    const item = findMenuItemIn(categories, line.itemId);
    if (!item) {
      continue;
    }
    orderLines.push({
      itemId: item.id,
      name: item.name,
      unitPriceCents: item.priceCents,
      quantity: line.quantity,
      lineSubtotalCents: lineSubtotalCents(item, line.quantity),
    });
  }
  return orderLines;
}

export function buildSimulatedOrder(
  lines: readonly CartLine[],
  categories: readonly MenuCategory[],
  customer: CustomerDetails,
  orderId: string,
  placedAt: number,
): SimulatedOrder {
  const orderLines = resolveOrderLines(lines, categories);
  const subtotalCents = cartSubtotalCents(lines, categories);
  const totalCents = subtotalCents; // No tax/fee/tip/discount in Phase 4 (D5).

  return {
    orderId,
    placedAt,
    customer: {
      fullName: customer.fullName.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
    },
    lines: orderLines,
    subtotalCents,
    totalCents,
  };
}
