import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cartResponseSchema,
  menuItemResponseSchema,
  orderResponseSchema,
  type CartResponse,
  type OrderResponse,
} from "@contracts/api-contracts";
import { contractErrorSchema, type ContractError } from "@contracts/common";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { withInMemoryPersistence } from "./support/in-memory-persistence";
import { OrderController } from "../src/modules/order/order.controller";

// The same build/start harness as test/cart.e2e.test.ts: the real AppModule
// and the exact configureApp() main.ts calls. Each test starts its own app,
// so each test gets its own in-memory cart and order repositories
// (docs/features/phase-9-order-domain/test-plan.md).

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function buildApp(): Promise<{
  app: NestExpressApplication;
  controller: OrderController;
}> {
  const moduleRef = await withInMemoryPersistence(
    Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig())],
    }),
  ).compile();

  const controller = moduleRef.get(OrderController);
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);

  return { app, controller };
}

async function startApp(): Promise<{
  app: NestExpressApplication;
  controller: OrderController;
}> {
  const built = await buildApp();
  await built.app.init();
  await built.app.listen(0);
  return built;
}

type Method = "GET" | "POST";

function send(
  app: NestExpressApplication,
  method: Method,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl(app)}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function expectRequestContextHeaders(response: Response): void {
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("x-correlation-id")).toBeTruthy();
}

async function expectOrder(response: Response, status: number): Promise<OrderResponse> {
  expect(response.status).toBe(status);
  expectRequestContextHeaders(response);
  const body: unknown = await response.json();
  expect(orderResponseSchema.safeParse(body).success).toBe(true);
  return body as OrderResponse;
}

async function getCart(app: NestExpressApplication): Promise<CartResponse> {
  const response = await send(app, "GET", "/v1/cart");
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(cartResponseSchema.safeParse(body).success).toBe(true);
  return body as CartResponse;
}

async function expectContractError(
  response: Response,
  status: number,
  code: string,
): Promise<{ error: ContractError; raw: string }> {
  expect(response.status).toBe(status);
  expectRequestContextHeaders(response);
  const raw = await response.text();
  const body: unknown = JSON.parse(raw);
  expect(contractErrorSchema.safeParse(body).success).toBe(true);
  const error = body as ContractError;
  expect(error.code).toBe(code);
  return { error, raw };
}

async function addToCart(
  app: NestExpressApplication,
  itemId: string,
  quantity: number,
): Promise<void> {
  const response = await send(app, "POST", "/v1/cart/items", { itemId, quantity });
  expect(response.status).toBe(200);
}

const CUSTOMER = {
  fullName: "Ada Lovelace",
  phone: "+44 20 7946 0958",
  email: "ada@example.com",
};

const REQUEST = { idempotencyKey: "checkout-attempt-1", customer: CUSTOMER };

const UNKNOWN_ORDER_ID = "00000000-0000-4000-8000-000000000000";

describe("Order API", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("POST /v1/orders snapshots the cart into a placed order with 201 (AC1)", async () => {
    app = (await startApp()).app;
    await addToCart(app, "tiramisu", 2);
    await addToCart(app, "garlic-bread", 1);

    const order = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

    expect(order).toEqual({
      orderId: expect.any(String),
      status: "placed",
      placedAt: expect.any(String),
      customer: CUSTOMER,
      items: [
        {
          itemId: "tiramisu",
          name: "Tiramisu",
          unitPriceCents: 750,
          quantity: 2,
          lineSubtotalCents: 1500,
        },
        {
          itemId: "garlic-bread",
          name: "Garlic Bread",
          unitPriceCents: 595,
          quantity: 1,
          lineSubtotalCents: 595,
        },
      ],
      itemCount: 3,
      subtotalCents: 2095,
      totalCents: 2095,
    });
    expect(Number.isNaN(Date.parse(order.placedAt))).toBe(false);
  });

  // AC1: every snapshot equals the Menu API's value for that item at
  // placement — nothing priced or named from anywhere else.
  it("snapshots each line's name and price from the Menu API", async () => {
    app = (await startApp()).app;
    await addToCart(app, "tiramisu", 1);
    await addToCart(app, "garlic-bread", 3);

    const order = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

    for (const line of order.items) {
      const response = await send(app, "GET", `/v1/menu/items/${line.itemId}`);
      const item = menuItemResponseSchema.parse(await response.json());
      expect(line.name).toBe(item.name);
      expect(line.unitPriceCents).toBe(item.priceCents);
      expect(line.lineSubtotalCents).toBe(item.priceCents * line.quantity);
    }
  });

  it("empties the cart once the order is placed (AC2)", async () => {
    app = (await startApp()).app;
    await addToCart(app, "tiramisu", 2);

    await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

    expect(await getCart(app)).toEqual({ items: [], itemCount: 0, subtotalCents: 0 });
  });

  describe("GET /v1/orders/:orderId (AC3)", () => {
    it("returns the placed order unchanged", async () => {
      app = (await startApp()).app;
      await addToCart(app, "tiramisu", 2);
      const placed = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

      const read = await expectOrder(
        await send(app, "GET", `/v1/orders/${placed.orderId}`),
        200,
      );

      expect(read).toEqual(placed);
    });

    it("returns 404 ORDER_NOT_FOUND for an unknown order id, never echoing it", async () => {
      app = (await startApp()).app;

      const { raw } = await expectContractError(
        await send(app, "GET", `/v1/orders/${UNKNOWN_ORDER_ID}`),
        404,
        "ORDER_NOT_FOUND",
      );

      expect(raw).not.toContain(UNKNOWN_ORDER_ID);
    });

    it("rejects a malformed order id with 400 field orderId, before the handler runs", async () => {
      const built = await buildApp();
      const handlerSpy = vi.spyOn(built.controller, "getOrder");
      await built.app.init();
      await built.app.listen(0);
      app = built.app;

      const { error, raw } = await expectContractError(
        await send(app, "GET", "/v1/orders/ORD-ABC123"),
        400,
        "INVALID_PAYLOAD",
      );

      expect(error.field).toBe("orderId");
      expect(raw).not.toContain("ORD-ABC123");
      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });

  describe("idempotency (AC4, AC5)", () => {
    it("replays the original order for the same key and customer, leaving the cart alone", async () => {
      app = (await startApp()).app;
      await addToCart(app, "tiramisu", 2);
      const first = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);
      await addToCart(app, "garlic-bread", 1);

      const replay = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

      expect(replay).toEqual(first);
      expect((await getCart(app)).items.map((line) => line.itemId)).toEqual([
        "garlic-bread",
      ]);
    });

    it("refuses the same key with different customer details with 409, never echoing the key", async () => {
      app = (await startApp()).app;
      await addToCart(app, "tiramisu", 2);
      await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);
      await addToCart(app, "garlic-bread", 1);

      const { raw } = await expectContractError(
        await send(app, "POST", "/v1/orders", {
          ...REQUEST,
          customer: { ...CUSTOMER, fullName: "Grace Hopper" },
        }),
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );

      expect(raw).not.toContain(REQUEST.idempotencyKey);
      expect(raw).not.toContain("Grace Hopper");
      expect((await getCart(app)).items).toHaveLength(1);
    });

    it("treats a new key after a placed order as a new request — refused, the cart is empty", async () => {
      app = (await startApp()).app;
      await addToCart(app, "tiramisu", 2);
      await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);

      await expectContractError(
        await send(app, "POST", "/v1/orders", { ...REQUEST, idempotencyKey: "another" }),
        422,
        "CART_EMPTY",
      );
    });
  });

  it("refuses to place an order from an empty cart with 422 CART_EMPTY (AC6)", async () => {
    app = (await startApp()).app;

    await expectContractError(
      await send(app, "POST", "/v1/orders", REQUEST),
      422,
      "CART_EMPTY",
    );
  });

  describe("input boundary (AC10)", () => {
    // Items, prices, totals, status and identity are the server's.
    it.each([
      ["items", [{ itemId: "tiramisu", quantity: 1 }]],
      ["totalCents", 1],
      ["subtotalCents", 1],
      ["unitPriceCents", 1],
      ["status", "placed"],
      ["cartId", "someone-else"],
      ["ownerId", "someone-else"],
      ["orderId", UNKNOWN_ORDER_ID],
    ])(
      "rejects a caller-supplied %s with 400, before the handler runs, ordering nothing",
      async (key, value) => {
        const built = await buildApp();
        const handlerSpy = vi.spyOn(built.controller, "placeOrder");
        await built.app.init();
        await built.app.listen(0);
        app = built.app;
        await addToCart(app, "tiramisu", 2);

        await expectContractError(
          await send(app, "POST", "/v1/orders", { ...REQUEST, [key]: value }),
          400,
          "INVALID_PAYLOAD",
        );

        expect(handlerSpy).not.toHaveBeenCalled();
        expect((await getCart(app)).items).toHaveLength(1);
      },
    );

    it("requires an idempotency key", async () => {
      app = (await startApp()).app;

      const { error } = await expectContractError(
        await send(app, "POST", "/v1/orders", { customer: CUSTOMER }),
        400,
        "INVALID_PAYLOAD",
      );

      expect(error.field).toBe("idempotencyKey");
    });

    // Personal data never comes back in an error body — only the field name.
    it.each([
      ["customer.fullName", { ...CUSTOMER, fullName: " Ada Lovelace-Padded" }],
      ["customer.phone", { ...CUSTOMER, phone: "call-me-7946" }],
      ["customer.email", { ...CUSTOMER, email: "ada-at-example.com" }],
    ])(
      "rejects an invalid %s with 400 naming the field, echoing no customer value",
      async (field, customer) => {
        app = (await startApp()).app;

        const { error, raw } = await expectContractError(
          await send(app, "POST", "/v1/orders", { ...REQUEST, customer }),
          400,
          "INVALID_PAYLOAD",
        );

        expect(error.field).toBe(field);
        for (const value of Object.values(customer)) {
          expect(raw).not.toContain(value.trim());
        }
      },
    );

    it("rejects a non-JSON body with 415", async () => {
      app = (await startApp()).app;

      const response = await fetch(`${baseUrl(app)}/v1/orders`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "place my order",
      });

      await expectContractError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    });
  });

  it("has no GET /v1/orders list route — order history is out of scope (OD2)", async () => {
    app = (await startApp()).app;

    await expectContractError(await send(app, "GET", "/v1/orders"), 404, "ROUTE_NOT_FOUND");
  });

  // AC15 (the automated half): this suite runs on the in-memory test
  // adapters (test/support/in-memory-persistence.ts), so a new process
  // starts with none. Since Phase 10 the running API persists orders — that
  // restart behaviour is test/persistence.e2e.db.test.ts's.
  it("does not keep orders across a restart", async () => {
    app = (await startApp()).app;
    await addToCart(app, "tiramisu", 1);
    const placed = await expectOrder(await send(app, "POST", "/v1/orders", REQUEST), 201);
    await app.close();

    app = (await startApp()).app;

    await expectContractError(
      await send(app, "GET", `/v1/orders/${placed.orderId}`),
      404,
      "ORDER_NOT_FOUND",
    );
  });
});
