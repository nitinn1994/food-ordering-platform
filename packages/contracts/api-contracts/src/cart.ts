import { z } from "zod";
import {
  menuItemIdSchema,
  priceCentsSchema,
  quantitySchema,
} from "@contracts/common";

// The request and response shapes commerce-api's Cart domain speaks
// (apps/commerce-api/src/modules/cart) — the second module in this package,
// after menu.ts (docs/features/phase-8-cart-domain/plan.md §8).
//
// Every object is strict, the same rule menu.ts and every other contracts
// package applies. That matters more here than for Menu: these are the
// first *request* bodies, and strictness is what rejects a caller-supplied
// price, owner, or cart id outright rather than silently stripping it
// (requirements.md AC10, AC11). No contractVersion field — the URL (/v1)
// versions this HTTP shape, as for Menu.

// Same bound as menuItemSchema.name in menu.ts — a cart line's name is the
// menu item's current name, read live (plan.md §4), never a separate value.
const MAX_NAME_LENGTH = 80;

// POST /v1/cart/items. Field-for-field the payload of @contracts/agent-intents'
// AddItemToCart, minus its `type` discriminator (plan.md §24). Adding an item
// already in the cart merges quantities (plan.md §13).
export const addCartItemRequestSchema = z.strictObject({
  itemId: menuItemIdSchema,
  quantity: quantitySchema,
});

export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;

// PATCH /v1/cart/items/:itemId. An absolute set, not a delta — the same
// semantics as SetCartItemQuantity. quantity 0 is rejected by quantitySchema
// (min 1), not treated as a removal: DELETE is the only way to remove a line
// (plan.md §12).
export const updateCartItemRequestSchema = z.strictObject({
  quantity: quantitySchema,
});

export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>;

// The :itemId route parameter of PATCH and DELETE /v1/cart/items/:itemId,
// validated through @Param({ schema }) exactly as menuItemParamsSchema is.
export const cartItemParamsSchema = z.strictObject({
  itemId: menuItemIdSchema,
});

export type CartItemParams = z.infer<typeof cartItemParamsSchema>;

// One priced line. `name`, `unitPriceCents` and `available` are the menu
// item's *current* values, computed on every read — a reference, not a
// snapshot taken at add time (plan.md §10, OD4). Price commitment is the
// Order domain's job, at placement.
export const cartLineSchema = z.strictObject({
  itemId: menuItemIdSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  unitPriceCents: priceCentsSchema,
  quantity: quantitySchema,
  lineSubtotalCents: priceCentsSchema,
  available: z.boolean(),
});

export type CartLine = z.infer<typeof cartLineSchema>;

// Every cart route returns the whole cart (plan.md §7, OD9). A cart always
// logically exists — an owner with nothing added gets `items: []`, not a 404
// (plan.md §14). `subtotalCents`, not `totalCents`: no tax, fee, or discount
// exists yet, and a later total is an addition rather than a rename.
export const cartResponseSchema = z.strictObject({
  items: z.array(cartLineSchema),
  itemCount: z.number().int().min(0),
  subtotalCents: priceCentsSchema,
});

export type CartResponse = z.infer<typeof cartResponseSchema>;
