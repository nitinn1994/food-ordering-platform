import {
  createOrderRequestSchema,
  orderResponseSchema,
  type CreateOrderRequest,
  type OrderResponse,
} from "@contracts/api-contracts";
import { ORDER_TIMEOUT_MS, request, type RequestDeps } from "../api/client";
import { ApiError } from "../api/errors";
import { COMMERCE_ERROR_CODES } from "../api/userMessages";
import type { CustomerDetails } from "./types";

// commerce-api's order creation (docs/api/commerce-api.md §13). The request
// carries only the idempotency key and customer details: items, prices and
// totals are the server's, built from the server-side cart (plan.md §5).

const HTTP_BAD_REQUEST = 400;

// The API requires trimmed values and an *omitted* (never "") email; the
// form keeps raw input, so the conversion happens here, once.
export function toCreateOrderRequest(
  details: CustomerDetails,
  idempotencyKey: string,
): CreateOrderRequest {
  const email = details.email.trim();
  return {
    idempotencyKey,
    customer: {
      fullName: details.fullName.trim(),
      phone: details.phone.trim(),
      ...(email ? { email } : {}),
    },
  };
}

// Retried on a transient failure with the *same* body, and so the same key:
// a replay returns the original order rather than a second one
// (plan.md §13). Checked against the contract before sending, so a
// request-building bug surfaces as the same INVALID_PAYLOAD shape the server
// would have returned, without a round trip.
export function placeOrder(
  body: CreateOrderRequest,
  deps?: RequestDeps,
): Promise<OrderResponse> {
  const checked = createOrderRequestSchema.safeParse(body);
  if (!checked.success) {
    const path = checked.error.issues[0]?.path.map(String).join(".");
    return Promise.reject(
      new ApiError({
        kind: "http",
        status: HTTP_BAD_REQUEST,
        code: COMMERCE_ERROR_CODES.INVALID_PAYLOAD,
        ...(path ? { field: path } : {}),
      }),
    );
  }
  return request(
    {
      method: "POST",
      path: "/v1/orders",
      body: checked.data,
      schema: orderResponseSchema,
      timeoutMs: ORDER_TIMEOUT_MS,
      retry: true,
    },
    deps,
  );
}

const CUSTOMER_FIELD_MESSAGES: Record<keyof CustomerDetails, string> = {
  fullName: "Check your name.",
  phone: "Enter a valid phone number.",
  email: "Enter a valid email address, or leave it blank.",
};

// A 400 naming a customer.* field sends the user back to that field on the
// details step (plan.md §11, AC13). Anything else is not a field error.
export function customerFieldErrorFor(
  error: unknown,
): { field: keyof CustomerDetails; message: string } | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== COMMERCE_ERROR_CODES.INVALID_PAYLOAD ||
    !error.field?.startsWith("customer.")
  ) {
    return null;
  }
  const field = error.field.slice("customer.".length);
  if (field === "fullName" || field === "phone" || field === "email") {
    return { field, message: CUSTOMER_FIELD_MESSAGES[field] };
  }
  return null;
}
