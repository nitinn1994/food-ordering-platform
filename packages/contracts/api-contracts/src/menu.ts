import { z } from "zod";
import {
  menuCategoryIdSchema,
  menuItemIdSchema,
  priceCentsSchema,
} from "@contracts/common";

// The response shapes commerce-api's Menu domain returns
// (apps/commerce-api/src/modules/menu). This is the directory
// system-architecture.md §6 reserves for commerce-api's own request/response
// contracts — the first one written, now that a producer exists (Phase 5
// D12's blocker no longer applies).
//
// Every object is strict (an unknown key is rejected, not silently
// stripped), the same rule every other contracts package applies.
// No contractVersion field: the URL (/v1) versions this HTTP shape, the
// same split docs/api/commerce-api.md §2 already draws for the rest of
// commerce-api's surface.

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_LONG_DESCRIPTION_LENGTH = 1000;
const MAX_DIETARY_TAGS = 10;
const MAX_ALLERGENS = 20;
const MAX_TAG_LENGTH = 32;

// Lowercase kebab-case, matching the ids the menu fixture already uses
// (`vegetarian`, `gluten`, `dairy`) — the same pattern @contracts/common's
// ids.ts applies to identifiers, applied here to tag values instead.
const SLUG_TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugTagSchema = z.string().min(1).max(MAX_TAG_LENGTH).regex(SLUG_TAG_PATTERN);

// Presentation fields for the McDelivery-style menu (docs/features/
// mcdelivery-redesign/plan.md, Phase 2). All optional: an item or category
// without them is still valid, so the Phase 7–10 menu and every existing
// fixture keep validating unchanged.
//
// An image is a same-origin path to a static file apps/web serves (for
// example "/menu/burger.svg") — never a URL with a scheme or host, and never
// a `..` segment. apps/web's CSP allows only same-origin images anyway.
const MAX_IMAGE_PATH_LENGTH = 200;
const IMAGE_PATH_PATTERN = /^(?:\/[a-z0-9][a-z0-9-]*)+\.(?:svg|png|jpe?g|webp)$/;
export const menuImagePathSchema = z
  .string()
  .max(MAX_IMAGE_PATH_LENGTH)
  .regex(IMAGE_PATH_PATTERN);

// A fixed set, not free text: a badge may not make a claim the menu does
// not back (no "20% off" without a discount, no scarcity) — plan.md's nudge
// guardrails apply to the menu's own labels too.
export const MENU_ITEM_BADGES = ["new", "bestseller", "value"] as const;
export const menuItemBadgeSchema = z.enum(MENU_ITEM_BADGES);
export type MenuItemBadge = z.infer<typeof menuItemBadgeSchema>;

// Which "Our Menu" chip lists the item ("Popular", "Deals", "New Launch").
export const MENU_ITEM_FEATURES = ["popular", "deal", "new-launch"] as const;
export const menuItemFeatureSchema = z.enum(MENU_ITEM_FEATURES);
export type MenuItemFeature = z.infer<typeof menuItemFeatureSchema>;
const MAX_WEIGHT_GRAMS = 5000;

export const menuItemSchema = z.strictObject({
  id: menuItemIdSchema,
  categoryId: menuCategoryIdSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  description: z.string().min(1).max(MAX_DESCRIPTION_LENGTH),
  longDescription: z.string().min(1).max(MAX_LONG_DESCRIPTION_LENGTH),
  priceCents: priceCentsSchema,
  available: z.boolean(),
  dietaryTags: z.array(slugTagSchema).max(MAX_DIETARY_TAGS),
  allergens: z.array(slugTagSchema).max(MAX_ALLERGENS),
  calories: z.number().int().min(0),
  imageUrl: menuImagePathSchema.optional(),
  weightGrams: z.number().int().min(1).max(MAX_WEIGHT_GRAMS).optional(),
  badge: menuItemBadgeSchema.optional(),
  featured: z.array(menuItemFeatureSchema).max(MENU_ITEM_FEATURES.length).optional(),
});

export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuCategorySchema = z.strictObject({
  id: menuCategoryIdSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  imageUrl: menuImagePathSchema.optional(),
  items: z.array(menuItemSchema),
});

export type MenuCategory = z.infer<typeof menuCategorySchema>;

// GET /v1/menu — the whole menu, nested. Wrapped in an object (not a bare
// array) so a field can be added later without a breaking change — still
// "the resource itself, no envelope" per docs/api/commerce-api.md §5.
export const menuResponseSchema = z.strictObject({
  categories: z.array(menuCategorySchema),
});

export type MenuResponse = z.infer<typeof menuResponseSchema>;

// GET /v1/menu/items/:itemId — a single item, the same shape it appears in
// above.
export const menuItemResponseSchema = menuItemSchema;

export type MenuItemResponse = z.infer<typeof menuItemResponseSchema>;

// The route parameter for GET /v1/menu/items/:itemId, validated via Nest's
// @Param({ schema }) through the existing global StandardSchemaValidationPipe
// (docs/api/commerce-api.md §4) — the same mechanism request bodies already
// use, applied to a path parameter instead.
export const menuItemParamsSchema = z.strictObject({
  itemId: menuItemIdSchema,
});

export type MenuItemParams = z.infer<typeof menuItemParamsSchema>;
