import { describe, expect, it } from "vitest";
import { parseCommand } from "@contracts/ui-commands";
import { parseIntent } from "./parse";

// The boundary system-architecture.md §4.4 exists to enforce, tested in
// both directions (requirements.md AC3). ui-commands/src/commands.test.ts
// already covers the first direction (a business intent must fail
// parseCommand); this file is the second, symmetric half — a UI command
// must fail parseIntent. Together they make "intents and UI commands are
// two closed, non-overlapping vocabularies" a tested property, not an
// assertion in a comment.
describe("business intents are rejected as UI commands (existing direction, restated here)", () => {
  it("AddItemToCart is not a valid UI command", () => {
    const result = parseCommand({
      type: "AddItemToCart",
      itemId: "tiramisu",
      quantity: 1,
    });
    expect(result.accepted).toBe(false);
  });

  it("SetCartItemQuantity is not a valid UI command", () => {
    const result = parseCommand({
      type: "SetCartItemQuantity",
      itemId: "tiramisu",
      quantity: 2,
    });
    expect(result.accepted).toBe(false);
  });
});

describe("UI commands are rejected as business intents (the new direction)", () => {
  it("ShowMenuCategory is not a valid business intent", () => {
    // The exact §4.4 failure in reverse: a presentation command must never
    // be mistaken for a request to change commerce state.
    const result = parseIntent({
      type: "ShowMenuCategory",
      categoryId: "desserts",
    });
    expect(result.accepted).toBe(false);
  });

  it("HighlightItem is not a valid business intent", () => {
    const result = parseIntent({ type: "HighlightItem", itemId: "tiramisu" });
    expect(result.accepted).toBe(false);
  });

  it("OpenCartPanel is not a valid business intent", () => {
    const result = parseIntent({ type: "OpenCartPanel", open: true });
    expect(result.accepted).toBe(false);
  });

  it("SearchMenu is not a valid business intent", () => {
    const result = parseIntent({ type: "SearchMenu", query: "pasta" });
    expect(result.accepted).toBe(false);
  });
});
