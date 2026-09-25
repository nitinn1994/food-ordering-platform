import { describe, expect, expectTypeOf, it } from "vitest";
import {
  addItemToCartSchema,
  AGENT_INTENT_TYPES,
  removeItemFromCartSchema,
  setCartItemQuantitySchema,
  type AgentIntent,
  type AgentIntentType,
} from "@contracts/agent-intents";
import {
  addCartItemRequestSchema,
  cartItemParamsSchema,
  updateCartItemRequestSchema,
  type AddCartItemRequest,
  type CartItemParams,
  type UpdateCartItemRequest,
} from "@contracts/api-contracts";

// requirements.md AC14: every adopted Phase 5 business intent maps onto the
// Cart API field-for-field, so whatever eventually executes an intent (no
// intent endpoint exists in Phase 8 — plan.md OD11) can do so by projection,
// never by translation. @contracts/agent-intents itself is not changed.
//
// The mapping from plan.md §24, written once, as data:
//   AddItemToCart        → POST   /v1/cart/items          body {itemId, quantity}
//   SetCartItemQuantity  → PATCH  /v1/cart/items/:itemId  params {itemId}, body {quantity}
//   RemoveItemFromCart   → DELETE /v1/cart/items/:itemId  params {itemId}
type IntentOf<T extends AgentIntentType> = Extract<AgentIntent, { type: T }>;

// Flattens an intersection into one object type, so expectTypeOf compares
// the fields rather than the (differently-shaped) A & B type itself.
type Flatten<T> = { [K in keyof T]: T[K] };

const PROJECTIONS: {
  [T in AgentIntentType]: (intent: IntentOf<T>) => {
    params?: unknown;
    body?: unknown;
  };
} = {
  AddItemToCart: ({ itemId, quantity }) => ({ body: { itemId, quantity } }),
  SetCartItemQuantity: ({ itemId, quantity }) => ({
    params: { itemId },
    body: { quantity },
  }),
  RemoveItemFromCart: ({ itemId }) => ({ params: { itemId } }),
};

describe("Cart API ↔ agent-intents compatibility (AC14)", () => {
  it("has a Cart API projection for every adopted intent type", () => {
    expect(Object.keys(PROJECTIONS).sort()).toEqual([...AGENT_INTENT_TYPES].sort());
  });

  it("AddItemToCart projects to a valid POST /v1/cart/items body", () => {
    const intent = addItemToCartSchema.parse({
      type: "AddItemToCart",
      itemId: "tiramisu",
      quantity: 2,
    });
    const { body } = PROJECTIONS.AddItemToCart(intent);
    expect(addCartItemRequestSchema.parse(body)).toEqual({
      itemId: "tiramisu",
      quantity: 2,
    });
  });

  it("SetCartItemQuantity projects to valid PATCH params and body", () => {
    const intent = setCartItemQuantitySchema.parse({
      type: "SetCartItemQuantity",
      itemId: "garlic-bread",
      quantity: 99,
    });
    const { params, body } = PROJECTIONS.SetCartItemQuantity(intent);
    expect(cartItemParamsSchema.parse(params)).toEqual({ itemId: "garlic-bread" });
    expect(updateCartItemRequestSchema.parse(body)).toEqual({ quantity: 99 });
  });

  it("RemoveItemFromCart projects to valid DELETE params", () => {
    const intent = removeItemFromCartSchema.parse({
      type: "RemoveItemFromCart",
      itemId: "tiramisu",
    });
    const { params } = PROJECTIONS.RemoveItemFromCart(intent);
    expect(cartItemParamsSchema.parse(params)).toEqual({ itemId: "tiramisu" });
  });

  // Stronger than sample values: the field validators are the *same schema
  // objects* from @contracts/common, so an intent and a Cart request can
  // never disagree on what a valid itemId or quantity is.
  it("shares the exact itemId and quantity validators with the intents", () => {
    expect(addCartItemRequestSchema.shape.itemId).toBe(addItemToCartSchema.shape.itemId);
    expect(addCartItemRequestSchema.shape.quantity).toBe(
      addItemToCartSchema.shape.quantity,
    );
    expect(updateCartItemRequestSchema.shape.quantity).toBe(
      setCartItemQuantitySchema.shape.quantity,
    );
    expect(cartItemParamsSchema.shape.itemId).toBe(
      setCartItemQuantitySchema.shape.itemId,
    );
    expect(cartItemParamsSchema.shape.itemId).toBe(
      removeItemFromCartSchema.shape.itemId,
    );
  });

  it("matches the intent payload types exactly, minus the discriminator", () => {
    expectTypeOf<AddCartItemRequest>().toEqualTypeOf<
      Omit<IntentOf<"AddItemToCart">, "type">
    >();
    expectTypeOf<Flatten<CartItemParams & UpdateCartItemRequest>>().toEqualTypeOf<
      Omit<IntentOf<"SetCartItemQuantity">, "type">
    >();
    expectTypeOf<CartItemParams>().toEqualTypeOf<
      Omit<IntentOf<"RemoveItemFromCart">, "type">
    >();
  });
});
