import { describe, expect, it } from "vitest";
import { cartReducer, initialCartState, type CartState } from "./cartStore";
import { MAX_LINE_QUANTITY } from "../cart/pricing";

describe("cartReducer — AC2", () => {
  it("adds a new item with quantity 1", () => {
    const state = cartReducer(initialCartState, {
      type: "ADD_ITEM",
      itemId: "tiramisu",
    });
    expect(state.lines).toEqual([{ itemId: "tiramisu", quantity: 1 }]);
  });

  it("increments quantity when adding an item already in the cart", () => {
    let state = cartReducer(initialCartState, {
      type: "ADD_ITEM",
      itemId: "tiramisu",
    });
    state = cartReducer(state, { type: "ADD_ITEM", itemId: "tiramisu" });
    expect(state.lines).toEqual([{ itemId: "tiramisu", quantity: 2 }]);
  });

  it("removes a line entirely", () => {
    let state = cartReducer(initialCartState, {
      type: "ADD_ITEM",
      itemId: "tiramisu",
    });
    state = cartReducer(state, { type: "REMOVE_ITEM", itemId: "tiramisu" });
    expect(state.lines).toEqual([]);
  });

  it("removing an item not in the cart is a no-op", () => {
    const state = cartReducer(initialCartState, {
      type: "REMOVE_ITEM",
      itemId: "not-in-cart",
    });
    expect(state).toEqual(initialCartState);
  });

  it("is a no-op once a line has reached the quantity cap", () => {
    const atCap: CartState = {
      lines: [{ itemId: "tiramisu", quantity: MAX_LINE_QUANTITY }],
    };
    const state = cartReducer(atCap, { type: "ADD_ITEM", itemId: "tiramisu" });
    expect(state.lines).toEqual([
      { itemId: "tiramisu", quantity: MAX_LINE_QUANTITY },
    ]);
  });
});

describe("cartReducer — DECREMENT_ITEM", () => {
  it("decreases quantity by exactly 1", () => {
    const twoInCart: CartState = {
      lines: [{ itemId: "tiramisu", quantity: 2 }],
    };
    const state = cartReducer(twoInCart, {
      type: "DECREMENT_ITEM",
      itemId: "tiramisu",
    });
    expect(state.lines).toEqual([{ itemId: "tiramisu", quantity: 1 }]);
  });

  it("never decreases a line below quantity 1", () => {
    const oneInCart: CartState = {
      lines: [{ itemId: "tiramisu", quantity: 1 }],
    };
    const state = cartReducer(oneInCart, {
      type: "DECREMENT_ITEM",
      itemId: "tiramisu",
    });
    expect(state.lines).toEqual([{ itemId: "tiramisu", quantity: 1 }]);
  });

  it("is a no-op for an item that is not in the cart", () => {
    const state = cartReducer(initialCartState, {
      type: "DECREMENT_ITEM",
      itemId: "tiramisu",
    });
    expect(state.lines).toEqual([]);
  });
});

// Total-pricing coverage (empty cart, known items, unknown itemId, empty
// categories) now lives in ../cart/pricing.test.ts against
// cartSubtotalCents, which replaces the cart-store-local
// computeCartTotalCents now that CartProvider no longer takes a categories
// prop — see docs/features/phase-3-frontend-cart-simulation/plan.md.
