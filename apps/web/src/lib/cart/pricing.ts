import type { MenuCategory, MenuItem } from "../fixtures/menu";
import { findMenuItemIn } from "../menu/menuSource";
import { sumCents } from "../money";
import type { CartLine } from "../state/cartStore";

// Pricing derived from cart lines and already-resolved menu data, kept as
// pure functions separate from cart state — see
// docs/features/phase-3-frontend-cart-simulation/plan.md. This is still the
// one place the frontend prices anything at all, which remains temporary
// (docs/product/food-ordering-frontend-mvp.md §7, item 3) until
// commerce-api owns pricing.

export const MAX_LINE_QUANTITY = 99;

export function lineSubtotalCents(item: MenuItem, quantity: number): number {
  return item.priceCents * quantity;
}

export function cartSubtotalCents(
  lines: readonly CartLine[],
  categories: readonly MenuCategory[],
): number {
  const lineCents = lines.map((line) => {
    const item = findMenuItemIn(categories, line.itemId);
    return item ? lineSubtotalCents(item, line.quantity) : 0;
  });
  return sumCents(lineCents);
}

export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
