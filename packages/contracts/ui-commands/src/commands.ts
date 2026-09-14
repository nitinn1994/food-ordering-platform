import { z } from "zod";

// A UI command describes what the screen should do. It must never change
// commerce state — see docs/architecture/system-architecture.md §4.4. If a
// command added here could alter what the user is charged, it is a business
// intent and belongs in agent-intents instead.

export const showMenuCategorySchema = z.object({
  type: z.literal("ShowMenuCategory"),
  categoryId: z.string().min(1),
});

export const highlightItemSchema = z.object({
  type: z.literal("HighlightItem"),
  itemId: z.string().min(1),
});

export const openCartPanelSchema = z.object({
  type: z.literal("OpenCartPanel"),
  open: z.boolean(),
});

export const showItemDetailSchema = z.object({
  type: z.literal("ShowItemDetail"),
  itemId: z.string().min(1),
});

// query may be empty — an empty SearchMenu clears the search, same as the
// touch-driven "Clear search" affordance.
export const searchMenuSchema = z.object({
  type: z.literal("SearchMenu"),
  query: z.string(),
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
