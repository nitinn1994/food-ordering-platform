import { z } from "zod";
import { menuItemIdSchema, quantitySchema } from "@contracts/common";

// A business intent is a request to change commerce state — produced by
// ai-service, executed by commerce-api. The AI asks; it never applies
// (system-architecture.md §4.4). If a command in ui-commands could change
// what the user is charged, it belongs here instead — never the reverse.
//
// Every intent is a strict object, the same rule ui-commands applies
// (Phase 5, requirements.md D8, AC4): an unknown key is rejected, not
// silently stripped.
//
// Only three intents are adopted here, each grounded in cart behaviour
// apps/web already implements or needs — not necessarily a literal
// one-to-one mirror. AddItemToCart and RemoveItemFromCart map directly onto
// cartReducer's ADD_ITEM and REMOVE_ITEM. SetCartItemQuantity does not mirror
// DECREMENT_ITEM (a relative -1, floored at 1) — see the comment on
// setCartItemQuantitySchema below for why it is an absolute set instead. See
// requirements.md §4 for the full register of candidates considered and
// declined (PlaceOrder, ClearCart), and why.

export const addItemToCartSchema = z.strictObject({
  type: z.literal("AddItemToCart"),
  itemId: menuItemIdSchema,
  quantity: quantitySchema,
});

export const removeItemFromCartSchema = z.strictObject({
  type: z.literal("RemoveItemFromCart"),
  itemId: menuItemIdSchema,
});

// An absolute set, not a delta — a retried delta (e.g. "increment by 1")
// double-counts on a network retry; a retried set does not. This is the
// idempotency property PlaceOrder cannot yet have (requirements.md D2) but
// a quantity-setting intent can, for free, just by being phrased this way.
export const setCartItemQuantitySchema = z.strictObject({
  type: z.literal("SetCartItemQuantity"),
  itemId: menuItemIdSchema,
  quantity: quantitySchema,
});

export const agentIntentSchema = z.discriminatedUnion("type", [
  addItemToCartSchema,
  removeItemFromCartSchema,
  setCartItemQuantitySchema,
]);

export type AgentIntent = z.infer<typeof agentIntentSchema>;
export type AgentIntentType = AgentIntent["type"];

export const AGENT_INTENT_TYPES = [
  "AddItemToCart",
  "RemoveItemFromCart",
  "SetCartItemQuantity",
] as const satisfies readonly AgentIntentType[];
