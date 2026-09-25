import type { OrderOwnerId } from "./order.types";

// Decides whose orders a request acts on — the only place order ownership
// comes from (docs/features/phase-9-order-domain/plan.md §22, §25). Nothing
// in a request's path, body, query, or headers is read as an owner id.
//
// The Phase 9 adapter (infrastructure/cart-owner.adapter.ts) delegates to
// Cart's CartOwnerResolver, so Cart and Order share one identity binding:
// the authentication phase replaces that one binding and both domains
// follow. Async for the same reason CartOwnerResolver is.
export abstract class OrderOwnerResolver {
  abstract resolve(): Promise<OrderOwnerId>;
}
