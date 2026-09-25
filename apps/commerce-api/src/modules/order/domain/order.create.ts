import type { IdempotencyKey } from "@contracts/common";
import { CartEmptyError, OrderItemUnavailableError } from "./order.errors";
import { assertOrderInvariants } from "./order.invariants";
import type {
  CheckoutSnapshot,
  CustomerDetails,
  Order,
  OrderId,
  OrderLine,
} from "./order.types";

// The Order domain's business operations, as pure functions. No I/O, no
// clock — `now` and the id are passed in — and no pricing: the snapshot
// arrives already priced by Cart's priceCart through the CheckoutCart port,
// so the order total is exactly what the cart showed at that instant
// (docs/features/phase-9-order-domain/plan.md §6, §21, OD1).

export interface CreateOrderInput {
  readonly id: OrderId;
  readonly idempotencyKey: IdempotencyKey;
  readonly checkout: CheckoutSnapshot;
  readonly customer: CustomerDetails;
  readonly now: Date;
}

// Copies only the known fields, so nothing else a caller's object carries
// can reach a stored order, and an absent email stays absent rather than
// becoming an `email: undefined` key.
function copyCustomer(customer: CustomerDetails): CustomerDetails {
  return customer.email === undefined
    ? { fullName: customer.fullName, phone: customer.phone }
    : {
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
      };
}

// Builds a new order from the priced cart (plan.md §5 step 4, §10):
//
//   - no stored cart lines at all → CartEmptyError (422 CART_EMPTY);
//   - any line whose item is unavailable, or no longer on the menu (a stored
//     line priceCart dropped — `unpricedLineCount`) → OrderItemUnavailableError
//     (422 MENU_ITEM_UNAVAILABLE). Never silently left out of the order.
//
// Otherwise every line's name, unit price, quantity and subtotal are
// snapshotted as they are now, and the totals fixed: itemCount = Σ quantity,
// subtotal = Σ line subtotals, total = subtotal (no fees — plan.md §7).
export function createOrder(input: CreateOrderInput): Order {
  const { checkout } = input;

  if (checkout.lines.length === 0 && checkout.unpricedLineCount === 0) {
    throw new CartEmptyError();
  }
  if (
    checkout.unpricedLineCount > 0 ||
    checkout.lines.some((line) => !line.available)
  ) {
    throw new OrderItemUnavailableError();
  }

  const lines: OrderLine[] = checkout.lines.map((line) => ({
    itemId: line.itemId,
    name: line.name,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    lineSubtotalCents: line.lineSubtotalCents,
  }));
  const subtotalCents = lines.reduce(
    (total, line) => total + line.lineSubtotalCents,
    0,
  );
  const totalCents = subtotalCents; // No tax/fee/tip/discount (Phase 4 D5).

  const order: Order = {
    id: input.id,
    ownerId: checkout.ownerId,
    idempotencyKey: input.idempotencyKey,
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    totalCents,
    status: "placed",
    customer: copyCustomer(input.customer),
    createdAt: input.now,
    updatedAt: input.now,
  };
  assertOrderInvariants(order);
  return order;
}

// Whether a retried create request is the same request as the one that
// produced `order` — the idempotency fingerprint (plan.md §11, OD7). Only
// the customer details are compared: the idempotency key already matched to
// find the order, and the cart is server state that a replay legitimately
// finds empty. An email that is absent on one side and present on the other
// is a difference.
export function isSameOrderRequest(
  order: Order,
  customer: CustomerDetails,
): boolean {
  return (
    order.customer.fullName === customer.fullName &&
    order.customer.phone === customer.phone &&
    order.customer.email === customer.email
  );
}
