import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Kysely, sql } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  resetDatabase,
  testDatabaseConfig,
} from "../../../test/support/test-database";
import { DatabaseModule } from "../../database/database.module";
import type { DatabaseSchema } from "../../database/database.schema";
import { seedMenu } from "../../database/menu-seed";
import { CartService } from "../cart/cart.service";
import { CheckoutCart } from "./domain/checkout-cart";
import { OrderIdGenerator } from "./domain/order-id.generator";
import {
  CartEmptyError,
  CheckoutCartConflictError,
  IdempotencyKeyReusedError,
  OrderAlreadyExistsError,
  OrderItemUnavailableError,
} from "./domain/order.errors";
import type { CustomerDetails } from "./domain/order.types";
import { CartCheckoutAdapter } from "./infrastructure/cart-checkout.adapter";
import { OrderModule } from "./order.module";
import { OrderService } from "./order.service";

// Placing an order through the real OrderModule wiring — PostgresOrder-
// Repository, PostgresCartRepository, PostgresMenuRepository and the
// PostgresTransactionRunner — against the real database
// (docs/features/phase-10-database-persistence/plan.md §12, §13;
// requirements.md AC7–AC10, service level; the HTTP-level versions are
// test/persistence.e2e.db.test.ts). Only the order id generator is
// replaced, so a test can force a collision.

const CUSTOMER: CustomerDetails = { fullName: "Ada Lovelace", phone: "5551234" };
const OWNER = "local-dev-owner"; // SingleUserCartOwnerResolver's fixed owner

class ControllableOrderIds extends OrderIdGenerator {
  forced: string | undefined;

  next(): string {
    return this.forced ?? randomUUID();
  }
}

describe("order placement on PostgreSQL", () => {
  let db: Kysely<DatabaseSchema>;
  let other: Kysely<DatabaseSchema>;
  let moduleRef: TestingModule;
  let orders: OrderService;
  let cart: CartService;
  let ids: ControllableOrderIds;

  async function startModule(
    checkoutCart?: (cartService: CartService) => CheckoutCart,
  ): Promise<TestingModule> {
    ids = new ControllableOrderIds();
    let builder = Test.createTestingModule({
      imports: [DatabaseModule.forRoot(testDatabaseConfig()), OrderModule],
    })
      .overrideProvider(OrderIdGenerator)
      .useValue(ids);
    if (checkoutCart !== undefined) {
      builder = builder
        .overrideProvider(CheckoutCart)
        .useFactory({ factory: checkoutCart, inject: [CartService] });
    }
    const ref = await builder.compile();
    await ref.init(); // runs DatabaseClient's boot check
    return ref;
  }

  beforeAll(() => {
    db = createTestDatabase();
    other = createTestDatabase();
  });

  afterAll(async () => {
    await db.destroy();
    await other.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await seedMenu(db);
    moduleRef = await startModule();
    orders = moduleRef.get(OrderService);
    cart = moduleRef.get(CartService);
  });

  afterEach(async () => {
    await moduleRef.close(); // drains the pool (onApplicationShutdown)
  });

  async function storedCart() {
    const header = await other
      .selectFrom("carts")
      .select("version")
      .where("owner_id", "=", OWNER)
      .executeTakeFirst();
    const lines = await other
      .selectFrom("cart_lines")
      .select(["item_id", "quantity"])
      .where("owner_id", "=", OWNER)
      .orderBy("position")
      .execute();
    return { version: header?.version, lines };
  }

  async function orderRowCounts() {
    const count = async (table: "orders" | "order_lines") =>
      Number(
        (
          await other
            .selectFrom(table)
            .select(other.fn.countAll<string>().as("n"))
            .executeTakeFirstOrThrow()
        ).n,
      );
    return { orders: await count("orders"), lines: await count("order_lines") };
  }

  it("stores the order and consumes the cart together", async () => {
    await cart.addItem("tiramisu", 2);
    await cart.addItem("garlic-bread", 1);

    const placed = await orders.placeOrder("key-1", CUSTOMER);

    expect(placed).toMatchObject({ status: "placed", itemCount: 3, subtotalCents: 2095, totalCents: 2095 });
    await expect(orders.getOrder(placed.orderId)).resolves.toEqual(placed);
    // Cleared at version 3 (two adds + the clear); the row is kept.
    expect(await storedCart()).toEqual({ version: 3, lines: [] });
    expect(await orderRowCounts()).toEqual({ orders: 1, lines: 2 });
  });

  describe("atomicity (AC7)", () => {
    it("rolls the cart back when storing the order fails after the cart was consumed", async () => {
      await cart.addItem("tiramisu", 2);
      const first = await orders.placeOrder("key-1", CUSTOMER);
      await cart.addItem("garlic-bread", 1);
      await cart.addItem("veggie-burger", 2);
      // add (v1), place → clear (v2), add (v3), add (v4)
      const before = await storedCart();

      // A different key, so the idempotency lookup finds nothing and the
      // placement proceeds — then the order insert collides on orders_pkey,
      // *after* consume() has already cleared the cart in the transaction.
      ids.forced = first.orderId;
      await expect(orders.placeOrder("key-2", CUSTOMER)).rejects.toBeInstanceOf(
        OrderAlreadyExistsError,
      );

      expect(before).toEqual({
        version: 4,
        lines: [
          { item_id: "garlic-bread", quantity: 1 },
          { item_id: "veggie-burger", quantity: 2 },
        ],
      });
      expect(await storedCart()).toEqual(before);
      expect(await orderRowCounts()).toEqual({ orders: 1, lines: 1 });

      // Nothing was left half-done: the same cart can still be ordered.
      ids.forced = undefined;
      const retry = await orders.placeOrder("key-2", CUSTOMER);
      expect(retry.itemCount).toBe(3);
      expect(await storedCart()).toEqual({ version: 5, lines: [] });
    });
  });

  describe("concurrency (AC8)", () => {
    // Both placements price the same cart version before either consumes
    // it — the race AC8 names. A barrier on load() forces that interleaving
    // (the same technique as order.service.test.ts's in-memory version);
    // everything after load() is the real adapter, service, repositories and
    // transaction.
    it.each([
      ["different keys", "key-1", "key-2"],
      ["the same key", "key-1", "key-1"],
    ])(
      "yields exactly one order for two placements priced from one cart version, with %s",
      async (_label, a, b) => {
        await moduleRef.close();
        const barrier = { loads: 0, release: () => {} };
        const bothLoaded = new Promise<void>((resolve) => (barrier.release = resolve));
        class BarrierCheckoutCart extends CartCheckoutAdapter {
          override async load() {
            const snapshot = await super.load();
            barrier.loads += 1;
            if (barrier.loads === 2) {
              barrier.release();
            }
            await bothLoaded;
            return snapshot;
          }
        }
        moduleRef = await startModule((cartService) => new BarrierCheckoutCart(cartService));
        orders = moduleRef.get(OrderService);
        cart = moduleRef.get(CartService);
        await cart.addItem("tiramisu", 2);

        const results = await Promise.allSettled([
          orders.placeOrder(a, CUSTOMER),
          orders.placeOrder(b, CUSTOMER),
        ]);

        expect(barrier.loads).toBe(2);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(CheckoutCartConflictError);
        expect(await orderRowCounts()).toEqual({ orders: 1, lines: 1 });
        expect((await storedCart()).lines).toEqual([]);
      },
    );

    // Unforced timing: the loser may have priced the cart before the winner
    // consumed it (409 CART_CONFLICT) or after (422 CART_EMPTY) — both
    // documented outcomes (ADR-0016). What must hold either way: one order,
    // and nothing ordered by the loser.
    it("yields exactly one order for many unsynchronised placements", async () => {
      await cart.addItem("tiramisu", 2);

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => orders.placeOrder(`key-${i}`, CUSTOMER)),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(
            result.reason instanceof CheckoutCartConflictError ||
              result.reason instanceof CartEmptyError,
          ).toBe(true);
        }
      }
      expect(await orderRowCounts()).toEqual({ orders: 1, lines: 1 });
      expect((await storedCart()).lines).toEqual([]);
    });

    // Deterministic: another request's cart edit holds the cart row lock
    // when this placement reaches consume(). The placement must wait for it,
    // then fail the version check once the edit commits — 409, nothing
    // ordered, the cart exactly as the edit left it.
    it("refuses a placement when a cart edit commits between pricing and consumption", async () => {
      await cart.addItem("tiramisu", 2); // version 1

      let releaseEdit!: () => void;
      const editMayCommit = new Promise<void>((resolve) => (releaseEdit = resolve));
      let editLocked!: () => void;
      const editHasLock = new Promise<void>((resolve) => (editLocked = resolve));
      const edit = other.transaction().execute(async (trx) => {
        await trx
          .updateTable("carts")
          .set({ version: 2 })
          .where("owner_id", "=", OWNER)
          .execute();
        await trx
          .updateTable("cart_lines")
          .set({ quantity: 5 })
          .where("owner_id", "=", OWNER)
          .execute();
        editLocked();
        await editMayCommit;
      });
      await editHasLock;

      const placement = orders.placeOrder("key-1", CUSTOMER).then(
        () => "placed",
        (error: unknown) => error,
      );
      await waitForLockWait(other);
      releaseEdit();
      await edit;

      expect(await placement).toBeInstanceOf(CheckoutCartConflictError);
      expect(await orderRowCounts()).toEqual({ orders: 0, lines: 0 });
      expect(await storedCart()).toEqual({
        version: 2,
        lines: [{ item_id: "tiramisu", quantity: 5 }],
      });
    });
  });

  describe("snapshots stay historical (AC9)", () => {
    it("keeps the placement-time name and price after the menu row changes", async () => {
      await cart.addItem("tiramisu", 2);
      const placed = await orders.placeOrder("key-1", CUSTOMER);

      await db
        .updateTable("menu_items")
        .set({ price_cents: 900, name: "Tiramisu (new recipe)" })
        .where("id", "=", "tiramisu")
        .execute();

      await expect(orders.getOrder(placed.orderId)).resolves.toEqual(placed);
      expect(placed.items[0]).toMatchObject({ name: "Tiramisu", unitPriceCents: 750 });
      // …while a cart, priced live, sees the change at once.
      const repriced = await cart.addItem("tiramisu", 1);
      expect(repriced.items[0]).toMatchObject({
        name: "Tiramisu (new recipe)",
        unitPriceCents: 900,
        lineSubtotalCents: 900,
      });
    });
  });

  describe("menu consistency (AC10)", () => {
    it("flags a line whose item became unavailable, still counts it, and refuses to order it", async () => {
      await cart.addItem("tiramisu", 2);
      await db.updateTable("menu_items").set({ available: false }).where("id", "=", "tiramisu").execute();

      const current = await cart.getCart();
      expect(current.items[0]).toMatchObject({ itemId: "tiramisu", available: false });
      expect(current.subtotalCents).toBe(1500);

      await expect(orders.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        OrderItemUnavailableError,
      );
      expect(await orderRowCounts()).toEqual({ orders: 0, lines: 0 });
      expect((await storedCart()).lines).toEqual([{ item_id: "tiramisu", quantity: 2 }]);
    });

    it("omits a line whose item left the menu, and refuses to order the cart", async () => {
      await cart.addItem("tiramisu", 2);
      await cart.addItem("garlic-bread", 1);
      await db.deleteFrom("menu_items").where("id", "=", "tiramisu").execute();

      expect((await cart.getCart()).items.map((item) => item.itemId)).toEqual(["garlic-bread"]);
      await expect(orders.placeOrder("key-1", CUSTOMER)).rejects.toBeInstanceOf(
        OrderItemUnavailableError,
      );
      expect(await orderRowCounts()).toEqual({ orders: 0, lines: 0 });
      // The stored line is kept (no FK — plan.md OD6), never silently dropped.
      expect((await storedCart()).lines).toEqual([
        { item_id: "tiramisu", quantity: 2 },
        { item_id: "garlic-bread", quantity: 1 },
      ]);
    });
  });

  describe("durability", () => {
    it("serves the order, and replays it by key, from a new application instance", async () => {
      await cart.addItem("tiramisu", 2);
      const placed = await orders.placeOrder("key-1", CUSTOMER);
      await moduleRef.close();

      moduleRef = await startModule(); // afterEach closes this one
      const restarted = moduleRef.get(OrderService);

      await expect(restarted.getOrder(placed.orderId)).resolves.toEqual(placed);
      await expect(restarted.placeOrder("key-1", CUSTOMER)).resolves.toEqual(placed);
      await expect(
        restarted.placeOrder("key-1", { ...CUSTOMER, fullName: "Someone Else" }),
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      expect(await orderRowCounts()).toEqual({ orders: 1, lines: 1 });
    });
  });
});

// Resolves once some session in this database is waiting on a lock; fails
// after ~5 s. Polls the catalog rather than sleeping a fixed time.
async function waitForLockWait(observer: Kysely<DatabaseSchema>): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const { rows } = await sql<{ pid: number }>`
      select pid from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`.execute(observer);
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("expected a session to be waiting on a lock");
}
