import type { OrderResponse } from "@contracts/api-contracts";
import type { Order } from "./domain/order.types";

// Translates a domain order into @contracts/api-contracts's wire shape,
// field by field — the same role cart.mapper.ts plays for Cart. OrderService
// is the only caller. Nothing internal (owner, idempotency key, updatedAt)
// crosses this line (docs/features/phase-9-order-domain/plan.md §14).
// `placedAt` is ISO-8601, the wire format for time (Phase 5 D9).
export function toOrderResponse(order: Order): OrderResponse {
  return {
    orderId: order.id,
    status: order.status,
    placedAt: order.createdAt.toISOString(),
    customer:
      order.customer.email === undefined
        ? { fullName: order.customer.fullName, phone: order.customer.phone }
        : {
            fullName: order.customer.fullName,
            phone: order.customer.phone,
            email: order.customer.email,
          },
    items: order.lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      lineSubtotalCents: line.lineSubtotalCents,
    })),
    itemCount: order.itemCount,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
  };
}
