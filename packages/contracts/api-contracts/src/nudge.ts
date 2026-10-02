import { z } from "zod";
import { menuItemIdSchema, nudgeIdSchema, priceCentsSchema } from "@contracts/common";
import { menuImagePathSchema } from "./menu";

// GET /v1/nudges — commerce-api's rule-based suggestions
// (docs/features/mcdelivery-redesign/plan.md, Phase 3, "Nudge pattern
// architecture"). Read-only: a nudge never changes the cart. Accepting one
// is the customer's own POST /v1/cart/items.
//
// Strict objects, like every other contract here.

// Where the suggestion will be shown. Kebab-case, like every other enum
// value in these contracts (`new-launch`).
export const NUDGE_SURFACES = ["cart", "post-add", "item-detail", "voice"] as const;
export const nudgeSurfaceSchema = z.enum(NUDGE_SURFACES);
export type NudgeSurface = z.infer<typeof nudgeSurfaceSchema>;

// Why it was suggested — one value per rule family.
export const NUDGE_KINDS = ["complete-meal", "pairing", "time-of-day", "new-launch"] as const;
export const nudgeKindSchema = z.enum(NUDGE_KINDS);
export type NudgeKind = z.infer<typeof nudgeKindSchema>;

// At most one suggestion per surface per response (requirements.md AC-N3).
export const MAX_NUDGES_PER_RESPONSE = 1;

const MAX_HEADLINE_LENGTH = 120;
const MAX_ITEM_NAME_LENGTH = 80;

// `rule:<ruleId>:<itemId>` (@contracts/common nudgeIdSchema) —
// deterministic, so apps/web can check that a ShowNudge command (Phase 4)
// refers to a nudge commerce-api actually offers.
export { nudgeIdSchema };

export const nudgeSchema = z.strictObject({
  id: nudgeIdSchema,
  kind: nudgeKindSchema,
  surface: nudgeSurfaceSchema,
  itemId: menuItemIdSchema,
  itemName: z.string().min(1).max(MAX_ITEM_NAME_LENGTH),
  // Plain, factual copy. Never a countdown or a scarcity claim
  // (requirements.md AC-N5).
  headline: z.string().min(1).max(MAX_HEADLINE_LENGTH),
  // The menu's live price at request time, never a stored one (AC-N2).
  priceCents: priceCentsSchema,
  imageUrl: menuImagePathSchema.optional(),
});

export type Nudge = z.infer<typeof nudgeSchema>;

// The query string. `itemId` is the item being looked at (item-detail) or
// just added (post-add); other surfaces may omit it.
export const nudgesQuerySchema = z.strictObject({
  surface: nudgeSurfaceSchema,
  itemId: menuItemIdSchema.optional(),
});

export type NudgesQuery = z.infer<typeof nudgesQuerySchema>;

// Wrapped in an object, like /v1/menu, so a field can be added later.
export const nudgesResponseSchema = z.strictObject({
  nudges: z.array(nudgeSchema).max(MAX_NUDGES_PER_RESPONSE),
});

export type NudgesResponse = z.infer<typeof nudgesResponseSchema>;
