import { ApiError } from "./errors";

// The only place user-facing copy for a commerce-api failure is chosen —
// plan.md §11 (AC16). Chosen from `code` first, then `kind`, then a generic
// fallback. The backend's own ContractError.message is never used: it is
// written for developers and API callers, and ApiError does not even keep it.

// commerce-api's codes this app branches on (docs/api/commerce-api.md §6).
// Declared here rather than imported: they live in commerce-api's
// api-error-codes.ts, which apps/web must not import, and
// contractErrorCodeSchema deliberately matches codes by pattern rather than
// a closed enum (plan.md §15).
export const COMMERCE_ERROR_CODES = {
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MENU_ITEM_NOT_FOUND: "MENU_ITEM_NOT_FOUND",
  MENU_ITEM_UNAVAILABLE: "MENU_ITEM_UNAVAILABLE",
  CART_ITEM_NOT_FOUND: "CART_ITEM_NOT_FOUND",
  CART_ITEM_QUANTITY_LIMIT_EXCEEDED: "CART_ITEM_QUANTITY_LIMIT_EXCEEDED",
  CART_CONFLICT: "CART_CONFLICT",
  CART_EMPTY: "CART_EMPTY",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
} as const;

// "agent": a chat turn to ai-service (Phase 15). Its failures reuse the
// kind-based copy below; only a rejected message has copy of its own.
export type MessageContext = "cart" | "order" | "agent";

export const UNREACHABLE_MESSAGE =
  "We can't reach the restaurant right now. Check your connection and try again.";
export const SERVER_ERROR_MESSAGE =
  "Something went wrong on our side. Please try again.";
export const GENERIC_REJECTION_MESSAGE =
  "That couldn't be completed. Please try again.";

const CODE_MESSAGES: Record<MessageContext, Partial<Record<string, string>>> = {
  cart: {
    [COMMERCE_ERROR_CODES.INVALID_PAYLOAD]: "That change couldn't be made.",
    [COMMERCE_ERROR_CODES.MENU_ITEM_NOT_FOUND]:
      "That item is no longer on the menu.",
    [COMMERCE_ERROR_CODES.MENU_ITEM_UNAVAILABLE]:
      "Sorry, that item is currently unavailable.",
    [COMMERCE_ERROR_CODES.CART_ITEM_NOT_FOUND]:
      "That item is no longer in your cart.",
    [COMMERCE_ERROR_CODES.CART_ITEM_QUANTITY_LIMIT_EXCEEDED]:
      "You've reached the maximum quantity for this item.",
    [COMMERCE_ERROR_CODES.CART_CONFLICT]:
      "Your cart was updated. Please check it and try again.",
  },
  order: {
    [COMMERCE_ERROR_CODES.INVALID_PAYLOAD]:
      "Please check your details and try again.",
    [COMMERCE_ERROR_CODES.MENU_ITEM_UNAVAILABLE]:
      "An item in your cart is no longer available. Please review your cart.",
    [COMMERCE_ERROR_CODES.CART_CONFLICT]:
      "Your cart was updated. Please check it and try again.",
    [COMMERCE_ERROR_CODES.CART_EMPTY]: "Your cart is empty.",
    [COMMERCE_ERROR_CODES.IDEMPOTENCY_KEY_REUSED]:
      "Please review your details and place the order again.",
  },
  agent: {
    // ai-service rejected the message itself (docs/api/ai-service.md §3.1).
    [COMMERCE_ERROR_CODES.INVALID_PAYLOAD]:
      "I couldn't read that message. Please try rephrasing it.",
  },
};

const SERVER_ERROR_STATUS = 500;

export function userMessageFor(
  error: unknown,
  context: MessageContext,
): string {
  if (!(error instanceof ApiError)) {
    return SERVER_ERROR_MESSAGE;
  }
  if (error.kind === "network" || error.kind === "timeout") {
    return UNREACHABLE_MESSAGE;
  }
  if (error.kind === "invalid-response") {
    return SERVER_ERROR_MESSAGE;
  }
  if (error.status !== undefined && error.status >= SERVER_ERROR_STATUS) {
    return SERVER_ERROR_MESSAGE;
  }
  const byCode = error.code ? CODE_MESSAGES[context][error.code] : undefined;
  return byCode ?? GENERIC_REJECTION_MESSAGE;
}
