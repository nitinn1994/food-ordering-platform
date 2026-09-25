import { z } from "zod";
import {
  idempotencyKeySchema,
  isoTimestampSchema,
  menuItemIdSchema,
  priceCentsSchema,
  quantitySchema,
} from "@contracts/common";

// The request and response shapes commerce-api's Order domain speaks
// (apps/commerce-api/src/modules/order) — the third module in this package,
// after menu.ts and cart.ts (docs/features/phase-9-order-domain/plan.md §14).
//
// Every object is strict. The create request carries no items, prices,
// totals, status, cart id or owner id: all of those are the server's —
// the order is built from the server-side cart — and strictness rejects a
// caller-supplied one outright rather than stripping it (requirements.md
// AC10). No contractVersion field — the URL (/v1) versions this shape, as
// for Menu and Cart.
//
// Every rule below is a bound or a regex, never a .transform or .refine,
// so the committed JSON Schema states the same rule a Python caller
// enforces (ADR-0003). The regexes avoid lookarounds for the same reason:
// Pydantic's default regex engine does not support them.

// Same bound as menuItemSchema.name in menu.ts — an order line's name is
// the menu item's name as it was at placement (plan.md §3).
const MAX_NAME_LENGTH = 80;

// Phase 4 D4's rules, promoted from apps/web/src/lib/checkout/validation.ts
// to a contract (plan.md §8, OD6) — an inherited recommendation, not a
// product specification. The caller trims; a value with leading or trailing
// whitespace is rejected, not normalized.
const MAX_FULL_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 32;
const MAX_EMAIL_LENGTH = 254;

// Non-empty, first and last characters non-whitespace.
const TRIMMED_PATTERN = /^\S(?:.*\S)?$/;

// An optional leading "+", then 7–20 digits separated by any of spaces,
// "-", "(" and ")" — the separators web's stripPhoneFormatting removes.
// It can neither start nor end with whitespace.
const PHONE_PATTERN = /^\+?[()-]*\d(?:[\s()-]*\d){6,19}[()-]*$/;

// The same shape check as web's EMAIL_SHAPE — not RFC 5322.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server-generated (crypto.randomUUID) and opaque: consumers validate its
// shape and never parse meaning out of it (plan.md OD13). Lowercase only,
// because that is what the server emits. Defined here rather than in
// @contracts/common because nothing outside this HTTP surface uses it yet.
const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const orderIdSchema = z.string().regex(ORDER_ID_PATTERN);

export type OrderId = z.infer<typeof orderIdSchema>;

// One status only (plan.md §4, OD3): accepted by commerce-api, no payment
// taken. Later states are the contract change of the phase that
// introduces them.
export const orderStatusSchema = z.enum(["placed"]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Personal data. commerce-api never logs it and never echoes it in an
// error (plan.md §8, §25). `email` is absent when not given — never "".
export const customerDetailsSchema = z.strictObject({
  fullName: z
    .string()
    .min(1)
    .max(MAX_FULL_NAME_LENGTH)
    .regex(TRIMMED_PATTERN),
  phone: z.string().max(MAX_PHONE_LENGTH).regex(PHONE_PATTERN),
  email: z.string().max(MAX_EMAIL_LENGTH).regex(EMAIL_PATTERN).optional(),
});

export type CustomerDetails = z.infer<typeof customerDetailsSchema>;

// POST /v1/orders. The key is required, and scoped per owner: a retry with
// the same key and the same customer returns the original order; the same
// key with a different customer is a 409 (plan.md §11, §12, OD7).
export const createOrderRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  customer: customerDetailsSchema,
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// The :orderId route parameter of GET /v1/orders/:orderId.
export const orderParamsSchema = z.strictObject({
  orderId: orderIdSchema,
});

export type OrderParams = z.infer<typeof orderParamsSchema>;

// One line, snapshotted at placement: name, unit price and quantity are
// what they were when the order was placed, and never change afterwards —
// unlike a cart line, which is re-priced on every read (plan.md §3, §6).
export const orderLineSchema = z.strictObject({
  itemId: menuItemIdSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  unitPriceCents: priceCentsSchema,
  quantity: quantitySchema,
  lineSubtotalCents: priceCentsSchema,
});

export type OrderLine = z.infer<typeof orderLineSchema>;

// Both routes return the whole order. `totalCents` equals `subtotalCents`
// today (no tax, fee, tip or discount — Phase 4 D5) but is its own field,
// because it is what a future payment charges (plan.md §7, OD5).
export const orderResponseSchema = z.strictObject({
  orderId: orderIdSchema,
  status: orderStatusSchema,
  placedAt: isoTimestampSchema,
  customer: customerDetailsSchema,
  items: z.array(orderLineSchema).min(1),
  itemCount: z.number().int().min(1),
  subtotalCents: priceCentsSchema,
  totalCents: priceCentsSchema,
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;
