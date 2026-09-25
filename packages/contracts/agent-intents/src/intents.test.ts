import { describe, expect, it } from "vitest";
import {
  AGENT_INTENT_TYPES,
  addItemToCartSchema,
  removeItemFromCartSchema,
  setCartItemQuantitySchema,
} from "./intents";
import { parseIntent } from "./parse";

describe("parseIntent — accepts valid intents (AC2)", () => {
  it("accepts a valid AddItemToCart", () => {
    const result = parseIntent({
      type: "AddItemToCart",
      itemId: "tiramisu",
      quantity: 2,
    });
    expect(result.accepted).toBe(true);
  });

  it("accepts a valid RemoveItemFromCart", () => {
    const result = parseIntent({
      type: "RemoveItemFromCart",
      itemId: "tiramisu",
    });
    expect(result.accepted).toBe(true);
  });

  it("accepts a valid SetCartItemQuantity", () => {
    const result = parseIntent({
      type: "SetCartItemQuantity",
      itemId: "tiramisu",
      quantity: 5,
    });
    expect(result.accepted).toBe(true);
  });

  it("covers every declared intent type", () => {
    // Guards against AGENT_INTENT_TYPES drifting from the schema union —
    // the same drift guard ui-commands' UI_COMMAND_TYPES test already uses.
    expect(AGENT_INTENT_TYPES).toEqual([
      "AddItemToCart",
      "RemoveItemFromCart",
      "SetCartItemQuantity",
    ]);
  });
});

describe("parseIntent — rejects malformed payloads (AC2)", () => {
  it("rejects AddItemToCart with a missing quantity", () => {
    expect(
      parseIntent({ type: "AddItemToCart", itemId: "tiramisu" }).accepted,
    ).toBe(false);
  });

  it("rejects a quantity of zero", () => {
    // Zero is not "remove the line" — RemoveItemFromCart is the only path
    // to deleting one, the same rule cartReducer already holds.
    expect(
      parseIntent({
        type: "AddItemToCart",
        itemId: "tiramisu",
        quantity: 0,
      }).accepted,
    ).toBe(false);
  });

  it("rejects a quantity over the cap", () => {
    expect(
      parseIntent({
        type: "SetCartItemQuantity",
        itemId: "tiramisu",
        quantity: 100,
      }).accepted,
    ).toBe(false);
  });

  it("rejects a fractional quantity", () => {
    expect(
      parseIntent({
        type: "AddItemToCart",
        itemId: "tiramisu",
        quantity: 1.5,
      }).accepted,
    ).toBe(false);
  });

  it("rejects RemoveItemFromCart with a missing itemId", () => {
    expect(parseIntent({ type: "RemoveItemFromCart" }).accepted).toBe(false);
  });

  it("rejects an itemId that is not a valid slug", () => {
    expect(
      parseIntent({
        type: "AddItemToCart",
        itemId: "Path/Traversal",
        quantity: 1,
      }).accepted,
    ).toBe(false);
  });

  it("rejects an unrecognised type", () => {
    expect(
      parseIntent({ type: "DeleteAllOrders", itemId: "x" }).accepted,
    ).toBe(false);
  });

  it("never throws on arbitrary input", () => {
    for (const input of [null, undefined, 42, "string", [], {}]) {
      expect(() => parseIntent(input)).not.toThrow();
    }
  });

  it("does not partially apply — a rejected result carries no intent", () => {
    const result = parseIntent({ type: "RemoveItemFromCart", itemId: 123 });
    expect(result.accepted).toBe(false);
    expect("intent" in result).toBe(false);
  });
});

describe("every intent is a strict object (AC4)", () => {
  it("rejects AddItemToCart carrying an extra field", () => {
    const result = addItemToCartSchema.safeParse({
      type: "AddItemToCart",
      itemId: "tiramisu",
      quantity: 1,
      priceOverrideCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects RemoveItemFromCart carrying an extra field", () => {
    const result = removeItemFromCartSchema.safeParse({
      type: "RemoveItemFromCart",
      itemId: "tiramisu",
      force: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SetCartItemQuantity carrying an extra field", () => {
    const result = setCartItemQuantitySchema.safeParse({
      type: "SetCartItemQuantity",
      itemId: "tiramisu",
      quantity: 1,
      note: "as discussed",
    });
    expect(result.success).toBe(false);
  });
});
