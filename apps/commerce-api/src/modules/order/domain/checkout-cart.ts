import type { CheckoutSnapshot } from "./order.types";

// What the Order domain needs from the owner's cart, stated from Order's
// side (docs/features/phase-9-order-domain/plan.md §22, OD1) — the same
// consumer-owned-port pattern Cart uses for Menu (CartCatalog). The Phase 9
// adapter (infrastructure/cart-checkout.adapter.ts) answers it from
// CartService; Order never imports the Cart domain's types, repository, or
// pricing.
export abstract class CheckoutCart {
  // The owner's cart, priced from the menu's current values — the prices
  // the order snapshots. An owner with no cart gets an empty snapshot, not
  // an error: deciding that an empty cart cannot be ordered is createOrder's
  // job.
  abstract load(): Promise<CheckoutSnapshot>;

  // Clears the owner's cart, but only if it is still at `expectedVersion` —
  // the version load() returned. Otherwise it rejects with
  // CheckoutCartConflictError and changes nothing. This check is what stops
  // two concurrent placements from both succeeding, and what guarantees the
  // cart consumed is exactly the cart that was priced (plan.md §5, OD11).
  abstract consume(expectedVersion: number): Promise<void>;
}
