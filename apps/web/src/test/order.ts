import type { OrderResponse } from "@contracts/api-contracts";

// Test-only commerce-api OrderResponse. Values are arbitrary but valid
// against orderResponseSchema, so the API client accepts it from a stub.
export const ORDER_ID = "9d3a5a7b-3458-41c1-8585-871e24db8cfd";

export function orderResponse(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    orderId: ORDER_ID,
    status: "placed",
    placedAt: "2026-09-25T14:06:15.712Z",
    customer: { fullName: "Ada Lovelace", phone: "5551234567" },
    items: [
      {
        itemId: "tiramisu",
        name: "Tiramisu",
        unitPriceCents: 750,
        quantity: 1,
        lineSubtotalCents: 750,
      },
    ],
    itemCount: 1,
    subtotalCents: 750,
    totalCents: 750,
    ...overrides,
  };
}
