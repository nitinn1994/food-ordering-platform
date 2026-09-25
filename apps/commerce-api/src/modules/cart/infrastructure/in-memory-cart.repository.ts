import { Injectable } from "@nestjs/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { CartVersionConflictError } from "../domain/cart.errors";
import { assertCartInvariants } from "../domain/cart.invariants";
import { CartRepository } from "../domain/cart.repository";
import type { Cart, CartOwnerId } from "../domain/cart.types";

// The in-memory adapter of CartRepository: a process-local Map, lost on
// restart (docs/features/phase-8-cart-domain/plan.md §17, OD12; ADR-0015).
// Since Phase 10 it is the test adapter, used by DB-free tests; the running
// API binds PostgresCartRepository
// (docs/features/phase-10-database-persistence/plan.md §9, OD3).
//
// ADR-0004 names this exact risk — an in-memory store makes transactional
// semantics look easier than they are — so this adapter enforces the same
// optimistic version check a database adapter would (CartRepository.save's
// contract), rather than simply overwriting.
//
// Data is cloned on the way in and on the way out: a caller can neither
// mutate stored state through an object it passed to save(), nor through
// one findByOwner() returned (which is also frozen, so an attempt throws).
@Injectable()
export class InMemoryCartRepository extends CartRepository {
  private readonly carts = new Map<CartOwnerId, Cart>();

  async findByOwner(ownerId: CartOwnerId): Promise<Cart | undefined> {
    const stored = this.carts.get(ownerId);
    return stored === undefined ? undefined : deepFreeze(structuredClone(stored));
  }

  async save(cart: Cart): Promise<void> {
    assertCartInvariants(cart);

    const storedVersion = this.carts.get(cart.ownerId)?.version ?? 0;
    if (storedVersion !== cart.version - 1) {
      throw new CartVersionConflictError();
    }
    this.carts.set(cart.ownerId, structuredClone(cart));
  }
}
