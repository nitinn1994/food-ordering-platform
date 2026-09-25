import { MAX_QUANTITY, type MenuItemId, type Quantity } from "@contracts/common";
import {
  CartItemNotFoundError,
  CartItemQuantityLimitExceededError,
} from "./cart.errors";
import { assertCartInvariants } from "./cart.invariants";
import type { Cart, CartLine, CartOwnerId } from "./cart.types";

// The Cart domain's business operations, as pure functions: a Cart in, a new
// Cart out (or a DomainError thrown). No I/O, no clock — `now` is passed in
// — and no knowledge of the menu: whether an item exists or is available is
// checked by CartService against the CartCatalog port before any of these
// run (docs/features/phase-8-cart-domain/plan.md §6, §22).
//
// Every successful operation bumps `version` by one and sets `updatedAt`;
// CartRepository.save uses the version to reject a stale write (plan.md
// §19, OD10).

// The cart an owner has before anything has been saved for them. Version 0
// = never persisted; it is never saved as-is (plan.md §14).
export function emptyCart(ownerId: CartOwnerId, now: Date): Cart {
  return { ownerId, lines: [], version: 0, createdAt: now, updatedAt: now };
}

function withLines(cart: Cart, lines: readonly CartLine[], now: Date): Cart {
  const next: Cart = {
    ...cart,
    lines,
    version: cart.version + 1,
    updatedAt: now,
  };
  assertCartInvariants(next);
  return next;
}

function hasLine(cart: Cart, itemId: MenuItemId): boolean {
  return cart.lines.some((line) => line.itemId === itemId);
}

// Adds `quantity` of an item. An item already in the cart merges into its
// existing line, in place — one line per item, first-add order (plan.md
// §13). A merge above MAX_QUANTITY is rejected, not clamped (OD6).
export function addLine(
  cart: Cart,
  itemId: MenuItemId,
  quantity: Quantity,
  now: Date,
): Cart {
  const existing = cart.lines.find((line) => line.itemId === itemId);
  if (!existing) {
    return withLines(cart, [...cart.lines, { itemId, quantity }], now);
  }

  const merged = existing.quantity + quantity;
  if (merged > MAX_QUANTITY) {
    throw new CartItemQuantityLimitExceededError();
  }
  return withLines(
    cart,
    cart.lines.map((line) =>
      line.itemId === itemId ? { itemId, quantity: merged } : line,
    ),
    now,
  );
}

// Sets an existing line's quantity absolutely — SetCartItemQuantity's
// semantics, so a retried set is harmless. The item must already be in the
// cart (OD7); quantity 0 never reaches here (quantitySchema rejects it at
// the edge — removal is removeLine's job, plan.md §12).
export function setLineQuantity(
  cart: Cart,
  itemId: MenuItemId,
  quantity: Quantity,
  now: Date,
): Cart {
  if (!hasLine(cart, itemId)) {
    throw new CartItemNotFoundError();
  }
  return withLines(
    cart,
    cart.lines.map((line) =>
      line.itemId === itemId ? { itemId, quantity } : line,
    ),
    now,
  );
}

// Removes an item's whole line, whatever its quantity (plan.md §11).
export function removeLine(cart: Cart, itemId: MenuItemId, now: Date): Cart {
  if (!hasLine(cart, itemId)) {
    throw new CartItemNotFoundError();
  }
  return withLines(
    cart,
    cart.lines.filter((line) => line.itemId !== itemId),
    now,
  );
}

// Empties the cart. Reached only through CartService.clearCart — there is
// no HTTP route and no intent for it: ADR-0011 and Phase 5 D7 make clearing
// the internal mechanism of a placed order, not a user-facing feature
// (plan.md OD5). The Order phase is its first real caller.
export function clearLines(cart: Cart, now: Date): Cart {
  return withLines(cart, [], now);
}
