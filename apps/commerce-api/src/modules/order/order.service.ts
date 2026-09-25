import { Injectable } from "@nestjs/common";
import type { IdempotencyKey } from "@contracts/common";
import type { OrderResponse } from "@contracts/api-contracts";
import { TransactionRunner } from "../../common/persistence/transaction-runner";
import { CheckoutCart } from "./domain/checkout-cart";
import { OrderIdGenerator } from "./domain/order-id.generator";
import { OrderOwnerResolver } from "./domain/order-owner.resolver";
import { createOrder, isSameOrderRequest } from "./domain/order.create";
import {
  IdempotencyKeyReusedError,
  OrderNotFoundError,
} from "./domain/order.errors";
import { OrderInvariantViolationError } from "./domain/order.invariants";
import { OrderRepository } from "./domain/order.repository";
import type { CustomerDetails, OrderId } from "./domain/order.types";
import { toOrderResponse } from "./order.mapper";

// The Order domain's use cases — orchestration only; the rules live in
// domain/ (docs/features/phase-9-order-domain/plan.md §20). Depends on four
// abstract ports and nothing concrete (requirements.md AC11), so storage,
// cart source, identity, and id minting are each a binding change in
// OrderModule. Phase 10 adds a fifth, TransactionRunner, for the one unit of
// work this service owns (docs/features/phase-10-database-persistence/
// plan.md §12, OD4).
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly checkoutCart: CheckoutCart,
    private readonly orderOwnerResolver: OrderOwnerResolver,
    private readonly orderIdGenerator: OrderIdGenerator,
    private readonly transactionRunner: TransactionRunner,
  ) {}

  // Places an order from the owner's cart (plan.md §5):
  //
  //   1. resolve the owner — never from the request;
  //   2. idempotency first: an order already stored under this key is
  //      returned as-is if the customer matches (a replay; the cart is not
  //      looked at — a success emptied it), or refused with 409
  //      IDEMPOTENCY_KEY_REUSED if not (plan.md §11, §12);
  //   3. load the priced cart with its version;
  //   4. build the order — pure, and where empty / unavailable carts are
  //      refused (422);
  //   5. consume the cart at exactly that version — a cart changed since
  //      step 3 is a 409 CART_CONFLICT and nothing is ordered. This is also
  //      what serializes concurrent placements: only one can consume a
  //      given version;
  //   6. store the order.
  //
  // The cart is consumed *before* the order is stored, deliberately
  // (plan.md OD11): the other way round, a concurrent cart edit could leave
  // an order whose cart was never consumed.
  //
  // Steps 5 and 6 are one transaction (ADR-0016; Phase 10 plan.md §12): if
  // storing the order fails, consuming the cart is rolled back too, so a
  // failure can no longer leave a cleared cart with no order. Only these
  // two writes are inside it — the lookups and the pure step 4 stay
  // outside, keeping the transaction short. (The in-memory TransactionRunner
  // used by DB-free tests gives no atomicity; there, a failure in step 6
  // still leaves the cart consumed.)
  async placeOrder(
    idempotencyKey: IdempotencyKey,
    customer: CustomerDetails,
  ): Promise<OrderResponse> {
    const ownerId = await this.orderOwnerResolver.resolve();

    const existing = await this.orderRepository.findByIdempotencyKey(
      ownerId,
      idempotencyKey,
    );
    if (existing) {
      if (!isSameOrderRequest(existing, customer)) {
        throw new IdempotencyKeyReusedError();
      }
      return toOrderResponse(existing);
    }

    const checkout = await this.checkoutCart.load();
    // Both come from the same identity binding (plan.md §22); a mismatch is
    // a wiring bug, never a client error.
    if (checkout.ownerId !== ownerId) {
      throw new OrderInvariantViolationError(
        "checkout cart belongs to a different owner",
      );
    }

    const order = createOrder({
      id: this.orderIdGenerator.next(),
      idempotencyKey,
      checkout,
      customer,
      now: new Date(),
    });

    await this.transactionRunner.run(async () => {
      await this.checkoutCart.consume(checkout.version);
      await this.orderRepository.create(order);
    });
    return toOrderResponse(order);
  }

  // Another owner's order is indistinguishable from a missing one: 404
  // either way (plan.md §13).
  async getOrder(orderId: OrderId): Promise<OrderResponse> {
    const ownerId = await this.orderOwnerResolver.resolve();
    const order = await this.orderRepository.findById(ownerId, orderId);
    if (!order) {
      throw new OrderNotFoundError();
    }
    return toOrderResponse(order);
  }
}
