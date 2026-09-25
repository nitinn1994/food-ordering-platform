import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { TransactionRunner } from "../../common/persistence/transaction-runner";
import { DatabaseModule } from "../../database/database.module";
import { PostgresTransactionRunner } from "../../database/postgres-transaction-runner";
import { testConfig } from "../../config/test-config";
import { CartOwnerResolver } from "../cart/domain/cart-owner.resolver";
import { CartController } from "../cart/cart.controller";
import { CheckoutCart } from "./domain/checkout-cart";
import { OrderIdGenerator } from "./domain/order-id.generator";
import { OrderOwnerResolver } from "./domain/order-owner.resolver";
import { OrderRepository } from "./domain/order.repository";
import { CartCheckoutAdapter } from "./infrastructure/cart-checkout.adapter";
import { CartOwnerAdapter } from "./infrastructure/cart-owner.adapter";
import { PostgresOrderRepository } from "./infrastructure/postgres-order.repository";
import { UuidOrderIdGenerator } from "./infrastructure/uuid-order-id.generator";
import { OrderController } from "./order.controller";
import { OrderModule } from "./order.module";
import { OrderService } from "./order.service";
import { withInMemoryPersistence } from "../../../test/support/in-memory-persistence";

const CUSTOMER = { fullName: "Ada Lovelace", phone: "5551234" };

// Constructor injection by abstract-class token, no @Inject() — the same
// toolchain proof cart.module.test.ts gives CartModule, for four ports
// (requirements.md AC11).
describe("OrderModule", () => {
  // Phase 10: storage is Postgres and placement runs in a Postgres
  // transaction; the other ports keep their Phase 9 adapters. Compiling does
  // not connect (pg.Pool is lazy), so this needs no database — and no
  // in-memory override, which would hide the binding.
  it("resolves the controller, service, and each port to its runtime adapter", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(testConfig()), OrderModule],
    }).compile();

    expect(moduleRef.get(OrderController)).toBeInstanceOf(OrderController);
    expect(moduleRef.get(OrderService)).toBeInstanceOf(OrderService);
    expect(moduleRef.get(OrderRepository)).toBeInstanceOf(PostgresOrderRepository);
    expect(moduleRef.get(TransactionRunner)).toBeInstanceOf(PostgresTransactionRunner);
    expect(moduleRef.get(CheckoutCart)).toBeInstanceOf(CartCheckoutAdapter);
    expect(moduleRef.get(OrderOwnerResolver)).toBeInstanceOf(CartOwnerAdapter);
    expect(moduleRef.get(OrderIdGenerator)).toBeInstanceOf(UuidOrderIdGenerator);
  });

  // One identity binding for both domains (plan.md §22).
  it("resolves the order owner to the cart owner", async () => {
    const moduleRef = await withInMemoryPersistence(
      Test.createTestingModule({
        imports: [OrderModule],
      }),
    ).compile();

    await expect(moduleRef.get(OrderOwnerResolver).resolve()).resolves.toBe(
      await moduleRef.get(CartOwnerResolver).resolve(),
    );
  });

  it("mints lowercase UUID order ids", () => {
    const id = new UuidOrderIdGenerator().next();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new UuidOrderIdGenerator().next()).not.toBe(id);
  });

  // Within the whole app, Order consumes the same cart the Cart API serves —
  // Nest shares the one CartModule instance between AppModule and
  // OrderModule, rather than giving Order a second, empty cart.
  it("places an order from the cart the Cart API filled, and empties it", async () => {
    const moduleRef = await withInMemoryPersistence(
      Test.createTestingModule({
        imports: [AppModule.forRoot(testConfig())],
      }),
    ).compile();
    const cart = moduleRef.get(CartController);
    const orders = moduleRef.get(OrderController);
    await cart.addItem({ itemId: "tiramisu", quantity: 2 });

    const order = await orders.placeOrder({
      idempotencyKey: "key-1",
      customer: CUSTOMER,
    });

    expect(order.subtotalCents).toBe(1500);
    expect((await cart.getCart()).items).toEqual([]);
    await expect(orders.getOrder({ orderId: order.orderId })).resolves.toEqual(
      order,
    );
  });
});
