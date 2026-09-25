import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  resetDatabase,
} from "../../../../test/support/test-database";
import { testConfig } from "../../../config/test-config";
import { DatabaseClient, createDatabase } from "../../../database/database-client";
import type { DatabaseSchema } from "../../../database/database.schema";
import {
  DatabaseUnavailableError,
  PersistenceError,
} from "../../../database/persistence.errors";
import { OrderAlreadyExistsError } from "../domain/order.errors";
import { OrderInvariantViolationError } from "../domain/order.invariants";
import type { Order } from "../domain/order.types";
import { PostgresOrderRepository } from "./postgres-order.repository";

// PostgresOrderRepository against the real database — AC6
// (docs/features/phase-10-database-persistence/requirements.md; plan.md
// §8, §19). The first block repeats in-memory-order.repository.test.ts's
// contract cases one for one; the rest is what only a real database shows.

const T0 = new Date("2026-09-25T12:00:00.123Z");
const ORDER_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const OTHER_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    ownerId: "owner-a",
    idempotencyKey: "key-1",
    lines: [
      {
        itemId: "tiramisu",
        name: "Tiramisu",
        unitPriceCents: 750,
        quantity: 2,
        lineSubtotalCents: 1500,
      },
    ],
    itemCount: 2,
    subtotalCents: 1500,
    totalCents: 1500,
    status: "placed",
    customer: { fullName: "Ada Lovelace", phone: "5551234" },
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

// Three lines and every customer field, so a round trip covers every column.
function fullOrder(overrides: Partial<Order> = {}): Order {
  return order({
    lines: [
      { itemId: "veggie-burger", name: "Veggie Burger", unitPriceCents: 1295, quantity: 1, lineSubtotalCents: 1295 },
      { itemId: "garlic-bread", name: "Garlic Bread", unitPriceCents: 595, quantity: 3, lineSubtotalCents: 1785 },
      { itemId: "tiramisu", name: "Tiramisu", unitPriceCents: 750, quantity: 99, lineSubtotalCents: 74250 },
    ],
    itemCount: 103,
    subtotalCents: 77330,
    totalCents: 77330,
    customer: { fullName: "Ada Lovelace", phone: "+44 20 7946 0958", email: "ada@example.com" },
    ...overrides,
  });
}

describe("PostgresOrderRepository", () => {
  let db: Kysely<DatabaseSchema>;
  let client: DatabaseClient;
  let repository: PostgresOrderRepository;

  beforeAll(() => {
    db = createTestDatabase();
    client = new DatabaseClient(db);
    repository = new PostgresOrderRepository(client);
  });

  afterAll(async () => {
    await client.onApplicationShutdown();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function rowCounts() {
    const orders = await db.selectFrom("orders").select(db.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
    const lines = await db.selectFrom("order_lines").select(db.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
    return { orders: Number(orders.n), lines: Number(lines.n) };
  }

  describe("the OrderRepository contract (same cases as the in-memory adapter)", () => {
    it("returns undefined for an order that was never stored", async () => {
      await expect(repository.findById("owner-a", ORDER_ID)).resolves.toBeUndefined();
      await expect(repository.findByIdempotencyKey("owner-a", "key-1")).resolves.toBeUndefined();
    });

    it("finds a stored order by id and by idempotency key", async () => {
      await repository.create(order());
      await expect(repository.findById("owner-a", ORDER_ID)).resolves.toEqual(order());
      await expect(repository.findByIdempotencyKey("owner-a", "key-1")).resolves.toEqual(order());
    });

    it("never returns an order through another owner's id", async () => {
      await repository.create(order());
      await expect(repository.findById("owner-b", ORDER_ID)).resolves.toBeUndefined();
      await expect(repository.findByIdempotencyKey("owner-b", "key-1")).resolves.toBeUndefined();
    });

    it("rejects a second order with the same id and stores nothing", async () => {
      await repository.create(order());
      await expect(repository.create(order({ idempotencyKey: "key-2" }))).rejects.toBeInstanceOf(
        OrderAlreadyExistsError,
      );
      await expect(repository.findByIdempotencyKey("owner-a", "key-2")).resolves.toBeUndefined();
      expect(await rowCounts()).toEqual({ orders: 1, lines: 1 });
    });

    it("rejects a second order with the same owner and idempotency key", async () => {
      await repository.create(order());
      await expect(repository.create(order({ id: OTHER_ID }))).rejects.toBeInstanceOf(
        OrderAlreadyExistsError,
      );
      await expect(repository.findById("owner-a", OTHER_ID)).resolves.toBeUndefined();
      expect(await rowCounts()).toEqual({ orders: 1, lines: 1 });
    });

    it("allows the same idempotency key under a different owner", async () => {
      await repository.create(order());
      await repository.create(order({ id: OTHER_ID, ownerId: "owner-b" }));
      await expect(repository.findByIdempotencyKey("owner-b", "key-1")).resolves.toMatchObject({
        id: OTHER_ID,
      });
    });

    it("does not let an owner/key pair collide with another through its characters", async () => {
      await repository.create(order({ ownerId: "a", idempotencyKey: "b,c" }));
      await expect(repository.findByIdempotencyKey("a,b", "c")).resolves.toBeUndefined();
    });

    it("rejects an order that breaks an invariant, before touching the database", async () => {
      await expect(repository.create(order({ totalCents: 1 }))).rejects.toBeInstanceOf(
        OrderInvariantViolationError,
      );
      expect(await rowCounts()).toEqual({ orders: 0, lines: 0 });
    });

    it("returns frozen copies and is isolated from the caller's objects", async () => {
      const input = structuredClone(order()) as { lines: { unitPriceCents: number }[] } & Order;
      await repository.create(input);
      input.lines[0]!.unitPriceCents = 1;

      const found = await repository.findById("owner-a", ORDER_ID);
      expect(found?.lines[0]?.unitPriceCents).toBe(750);
      expect(() => {
        (found!.lines[0] as { unitPriceCents: number }).unitPriceCents = 2;
      }).toThrow(TypeError);
      expect(() => {
        (found!.customer as { fullName: string }).fullName = "x";
      }).toThrow(TypeError);
      expect((await repository.findById("owner-a", ORDER_ID))?.lines[0]?.unitPriceCents).toBe(750);
    });
  });

  describe("storage", () => {
    it("round-trips every field, lines in order, with an email", async () => {
      await repository.create(fullOrder());
      await expect(repository.findById("owner-a", ORDER_ID)).resolves.toEqual(fullOrder());
      await expect(repository.findByIdempotencyKey("owner-a", "key-1")).resolves.toEqual(
        fullOrder(),
      );
    });

    it("stores an absent email as NULL and returns it absent — not undefined, not ''", async () => {
      await repository.create(order());
      expect(await db.selectFrom("orders").select("customer_email").execute()).toEqual([
        { customer_email: null },
      ]);
      const found = await repository.findById("owner-a", ORDER_ID);
      expect(Object.keys(found!.customer).sort()).toEqual(["fullName", "phone"]);
    });

    it("keeps the snapshot when the menu row it came from changes or disappears", async () => {
      await repository.create(fullOrder());
      // No FK from order_lines to the menu (plan.md OD6): nothing on the
      // menu side can reach a stored order. The menu is empty here — the
      // lines reference items that do not exist at all.
      expect(await db.selectFrom("menu_items").selectAll().execute()).toEqual([]);
      await expect(repository.findById("owner-a", ORDER_ID)).resolves.toEqual(fullOrder());
    });

    it("finds nothing — without querying — for an id that is not a lowercase UUID", async () => {
      await repository.create(order());
      for (const id of ["not-a-uuid", "", ORDER_ID.toUpperCase(), `${ORDER_ID} `]) {
        await expect(repository.findById("owner-a", id)).resolves.toBeUndefined();
      }
    });

    it("maps an unreachable database to DatabaseUnavailableError (503)", async () => {
      const unreachable = new DatabaseClient(
        createDatabase(testConfig({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x_test" })),
      );
      const offline = new PostgresOrderRepository(unreachable);
      try {
        await expect(offline.create(order())).rejects.toBeInstanceOf(DatabaseUnavailableError);
        await expect(offline.findById("owner-a", ORDER_ID)).rejects.toBeInstanceOf(
          DatabaseUnavailableError,
        );
        await expect(offline.findByIdempotencyKey("owner-a", "key-1")).rejects.toBeInstanceOf(
          DatabaseUnavailableError,
        );
      } finally {
        await unreachable.onApplicationShutdown();
      }
    });

    it("maps any other database failure to a PersistenceError with no customer data", async () => {
      // Valid by the domain invariants, but too long for its column.
      const tooLong = order({
        customer: { fullName: "Ada Lovelace", phone: "5551234", email: `${"a".repeat(250)}@x.io` },
      });
      const error: unknown = await repository.create(tooLong).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(PersistenceError);
      expect((error as Error).message).toBe("order.create failed (code 22001)");
      expect(JSON.stringify({ m: (error as Error).message, s: (error as Error).stack })).not.toContain(
        "Ada",
      );
      expect(await rowCounts()).toEqual({ orders: 0, lines: 0 });
    });

    it("of two concurrent creates with the same (owner, key), exactly one is stored", async () => {
      const results = await Promise.allSettled([
        repository.create(order()),
        repository.create(order({ id: OTHER_ID })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(OrderAlreadyExistsError);
      expect(await rowCounts()).toEqual({ orders: 1, lines: 1 });
    });
  });
});
