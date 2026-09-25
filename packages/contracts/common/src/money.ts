import { z } from "zod";

// Money on the wire is integer cents, never a float and never a formatted
// string — the rule apps/web/src/lib/money.ts already states for the
// frontend, stated here for every consumer.

// Mirrors MAX_LINE_QUANTITY in apps/web/src/lib/cart/pricing.ts. It is
// duplicated rather than imported because a contracts package must not depend
// on an application (system-architecture.md §1). The frontend adopting this
// constant as its source is follow-up work, not this phase's.
export const MAX_QUANTITY = 99;

export const quantitySchema = z.number().int().min(1).max(MAX_QUANTITY);

// Zero is valid (a free item); negative is not. No upper bound — pricing is
// commerce-api's authority, and a cap guessed here would be a business rule
// hiding in a schema.
export const priceCentsSchema = z.number().int().min(0);

export type Quantity = z.infer<typeof quantitySchema>;
export type PriceCents = z.infer<typeof priceCentsSchema>;
