import { z } from "zod";
import { menuCategoryIdSchema, menuItemIdSchema } from "@contracts/common";

// A UI command describes what the screen should do. It must never change
// commerce state — see docs/architecture/system-architecture.md §4.4. If a
// command added here could alter what the user is charged, it is a business
// intent and belongs in agent-intents instead.
//
// Every command is a strict object (Phase 5, requirements.md D8): an unknown
// key is rejected, not silently stripped. z.object's generated JSON Schema
// already says additionalProperties: false, so a Python consumer generated
// from it would reject a payload the old TypeScript z.object accepted —
// z.strictObject makes both languages agree, rather than merely documenting
// that they should.

// An agent-controlled string with no bound is a value that can grow without
// limit before it ever reaches React state. 200 characters comfortably fits
// any real search phrase; nothing in the product needs more.
export const MAX_SEARCH_QUERY_LENGTH = 200;

export const showMenuCategorySchema = z.strictObject({
  type: z.literal("ShowMenuCategory"),
  categoryId: menuCategoryIdSchema,
});

export const highlightItemSchema = z.strictObject({
  type: z.literal("HighlightItem"),
  itemId: menuItemIdSchema,
});

export const openCartPanelSchema = z.strictObject({
  type: z.literal("OpenCartPanel"),
  open: z.boolean(),
});

export const showItemDetailSchema = z.strictObject({
  type: z.literal("ShowItemDetail"),
  itemId: menuItemIdSchema,
});

// query may be empty — an empty SearchMenu clears the search, same as the
// touch-driven "Clear search" affordance.
export const searchMenuSchema = z.strictObject({
  type: z.literal("SearchMenu"),
  query: z.string().max(MAX_SEARCH_QUERY_LENGTH),
});

export const uiCommandSchema = z.discriminatedUnion("type", [
  showMenuCategorySchema,
  highlightItemSchema,
  openCartPanelSchema,
  showItemDetailSchema,
  searchMenuSchema,
]);

export type UiCommand = z.infer<typeof uiCommandSchema>;
export type UiCommandType = UiCommand["type"];

export const UI_COMMAND_TYPES = [
  "ShowMenuCategory",
  "HighlightItem",
  "OpenCartPanel",
  "ShowItemDetail",
  "SearchMenu",
] as const satisfies readonly UiCommandType[];
