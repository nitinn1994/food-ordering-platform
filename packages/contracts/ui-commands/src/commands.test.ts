import { describe, expect, it } from "vitest";
import { parseCommand } from "./parse";
import { UI_COMMAND_TYPES } from "./commands";

describe("parseCommand — accepts valid commands (AC3)", () => {
  it("accepts a valid ShowMenuCategory", () => {
    const result = parseCommand({
      type: "ShowMenuCategory",
      categoryId: "desserts",
    });
    expect(result.accepted).toBe(true);
  });

  it("accepts a valid HighlightItem", () => {
    const result = parseCommand({ type: "HighlightItem", itemId: "item-1" });
    expect(result.accepted).toBe(true);
  });

  it("accepts a valid OpenCartPanel", () => {
    const result = parseCommand({ type: "OpenCartPanel", open: true });
    expect(result.accepted).toBe(true);
  });

  it("covers every declared command type", () => {
    // Guards against UI_COMMAND_TYPES drifting from the schema union.
    expect(UI_COMMAND_TYPES).toEqual([
      "ShowMenuCategory",
      "HighlightItem",
      "OpenCartPanel",
    ]);
  });
});

describe("parseCommand — rejects unrecognised commands (AC4)", () => {
  it("rejects an unknown type", () => {
    const result = parseCommand({ type: "DeleteAllOrders", itemId: "x" });
    expect(result.accepted).toBe(false);
  });

  it("rejects a cart-mutating command masquerading as a UI command", () => {
    // The boundary this package exists to enforce: AddToCart must never
    // parse successfully here, because it would change what the user is
    // charged. See system-architecture.md §4.4.
    const result = parseCommand({
      type: "AddToCart",
      itemId: "item-1",
      quantity: 1,
    });
    expect(result.accepted).toBe(false);
  });

  it("never throws on arbitrary input", () => {
    for (const input of [null, undefined, 42, "string", [], {}]) {
      expect(() => parseCommand(input)).not.toThrow();
    }
  });
});

describe("parseCommand — rejects malformed payloads (AC5)", () => {
  it("rejects ShowMenuCategory with a missing categoryId", () => {
    const result = parseCommand({ type: "ShowMenuCategory" });
    expect(result.accepted).toBe(false);
  });

  it("rejects ShowMenuCategory with an empty categoryId", () => {
    const result = parseCommand({ type: "ShowMenuCategory", categoryId: "" });
    expect(result.accepted).toBe(false);
  });

  it("rejects OpenCartPanel with a non-boolean open field", () => {
    const result = parseCommand({ type: "OpenCartPanel", open: "yes" });
    expect(result.accepted).toBe(false);
  });

  it("does not partially apply — a rejected result carries no command", () => {
    const result = parseCommand({ type: "HighlightItem", itemId: 123 });
    expect(result.accepted).toBe(false);
    expect("command" in result).toBe(false);
  });
});
