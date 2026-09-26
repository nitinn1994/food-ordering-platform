// @vitest-environment node
// This file does a plain filesystem read of its own source (AC8) — it has
// no DOM dependency, and jsdom (the project default as of sub-phase 2.1)
// does not provide a real file:// import.meta.url, which that check needs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBatch } from "@contracts/ui-commands";
import { commandToUiAction, dispatchBatch, dispatchCommand } from "./dispatch";

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

// Phase 15 plan.md §15, §16 (AC14): a turn's batch, command by command.
const META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  issuedAt: "2026-09-26T12:00:00.000Z",
};

describe("dispatchBatch", () => {
  it("returns nothing for a turn without commands", () => {
    expect(dispatchBatch(null)).toEqual([]);
  });

  it("maps every allowlisted command to its explicit ui action, in order", () => {
    const steps = dispatchBatch(
      parseBatch({
        ...META,
        commands: [
          { type: "ShowMenuCategory", categoryId: "desserts" },
          { type: "HighlightItem", itemId: "tiramisu" },
          { type: "OpenCartPanel", open: true },
          { type: "ShowItemDetail", itemId: "tiramisu" },
          { type: "SearchMenu", query: "soup" },
        ],
      }),
    );

    expect(steps.map((step) => step.uiAction)).toEqual([
      { type: "SELECT_CATEGORY", categoryId: "desserts" },
      { type: "HIGHLIGHT_ITEM", itemId: "tiramisu" },
      { type: "SET_CART_PANEL_OPEN", open: true },
      { type: "SHOW_ITEM_DETAIL", itemId: "tiramisu" },
      { type: "SET_SEARCH_QUERY", query: "soup" },
    ]);
    expect(steps.every((step) => step.entry.status === "accepted")).toBe(true);
  });

  it("drops a malformed or unknown command alone, keeping its siblings", () => {
    const steps = dispatchBatch(
      parseBatch({
        ...META,
        commands: [
          { type: "ShowMenuCategory", categoryId: "desserts" },
          { execute: "someJavaScript(...)" },
          { type: "AddToCart", itemId: "tiramisu", quantity: 1 },
          { type: "OpenCartPanel", open: true },
        ],
      }),
    );

    expect(steps.map((step) => step.entry.status)).toEqual([
      "accepted",
      "rejected",
      "rejected",
      "accepted",
    ]);
    expect(steps.map((step) => step.uiAction?.type ?? null)).toEqual([
      "SELECT_CATEGORY",
      null,
      null,
      "SET_CART_PANEL_OPEN",
    ]);
  });

  it("turns a rejected envelope into one rejected entry and no ui action", () => {
    const steps = dispatchBatch(
      parseBatch({
        ...META,
        contractVersion: 2,
        commands: [{ type: "OpenCartPanel", open: true }],
      }),
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.entry.status).toBe("rejected");
    expect(steps[0]?.uiAction).toBeNull();
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
