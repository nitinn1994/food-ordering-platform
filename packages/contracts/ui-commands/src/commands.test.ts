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

  it("accepts a valid ShowItemDetail", () => {
    const result = parseCommand({ type: "ShowItemDetail", itemId: "tiramisu" });
    expect(result.accepted).toBe(true);
  });

  it("accepts a valid SearchMenu, including an empty query", () => {
    expect(parseCommand({ type: "SearchMenu", query: "pizza" }).accepted).toBe(
      true,
    );
    // Empty clears the search — a deliberately valid case, not an edge case.
    expect(parseCommand({ type: "SearchMenu", query: "" }).accepted).toBe(
      true,
    );
  });

  it("covers every declared command type", () => {
    // Guards against UI_COMMAND_TYPES drifting from the schema union.
    expect(UI_COMMAND_TYPES).toEqual([
      "ShowMenuCategory",
      "HighlightItem",
      "OpenCartPanel",
      "ShowItemDetail",
      "SearchMenu",
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

  it("rejects ShowItemDetail with a missing itemId", () => {
    const result = parseCommand({ type: "ShowItemDetail" });
    expect(result.accepted).toBe(false);
  });

  it("rejects ShowItemDetail with an empty itemId", () => {
    const result = parseCommand({ type: "ShowItemDetail", itemId: "" });
    expect(result.accepted).toBe(false);
  });

  it("rejects SearchMenu with a non-string query", () => {
    const result = parseCommand({ type: "SearchMenu", query: 42 });
    expect(result.accepted).toBe(false);
  });

  it("does not partially apply — a rejected result carries no command", () => {
    const result = parseCommand({ type: "HighlightItem", itemId: 123 });
    expect(result.accepted).toBe(false);
    expect("command" in result).toBe(false);
  });
});

describe("parseCommand — rejects unknown keys, not silently (AC4)", () => {
  // Phase 5: z.object silently strips an unknown key, but the generated
  // JSON Schema says additionalProperties: false — a Python consumer built
  // from that schema would reject a payload the old TypeScript accepted.
  // z.strictObject makes both languages agree. See requirements.md D8.
  it("rejects a ShowMenuCategory carrying an extra field", () => {
    const result = parseCommand({
      type: "ShowMenuCategory",
      categoryId: "desserts",
      onSelect: "javascript:alert(1)",
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects an OpenCartPanel carrying an extra field", () => {
    const result = parseCommand({
      type: "OpenCartPanel",
      open: true,
      redirectUrl: "https://evil.example",
    });
    expect(result.accepted).toBe(false);
  });
});

describe("SearchMenu.query is bounded (AC9)", () => {
  it("accepts a query at the maximum length", () => {
    const result = parseCommand({
      type: "SearchMenu",
      query: "a".repeat(200),
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects a query over the maximum length", () => {
    // An agent-controlled string with no bound is a value that can grow
    // without limit before it ever reaches React state (requirements.md §24).
    const result = parseCommand({
      type: "SearchMenu",
      query: "a".repeat(201),
    });
    expect(result.accepted).toBe(false);
  });
});
