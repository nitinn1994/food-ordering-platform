import type { MenuItemId, PriceCents, Quantity } from "@contracts/common";

// The Cart domain's own types — separate from @contracts/api-contracts's
// cart.ts wire shapes, for the same reason menu.types.ts is separate from
// menu.ts: storage, domain and HTTP can each change without forcing the
// others to (docs/features/phase-8-cart-domain/plan.md §3, §4).
//
// Every field is readonly. Domain operations (cart.operations.ts) never
// mutate a Cart; they return a new one.

// Opaque. Resolved server-side by a CartOwnerResolver, never read from a
// request (plan.md §5, OD3; requirements.md AC10). Nothing in this domain
// parses meaning out of it.
export type CartOwnerId = string;

// What is stored per line: the item and how many — nothing copied from the
// menu. Name, price and availability are read live when the cart is priced
// (plan.md §10, OD4).
export interface CartLine {
  readonly itemId: MenuItemId;
  readonly quantity: Quantity;
}

export interface Cart {
  // One cart per owner, so the owner is the key — there is no separate cart
  // id until something needs more than one cart per owner (plan.md §3).
  readonly ownerId: CartOwnerId;
  // First-add order; at most one line per itemId (cart.invariants.ts).
  readonly lines: readonly CartLine[];
  // Optimistic-concurrency counter (plan.md §16, §19, OD10). 0 means "never
  // saved"; every operation returns version + 1, and CartRepository.save
  // accepts it only if the stored version is exactly one behind.
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// The slice of a menu item the Cart domain needs, and nothing more — the
// shape of the CartCatalog port (cart-catalog.ts), so Cart never depends on
// the Menu domain's own MenuItem type (plan.md §9, OD14).
export interface CatalogItem {
  readonly id: MenuItemId;
  readonly name: string;
  readonly priceCents: PriceCents;
  readonly available: boolean;
}

// A line as priced on read — computed by priceCart (cart.pricing.ts), never
// stored.
export interface PricedCartLine {
  readonly itemId: MenuItemId;
  readonly name: string;
  readonly unitPriceCents: PriceCents;
  readonly quantity: Quantity;
  readonly lineSubtotalCents: PriceCents;
  readonly available: boolean;
}

export interface PricedCart {
  readonly lines: readonly PricedCartLine[];
  readonly itemCount: number;
  readonly subtotalCents: PriceCents;
}
