import type { OrderId } from "./order.types";

// Mints order ids. A port rather than a direct crypto.randomUUID() call so
// tests are deterministic (docs/features/phase-9-order-domain/plan.md §20,
// OD13). The Phase 9 adapter returns a random lowercase UUID — the shape
// @contracts/api-contracts' orderIdSchema requires.
export abstract class OrderIdGenerator {
  abstract next(): OrderId;
}
