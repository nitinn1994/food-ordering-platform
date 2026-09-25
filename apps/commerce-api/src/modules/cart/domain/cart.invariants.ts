import { MAX_QUANTITY } from "@contracts/common";
import type { Cart } from "./cart.types";

// Thrown when a Cart breaks a rule no well-behaved caller can trigger —
// request validation and the domain operations already prevent every one of
// these. A plain Error, not a DomainError, on purpose: reaching this is a
// bug, so it becomes a generic 500 and is logged, never a client-facing
// code (the same split menu.invariants.ts draws).
export class CartInvariantViolationError extends Error {
  constructor(message: string) {
    super(`Cart invariant violated: ${message}`);
    this.name = "CartInvariantViolationError";
  }
}

// At most one line per itemId; every quantity an integer in
// 1..MAX_QUANTITY; version a non-negative integer. Checked on every Cart an
// operation produces (cart.operations.ts), not once at boot — unlike Menu,
// this aggregate changes at runtime.
export function assertCartInvariants(cart: Cart): void {
  if (!Number.isInteger(cart.version) || cart.version < 0) {
    throw new CartInvariantViolationError("version must be a non-negative integer");
  }

  const seenItemIds = new Set<string>();
  for (const line of cart.lines) {
    if (seenItemIds.has(line.itemId)) {
      throw new CartInvariantViolationError(
        `duplicate line for item "${line.itemId}"`,
      );
    }
    seenItemIds.add(line.itemId);

    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      throw new CartInvariantViolationError(
        `item "${line.itemId}" has out-of-range quantity`,
      );
    }
  }
}
