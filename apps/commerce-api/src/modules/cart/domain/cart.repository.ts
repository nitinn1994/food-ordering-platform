import type { Cart, CartOwnerId } from "./cart.types";

// The storage port. An abstract class so it doubles as its own Nest DI
// token, and async even though the Phase 8 adapter is in-memory — the same
// convention MenuRepository established (menu.repository.ts). Only
// infrastructure/ implements it (docs/features/phase-8-cart-domain/plan.md
// §16, AC12).
//
// Whole-aggregate load and save only — no line-level methods, so business
// rules stay in cart.operations.ts rather than leaking into queries.
export abstract class CartRepository {
  // undefined, not a thrown error, when the owner has never saved a cart —
  // CartService treats that as an empty cart (plan.md §14).
  abstract findByOwner(ownerId: CartOwnerId): Promise<Cart | undefined>;

  // Persists the whole cart, with optimistic concurrency as part of the
  // port's contract, not an adapter detail (plan.md §16, §19, OD10):
  //
  //   - `cart.version` is the version this write *produces*. The stored
  //     version must be exactly `cart.version - 1`; when nothing is stored,
  //     `cart.version` must be 1.
  //   - Otherwise it rejects with CartVersionConflictError and stores
  //     nothing.
  //
  // A database adapter implements the same rule as
  // `UPDATE … WHERE version = :expected` (or an insert that fails on an
  // existing row).
  abstract save(cart: Cart): Promise<void>;
}
