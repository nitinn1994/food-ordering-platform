import { describe, expect, it } from "vitest";
import { cartReducer, computeCartTotalCents, initialCartState } from "./cartStore";

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
});

describe("computeCartTotalCents — AC2", () => {
  it("is zero for an empty cart", () => {
    expect(computeCartTotalCents([])).toBe(0);
  });

  it("sums known items by price and quantity", () => {
    // tiramisu is 750 cents in the fixture menu.
    const total = computeCartTotalCents([{ itemId: "tiramisu", quantity: 2 }]);
    expect(total).toBe(1500);
  });

  it("treats an unknown itemId as zero rather than throwing", () => {
    const lines = [{ itemId: "does-not-exist", quantity: 1 }];
    expect(() => computeCartTotalCents(lines)).not.toThrow();
    expect(computeCartTotalCents(lines)).toBe(0);
  });
});
