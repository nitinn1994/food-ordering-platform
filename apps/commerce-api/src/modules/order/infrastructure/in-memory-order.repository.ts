import { Injectable } from "@nestjs/common";
import type { IdempotencyKey } from "@contracts/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { OrderAlreadyExistsError } from "../domain/order.errors";
import { assertOrderInvariants } from "../domain/order.invariants";
import { OrderRepository } from "../domain/order.repository";
import type { Order, OrderId, OrderOwnerId } from "../domain/order.types";

// The Phase 9 adapter of OrderRepository: process-local Maps, lost on
// restart (docs/features/phase-9-order-domain/plan.md §18, OD10; ADR-0016).
// Grows without bound — acceptable for local development with one owner,
// and recorded as deferred.
//
// It enforces the port's uniqueness contract (id, and (owner, idempotency
// key)) exactly as a database's unique constraints would, rather than
// relying on OrderService never to ask for a duplicate. The check and the
// write have no `await` between them, so they are atomic within the event
// loop.
//
// Data is cloned on the way in and on the way out, and what is returned is
// frozen — the same boundary InMemoryCartRepository draws.
@Injectable()
export class InMemoryOrderRepository extends OrderRepository {
  private readonly orders = new Map<OrderId, Order>();
  private readonly idsByIdempotencyKey = new Map<string, OrderId>();

  async create(order: Order): Promise<void> {
    assertOrderInvariants(order);

    const keyIndex = idempotencyIndexKey(order.ownerId, order.idempotencyKey);
    if (this.orders.has(order.id) || this.idsByIdempotencyKey.has(keyIndex)) {
      throw new OrderAlreadyExistsError();
    }
    this.orders.set(order.id, structuredClone(order));
    this.idsByIdempotencyKey.set(keyIndex, order.id);
  }

  async findById(
    ownerId: OrderOwnerId,
    orderId: OrderId,
  ): Promise<Order | undefined> {
    const stored = this.orders.get(orderId);
    if (stored === undefined || stored.ownerId !== ownerId) {
      return undefined;
    }
    return deepFreeze(structuredClone(stored));
  }

  async findByIdempotencyKey(
    ownerId: OrderOwnerId,
    idempotencyKey: IdempotencyKey,
  ): Promise<Order | undefined> {
    const orderId = this.idsByIdempotencyKey.get(
      idempotencyIndexKey(ownerId, idempotencyKey),
    );
    return orderId === undefined ? undefined : this.findById(ownerId, orderId);
  }
}

// JSON-encoded so no owner id or key, whatever characters it contains, can
// collide with another pair.
function idempotencyIndexKey(
  ownerId: OrderOwnerId,
  idempotencyKey: IdempotencyKey,
): string {
  return JSON.stringify([ownerId, idempotencyKey]);
}
