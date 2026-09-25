import { z } from "zod";

// Identifiers are opaque strings. Consumers validate their *shape* and never
// parse meaning out of them; whether `tiramisu` exists is commerce-api's
// answer, never a schema's.
//
// Zod's .brand() is deliberately not used here even though nominal typing
// would be useful: branded types do not survive JSON Schema generation, and
// ADR-0003 names that exact risk. A construct that exists only in Zod is a
// rule Python silently does not enforce.

export const MAX_ID_LENGTH = 64;
export const MAX_CORRELATION_ID_LENGTH = 64;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

// Lowercase kebab-case, matching the ids the menu fixture already uses
// (`garlic-bread`, `soup-of-the-day`, `desserts`). No leading, trailing, or
// doubled separators.
const SLUG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const menuItemIdSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .regex(SLUG_ID_PATTERN);

export const menuCategoryIdSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .regex(SLUG_ID_PATTERN);

// Identifies one conversational turn. A single turn fans out into several UI
// commands and possibly several intents; without this field the accepted /
// rejected command log can record what happened but not what it belonged to.
// Format is the producer's business — the contract bounds length only.
export const correlationIdSchema = z
  .string()
  .min(1)
  .max(MAX_CORRELATION_ID_LENGTH);

// Bounded because whatever commerce-api stores these in is a storage
// amplification target if they are not. Retry semantics behind the key are
// undesigned — see system-architecture.md §8 gap 3.
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(MAX_IDEMPOTENCY_KEY_LENGTH);

export type MenuItemId = z.infer<typeof menuItemIdSchema>;
export type MenuCategoryId = z.infer<typeof menuCategoryIdSchema>;
export type CorrelationId = z.infer<typeof correlationIdSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
