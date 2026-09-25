import { MAX_QUANTITY } from "@contracts/common";
import type { Order } from "./order.types";

// Thrown when an Order breaks a rule no well-behaved caller can trigger —
// createOrder already guarantees every one of these. A plain Error, not a
// DomainError, on purpose: reaching this is a bug, so it becomes a generic
// 500 and is logged, never a client-facing code (the same split
// cart.invariants.ts draws). Messages name item ids at most, never customer
// details.
export class OrderInvariantViolationError extends Error {
  constructor(message: string) {
    super(`Order invariant violated: ${message}`);
    this.name = "OrderInvariantViolationError";
  }
}

function isCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

// At least one line; at most one line per itemId; every quantity an integer
// in 1..MAX_QUANTITY; every amount integer cents; each line subtotal is
// unit × quantity; the order's itemCount and subtotal are the sums of its
// lines; total equals subtotal (no fees — plan.md §7). Checked on every
// Order createOrder produces and again by the repository before storing.
export function assertOrderInvariants(order: Order): void {
  if (order.lines.length === 0) {
    throw new OrderInvariantViolationError("an order must have at least one line");
  }

  const seenItemIds = new Set<string>();
  let itemCount = 0;
  let subtotalCents = 0;
  for (const line of order.lines) {
    if (seenItemIds.has(line.itemId)) {
      throw new OrderInvariantViolationError(
        `duplicate line for item "${line.itemId}"`,
      );
    }
    seenItemIds.add(line.itemId);

    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      throw new OrderInvariantViolationError(
        `item "${line.itemId}" has out-of-range quantity`,
      );
    }
    if (!isCents(line.unitPriceCents) || !isCents(line.lineSubtotalCents)) {
      throw new OrderInvariantViolationError(
        `item "${line.itemId}" has a non-cents amount`,
      );
    }
    if (line.lineSubtotalCents !== line.unitPriceCents * line.quantity) {
      throw new OrderInvariantViolationError(
        `item "${line.itemId}" subtotal is not unit price × quantity`,
      );
    }

    itemCount += line.quantity;
    subtotalCents += line.lineSubtotalCents;
  }

  if (order.itemCount !== itemCount) {
    throw new OrderInvariantViolationError("itemCount is not the sum of quantities");
  }
  if (order.subtotalCents !== subtotalCents) {
    throw new OrderInvariantViolationError(
      "subtotalCents is not the sum of line subtotals",
    );
  }
  if (order.totalCents !== order.subtotalCents) {
    throw new OrderInvariantViolationError("totalCents must equal subtotalCents");
  }
}
