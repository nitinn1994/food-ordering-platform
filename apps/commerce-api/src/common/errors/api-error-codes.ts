import { CONTRACT_ERROR_CODES } from "@contracts/common";

// Codes commerce-api itself introduces, beyond the ones @contracts/common
// already defines for the contract-parsing layer. INVALID_PAYLOAD and
// UNSUPPORTED_CONTRACT_VERSION are reused as-is from there, not redefined:
// contractErrorCodeSchema validates by pattern, not by z.enum, specifically
// so a service can introduce its own codes without a contract change
// (packages/contracts/common/src/errors.ts).
export const API_ERROR_CODES = {
  ...CONTRACT_ERROR_CODES,
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // The Menu domain's own code (modules/menu/domain/menu.errors.ts) — the
  // first domain-owned code this file carries, per the same "domain codes
  // arrive with the service that owns them" rule @contracts/common's
  // errors.ts states.
  MENU_ITEM_NOT_FOUND: "MENU_ITEM_NOT_FOUND",
  // The Cart domain's own codes (modules/cart/domain/cart.errors.ts). An
  // unknown item on add reuses MENU_ITEM_NOT_FOUND above rather than
  // minting a cart-specific twin (docs/features/phase-8-cart-domain/plan.md
  // §18, OD13) — a caller branches on one code for "no such item" wherever
  // it surfaces.
  MENU_ITEM_UNAVAILABLE: "MENU_ITEM_UNAVAILABLE",
  CART_ITEM_NOT_FOUND: "CART_ITEM_NOT_FOUND",
  CART_ITEM_QUANTITY_LIMIT_EXCEEDED: "CART_ITEM_QUANTITY_LIMIT_EXCEEDED",
  CART_CONFLICT: "CART_CONFLICT",
  // The Order domain's own codes (modules/order/domain/order.errors.ts). An
  // unavailable line at placement reuses MENU_ITEM_UNAVAILABLE, and a cart
  // changed mid-placement reuses CART_CONFLICT, rather than minting
  // order-specific twins (docs/features/phase-9-order-domain/plan.md §16,
  // OD9).
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  CART_EMPTY: "CART_EMPTY",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  // Fallback only, for a Nest HttpException status this filter has no
  // explicit mapping for. Nothing in this phase throws one — see
  // all-exceptions.filter.ts's STATUS_TO_CODE map, which is where the real
  // mapping belongs once a future phase introduces one.
  REQUEST_FAILED: "REQUEST_FAILED",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
