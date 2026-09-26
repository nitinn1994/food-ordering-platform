import { cartResponseSchema, type CartResponse } from "@contracts/api-contracts";
import { request, type RequestDeps } from "../api/client";

// commerce-api's Cart routes (docs/api/commerce-api.md §12). Every route
// returns the whole, server-priced cart, which the caller displays as-is —
// nothing here computes cart contents or prices (plan.md §4).
//
// Only getCart retries (plan.md §13). The three mutations never do: a
// retried POST double-counts (system-architecture.md §8 gap 3), and for
// PATCH/DELETE the caller re-reads the cart on failure instead of guessing.

function itemPath(itemId: string): string {
  return `/v1/cart/items/${encodeURIComponent(itemId)}`;
}

export function getCart(deps?: RequestDeps): Promise<CartResponse> {
  return request(
    { method: "GET", path: "/v1/cart", schema: cartResponseSchema, retry: true },
    deps,
  );
}

// A delta: merges into an existing line. Used only by "Add to cart"; the
// quantity stepper uses setCartItemQuantity (plan.md OD5).
export function addCartItem(
  itemId: string,
  quantity: number,
  deps?: RequestDeps,
): Promise<CartResponse> {
  return request(
    {
      method: "POST",
      path: "/v1/cart/items",
      body: { itemId, quantity },
      schema: cartResponseSchema,
    },
    deps,
  );
}

// An absolute set (1–99). 0 is not a removal — removeCartItem is.
export function setCartItemQuantity(
  itemId: string,
  quantity: number,
  deps?: RequestDeps,
): Promise<CartResponse> {
  return request(
    {
      method: "PATCH",
      path: itemPath(itemId),
      body: { quantity },
      schema: cartResponseSchema,
    },
    deps,
  );
}

export function removeCartItem(
  itemId: string,
  deps?: RequestDeps,
): Promise<CartResponse> {
  return request(
    { method: "DELETE", path: itemPath(itemId), schema: cartResponseSchema },
    deps,
  );
}
