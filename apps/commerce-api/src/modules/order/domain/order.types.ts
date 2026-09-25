import type {
  IdempotencyKey,
  MenuItemId,
  PriceCents,
  Quantity,
} from "@contracts/common";

// The Order domain's own types — separate from @contracts/api-contracts's
// order.ts wire shapes, for the same reason cart.types.ts and menu.types.ts
// are separate from theirs: storage, domain and HTTP can each change
// without forcing the others to (docs/features/phase-9-order-domain/plan.md
// §2, §3). Nothing here imports from the Cart module: what Order needs from
// a cart is stated below, from Order's side (CheckoutSnapshot).
//
// Every field is readonly. An order is an immutable snapshot — nothing in
// Phase 9 changes one after it is created.

// Server-generated (OrderIdGenerator) and opaque.
export type OrderId = string;

// Resolved server-side by an OrderOwnerResolver, never read from a request
// — the same single owner Cart resolves (plan.md §22).
export type OrderOwnerId = string;

// One status only (plan.md §4, OD3): accepted by commerce-api, no payment
// taken.
export type OrderStatus = "placed";

// Personal data (plan.md §8, §25) — never logged, never put in an error.
// `email` is absent when not given, never "".
export interface CustomerDetails {
  readonly fullName: string;
  readonly phone: string;
  readonly email?: string;
}

// A line as it was at placement. Name, unit price and quantity are copied
// from the priced cart and never change afterwards, whatever later happens
// to the menu (plan.md §3, §6).
export interface OrderLine {
  readonly itemId: MenuItemId;
  readonly name: string;
  readonly unitPriceCents: PriceCents;
  readonly quantity: Quantity;
  readonly lineSubtotalCents: PriceCents;
}

export interface Order {
  readonly id: OrderId;
  readonly ownerId: OrderOwnerId;
  // Scoped per owner; a retry with the same key and customer returns this
  // order instead of creating another (plan.md §11, §12, OD7).
  readonly idempotencyKey: IdempotencyKey;
  // At least one, in the cart's line order.
  readonly lines: readonly OrderLine[];
  readonly itemCount: number;
  readonly subtotalCents: PriceCents;
  // Equal to subtotalCents — no tax, fee, tip or discount (Phase 4 D5) —
  // but its own field, because it is what a future payment charges
  // (plan.md §7, OD5).
  readonly totalCents: PriceCents;
  readonly status: OrderStatus;
  readonly customer: CustomerDetails;
  readonly createdAt: Date;
  // Equal to createdAt: nothing changes an order yet. No `version` either
  // until something does (plan.md §2).
  readonly updatedAt: Date;
}

// One priced cart line, as the CheckoutCart port supplies it — the slice of
// Cart's priced view that Order needs, and nothing more (plan.md §22, OD1).
export interface CheckoutLine {
  readonly itemId: MenuItemId;
  readonly name: string;
  readonly unitPriceCents: PriceCents;
  readonly quantity: Quantity;
  readonly lineSubtotalCents: PriceCents;
  readonly available: boolean;
}

// The owner's cart at the moment an order is being placed. `version` is
// what CheckoutCart.consume must still find for the cart to be consumed
// (plan.md §5). `unpricedLineCount` counts stored cart lines that have no
// priced counterpart in `lines` because their item is no longer on the menu —
// Cart's priced view drops those silently, and an order must not (plan.md
// §10).
export interface CheckoutSnapshot {
  readonly ownerId: OrderOwnerId;
  readonly version: number;
  readonly lines: readonly CheckoutLine[];
  readonly unpricedLineCount: number;
}
