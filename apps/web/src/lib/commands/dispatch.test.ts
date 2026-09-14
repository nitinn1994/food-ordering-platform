// @vitest-environment node
// This file does a plain filesystem read of its own source (AC8) — it has
// no DOM dependency, and jsdom (the project default as of sub-phase 2.1)
// does not provide a real file:// import.meta.url, which that check needs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commandToUiAction, dispatchCommand } from "./dispatch";

describe("dispatchCommand — AC3 (accepts a valid command)", () => {
  it("maps a valid ShowMenuCategory to a SELECT_CATEGORY ui action", () => {
    const result = dispatchCommand({
      type: "ShowMenuCategory",
      categoryId: "desserts",
    });
    expect(result.entry.status).toBe("accepted");
    expect(result.uiAction).toEqual({
      type: "SELECT_CATEGORY",
      categoryId: "desserts",
    });
  });

  it("maps HighlightItem and OpenCartPanel to their ui actions", () => {
    expect(
      commandToUiAction({ type: "HighlightItem", itemId: "tiramisu" }),
    ).toEqual({ type: "HIGHLIGHT_ITEM", itemId: "tiramisu" });
    expect(commandToUiAction({ type: "OpenCartPanel", open: true })).toEqual({
      type: "SET_CART_PANEL_OPEN",
      open: true,
    });
  });

  it("maps ShowItemDetail to a SHOW_ITEM_DETAIL ui action", () => {
    const result = dispatchCommand({
      type: "ShowItemDetail",
      itemId: "tiramisu",
    });
    expect(result.entry.status).toBe("accepted");
    expect(result.uiAction).toEqual({
      type: "SHOW_ITEM_DETAIL",
      itemId: "tiramisu",
    });
  });

  it("maps SearchMenu to a SET_SEARCH_QUERY ui action", () => {
    const result = dispatchCommand({ type: "SearchMenu", query: "pizza" });
    expect(result.entry.status).toBe("accepted");
    expect(result.uiAction).toEqual({
      type: "SET_SEARCH_QUERY",
      query: "pizza",
    });
  });
});

describe("dispatchCommand — AC4 (rejects unrecognised commands, no UI state change)", () => {
  it("rejects an unknown type and produces no ui action", () => {
    const result = dispatchCommand({ type: "DeleteAllOrders", itemId: "x" });
    expect(result.entry.status).toBe("rejected");
    expect(result.uiAction).toBeNull();
  });

  it("rejects AddToCart specifically — the boundary this pipeline exists to enforce", () => {
    const result = dispatchCommand({
      type: "AddToCart",
      itemId: "item-1",
      quantity: 1,
    });
    expect(result.entry.status).toBe("rejected");
    expect(result.uiAction).toBeNull();
  });

  it("never throws on arbitrary input", () => {
    for (const raw of [null, undefined, 42, "text", [], {}]) {
      expect(() => dispatchCommand(raw)).not.toThrow();
    }
  });
});

describe("dispatchCommand — AC5 (rejects malformed payloads, not partially applied)", () => {
  it("rejects a recognised type with a missing field, applying nothing", () => {
    const result = dispatchCommand({ type: "ShowMenuCategory" });
    expect(result.entry.status).toBe("rejected");
    expect(result.uiAction).toBeNull();
  });
});

describe("dispatch.ts source — AC8 (structural boundary)", () => {
  it("has no import statement referencing cartStore", () => {
    // Checks import lines specifically, not the whole file — a comment is
    // allowed to explain the boundary by name; an import statement is not.
    const path = fileURLToPath(new URL("./dispatch.ts", import.meta.url));
    const source = readFileSync(path, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"));

    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).not.toMatch(/cartStore/);
    }
  });
});
