import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { type Kysely, sql } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cartResponseSchema,
  orderResponseSchema,
  type CartResponse,
  type OrderResponse,
} from "@contracts/api-contracts";
import { contractErrorSchema, type ContractError } from "@contracts/common";
import { AppModule } from "../src/app.module";
import { AppLogger } from "../src/common/logging/logger";
import type { AppConfig } from "../src/config/env.schema";
import { configureApp } from "../src/configure-app";
import { DatabaseClient, createDatabase } from "../src/database/database-client";
import type { DatabaseSchema } from "../src/database/database.schema";
import { seedMenu } from "../src/database/menu-seed";
import { OrderIdGenerator } from "../src/modules/order/domain/order-id.generator";
import { InMemoryMenuRepository } from "../src/modules/menu/infrastructure/in-memory-menu.repository";
import { toMenuItemResponse, toMenuResponse } from "../src/modules/menu/menu.mapper";
import {
  createTestDatabase,
  resetDatabase,
  testDatabaseConfig,
} from "./support/test-database";

// The whole stack against PostgreSQL, over real HTTP
// (docs/features/phase-10-database-persistence/plan.md §20 item 2;
// requirements.md AC4, AC7–AC13): the real AppModule and the exact
// configureApp() main.ts calls, with nothing replaced except — in one
// test — the order id generator and — in two — the database connection.
// Every other *.e2e.test.ts runs the same routes on the in-memory test
// adapters instead.

const CUSTOMER = { fullName: "Ada Lovelace", phone: "5551234" };
const UNREACHABLE_URL = "postgres://marker-user:marker-pass@127.0.0.1:1/marker_test";

class ControllableOrderIds extends OrderIdGenerator {
  forced: string | undefined;

  next(): string {
    return this.forced ?? randomUUID();
  }
}

interface Started {
  app: NestExpressApplication;
  ids: ControllableOrderIds;
}

async function buildApp(
  options: { config?: AppConfig; databaseClient?: () => DatabaseClient; logger?: AppLogger } = {},
): Promise<Started> {
  const ids = new ControllableOrderIds();
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(options.config ?? testDatabaseConfig())],
  })
    .overrideProvider(OrderIdGenerator)
    .useValue(ids);
  if (options.databaseClient !== undefined) {
    builder = builder.overrideProvider(DatabaseClient).useFactory({ factory: options.databaseClient });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
  configureApp(app);
  return { app, ids };
}

async function startApp(options: Parameters<typeof buildApp>[0] = {}): Promise<Started> {
  const started = await buildApp(options);
  await started.app.init();
  await started.app.listen(0);
  return started;
}

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

function send(
  app: NestExpressApplication,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl(app)}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Every cart route answers 200 — including POST /v1/cart/items, which
// Phase 8 made 200 on purpose (cart.controller.ts).
async function expectCart(response: Response, status = 200): Promise<CartResponse> {
  expect(response.status).toBe(status);
  return cartResponseSchema.parse(await response.json());
}

async function expectOrder(response: Response, status: number): Promise<OrderResponse> {
  expect(response.status).toBe(status);
  return orderResponseSchema.parse(await response.json());
}

async function expectError(response: Response, status: number, code: string): Promise<ContractError> {
  expect(response.status).toBe(status);
  const error = contractErrorSchema.parse(await response.json());
  expect(error.code).toBe(code);
  return error;
}

function placeOrder(app: NestExpressApplication, idempotencyKey: string, customer = CUSTOMER) {
  return send(app, "POST", "/v1/orders", { idempotencyKey, customer });
}

describe("commerce-api on PostgreSQL (full stack)", () => {
  let db: Kysely<DatabaseSchema>;
  let other: Kysely<DatabaseSchema>;
  const running: NestExpressApplication[] = [];

  async function start(options: Parameters<typeof buildApp>[0] = {}): Promise<Started> {
    const started = await startApp(options);
    running.push(started.app);
    return started;
  }

  async function stop(app: NestExpressApplication): Promise<void> {
    await app.close();
    running.splice(running.indexOf(app), 1);
  }

  async function orderCount(): Promise<number> {
    const row = await other
      .selectFrom("orders")
      .select(other.fn.countAll<string>().as("n"))
      .executeTakeFirstOrThrow();
    return Number(row.n);
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const app of [...running]) {
      await stop(app);
    }
  });

  it("serves the menu exactly as the in-memory adapter does (AC4)", async () => {
    const { app } = await start();
    const inMemory = new InMemoryMenuRepository();

    const menu = await send(app, "GET", "/v1/menu");
    expect(menu.status).toBe(200);
    expect(await menu.json()).toEqual(toMenuResponse(await inMemory.listCategories()));

    for (const itemId of ["garlic-bread", "gelato", "tiramisu"]) {
      const item = await send(app, "GET", `/v1/menu/items/${itemId}`);
      expect(item.status).toBe(200);
      expect(await item.json()).toEqual(toMenuItemResponse((await inMemory.findItemById(itemId))!));
    }
    await expectError(await send(app, "GET", "/v1/menu/items/nope"), 404, "MENU_ITEM_NOT_FOUND");
  });

  it("walks a cart through add, merge, set, remove and read", async () => {
    const { app } = await start();

    await expectCart(await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 }));
    await expectCart(await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 1 }));
    await expectCart(await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 1 }));
    await expectCart(await send(app, "PATCH", "/v1/cart/items/garlic-bread", { quantity: 4 }));
    await expectCart(await send(app, "DELETE", "/v1/cart/items/tiramisu"));
    await expectError(await send(app, "DELETE", "/v1/cart/items/tiramisu"), 404, "CART_ITEM_NOT_FOUND");
    await expectError(
      await send(app, "POST", "/v1/cart/items", { itemId: "gelato", quantity: 1 }),
      422,
      "MENU_ITEM_UNAVAILABLE",
    );

    const cart = await expectCart(await send(app, "GET", "/v1/cart"));
    expect(cart).toMatchObject({ itemCount: 4, subtotalCents: 2380 });
    expect(cart.items.map((item) => [item.itemId, item.quantity])).toEqual([["garlic-bread", 4]]);
  });

  it("places, replays and refuses reuse of an order, and empties the cart", async () => {
    const { app } = await start();
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });

    const placed = await expectOrder(await placeOrder(app, "key-1"), 201);
    expect(placed).toMatchObject({ status: "placed", itemCount: 2, subtotalCents: 1500, totalCents: 1500 });
    expect((await expectCart(await send(app, "GET", "/v1/cart"))).items).toEqual([]);
    expect(await expectOrder(await send(app, "GET", `/v1/orders/${placed.orderId}`), 200)).toEqual(placed);
    expect(await expectOrder(await placeOrder(app, "key-1"), 201)).toEqual(placed);
    await expectError(
      await placeOrder(app, "key-1", { ...CUSTOMER, fullName: "Someone Else" }),
      409,
      "IDEMPOTENCY_KEY_REUSED",
    );
    await expectError(await placeOrder(app, "key-2"), 422, "CART_EMPTY");
    expect(await orderCount()).toBe(1);
  });

  it("keeps carts and orders across a restart, and replays by key afterwards (AC11)", async () => {
    const first = await start();
    await send(first.app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
    const placed = await expectOrder(await placeOrder(first.app, "key-1"), 201);
    await send(first.app, "POST", "/v1/cart/items", { itemId: "veggie-burger", quantity: 3 });
    const cartBefore = await expectCart(await send(first.app, "GET", "/v1/cart"));
    await stop(first.app);

    const second = await start();
    expect(await expectOrder(await send(second.app, "GET", `/v1/orders/${placed.orderId}`), 200)).toEqual(placed);
    expect(await expectOrder(await placeOrder(second.app, "key-1"), 201)).toEqual(placed);
    expect(await expectCart(await send(second.app, "GET", "/v1/cart"))).toEqual(cartBefore);
    expect(await orderCount()).toBe(1);
  });

  it("keeps an order's snapshot when the menu changes, while carts reprice (AC9)", async () => {
    const { app } = await start();
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
    const placed = await expectOrder(await placeOrder(app, "key-1"), 201);

    await db
      .updateTable("menu_items")
      .set({ price_cents: 900, name: "Tiramisu (new recipe)" })
      .where("id", "=", "tiramisu")
      .execute();

    expect(await expectOrder(await send(app, "GET", `/v1/orders/${placed.orderId}`), 200)).toEqual(placed);
    expect(placed.items[0]).toMatchObject({ name: "Tiramisu", unitPriceCents: 750 });
    const cart = await expectCart(
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 1 }),
    );
    expect(cart.items[0]).toMatchObject({ name: "Tiramisu (new recipe)", unitPriceCents: 900 });
  });

  describe("menu consistency (AC10)", () => {
    it("flags and counts an item that became unavailable, and refuses to order it", async () => {
      const { app } = await start();
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
      await db.updateTable("menu_items").set({ available: false }).where("id", "=", "tiramisu").execute();

      const cart = await expectCart(await send(app, "GET", "/v1/cart"));
      expect(cart.items[0]).toMatchObject({ itemId: "tiramisu", available: false });
      expect(cart.subtotalCents).toBe(1500);
      await expectError(await placeOrder(app, "key-1"), 422, "MENU_ITEM_UNAVAILABLE");
      expect(await orderCount()).toBe(0);
    });

    it("omits an item that left the menu, and refuses to order the cart", async () => {
      const { app } = await start();
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
      await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 1 });
      await db.deleteFrom("menu_items").where("id", "=", "tiramisu").execute();

      const cart = await expectCart(await send(app, "GET", "/v1/cart"));
      expect(cart.items.map((item) => item.itemId)).toEqual(["garlic-bread"]);
      await expectError(await placeOrder(app, "key-1"), 422, "MENU_ITEM_UNAVAILABLE");
      expect(await orderCount()).toBe(0);
    });
  });

  it("rolls the cart back when storing the order fails, answering 500 (AC7)", async () => {
    const { app, ids } = await start();
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
    const first = await expectOrder(await placeOrder(app, "key-1"), 201);
    await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 3 });
    const before = await expectCart(await send(app, "GET", "/v1/cart"));

    ids.forced = first.orderId; // the order insert collides after the cart is consumed
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expectError(await placeOrder(app, "key-2"), 500, "INTERNAL_ERROR");
    vi.restoreAllMocks();

    expect(await expectCart(await send(app, "GET", "/v1/cart"))).toEqual(before);
    expect(await orderCount()).toBe(1);
    ids.forced = undefined;
    expect((await expectOrder(await placeOrder(app, "key-2"), 201)).itemCount).toBe(3);
  });

  describe("concurrency (AC8)", () => {
    it("places exactly one order from many simultaneous requests", async () => {
      const { app } = await start();
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) => placeOrder(app, `key-${i}`)),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      // Each loser priced the cart before the winner consumed it (409) or
      // after (422) — both documented (ADR-0016); neither ordered anything.
      for (const status of statuses.filter((s) => s !== 201)) {
        expect([409, 422]).toContain(status);
      }
      expect(await orderCount()).toBe(1);
    });

    it("answers 409 CART_CONFLICT when a cart edit commits while the order is being placed", async () => {
      const { app } = await start();
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });

      let releaseEdit!: () => void;
      const editMayCommit = new Promise<void>((resolve) => (releaseEdit = resolve));
      let editLocked!: () => void;
      const editHasLock = new Promise<void>((resolve) => (editLocked = resolve));
      const edit = other.transaction().execute(async (trx) => {
        await trx.updateTable("carts").set({ version: 2 }).where("owner_id", "=", "local-dev-owner").execute();
        await trx.updateTable("cart_lines").set({ quantity: 7 }).where("owner_id", "=", "local-dev-owner").execute();
        editLocked();
        await editMayCommit;
      });
      await editHasLock;

      const pending = placeOrder(app, "key-1");
      await waitForLockWait(other);
      releaseEdit();
      await edit;

      await expectError(await pending, 409, "CART_CONFLICT");
      expect(await orderCount()).toBe(0);
      const cart = await expectCart(await send(app, "GET", "/v1/cart"));
      expect(cart.items.map((item) => item.quantity)).toEqual([7]);
    });
  });

  describe("an unavailable database (AC12, AC13)", () => {
    it("refuses to start when the database is unreachable, naming no URL or credential", async () => {
      const { app } = await buildApp({ config: testDatabaseConfig({ DATABASE_URL: UNREACHABLE_URL }) });
      const error: unknown = await app.init().then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Database unreachable at startup (code ECONNREFUSED).");
      for (const secret of ["marker-user", "marker-pass", "marker_test", "127.0.0.1"]) {
        expect((error as Error).message).not.toContain(secret);
      }
      await app.close();
    });

    // The database goes away after boot: a DatabaseClient on an unreachable
    // pool whose boot check is skipped, so the app starts and the failure
    // surfaces on a request instead.
    it("answers 503 SERVICE_UNAVAILABLE with a static body, logging no connection details", async () => {
      const { app } = await start({
        logger: new AppLogger({ json: true, logLevels: ["error", "warn"] }),
        databaseClient: () => {
          const client = new DatabaseClient(
            createDatabase(testDatabaseConfig({ DATABASE_URL: UNREACHABLE_URL })),
          );
          client.onModuleInit = async () => undefined;
          return client;
        },
      });
      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const responses = [
        await send(app, "GET", "/v1/menu"),
        await send(app, "GET", "/v1/cart"),
        await placeOrder(app, "key-1"),
      ];
      const logged = [...stdout.mock.calls, ...stderr.mock.calls].map(([chunk]) => String(chunk)).join("\n");
      vi.restoreAllMocks();

      for (const response of responses) {
        const raw = await response.text();
        expect(response.status).toBe(503);
        expect(JSON.parse(raw)).toEqual({
          code: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable. Retry later.",
        });
        expect(response.headers.get("x-request-id")).toBeTruthy();
      }
      expect(logged).toContain("DatabaseUnavailableError");
      for (const secret of ["marker-user", "marker-pass", "marker_test", "ECONNREFUSED 127", ":1/"]) {
        expect(logged).not.toContain(secret);
      }
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
