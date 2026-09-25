import type { IdempotencyKey } from "@contracts/common";
import type { Order, OrderId, OrderOwnerId } from "./order.types";

// The storage port. An abstract class so it doubles as its own Nest DI
// token, and async even though the Phase 9 adapter is in-memory — the
// convention MenuRepository and CartRepository established. Only
// infrastructure/ implements it (docs/features/phase-9-order-domain/plan.md
// §17, AC11).
//
// Insert-only: nothing changes an order after it is created, so there is
// no update or delete. Every read is scoped by owner — an order is never
// found through someone else's owner id.
export abstract class OrderRepository {
  // Stores a new order. Rejects with OrderAlreadyExistsError, storing
  // nothing, if an order with the same id — or the same (ownerId,
  // idempotencyKey) — is already stored. A database adapter implements this
  // as unique constraints on `id` and `(owner_id, idempotency_key)`.
  abstract create(order: Order): Promise<void>;

  // undefined, not a thrown error, when there is no such order for this
  // owner — deciding that is a 404 is OrderService's job.
  abstract findById(
    ownerId: OrderOwnerId,
    orderId: OrderId,
  ): Promise<Order | undefined>;

  abstract findByIdempotencyKey(
    ownerId: OrderOwnerId,
    idempotencyKey: IdempotencyKey,
  ): Promise<Order | undefined>;
}
