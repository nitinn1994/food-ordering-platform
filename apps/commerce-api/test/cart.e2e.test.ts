import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cartResponseSchema, type CartResponse } from "@contracts/api-contracts";
import { contractErrorSchema, type ContractError } from "@contracts/common";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { withInMemoryPersistence } from "./support/in-memory-persistence";
import { CartController } from "../src/modules/cart/cart.controller";

// The same build/start harness as test/menu.e2e.test.ts: the real AppModule
// and the exact configureApp() main.ts calls. Each test starts its own app,
// so each test gets its own InMemoryCartRepository — there is no cart state
// shared between tests (test-plan.md).

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function buildApp(): Promise<{
  app: NestExpressApplication;
  controller: CartController;
}> {
  const moduleRef = await withInMemoryPersistence(
    Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig())],
    }),
  ).compile();

  const controller = moduleRef.get(CartController);
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);

  return { app, controller };
}

async function startApp(): Promise<{
  app: NestExpressApplication;
  controller: CartController;
}> {
  const built = await buildApp();
  await built.app.init();
  await built.app.listen(0);
  return built;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function send(
  app: NestExpressApplication,
  method: Method,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl(app)}${path}`, {
    method,
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectCart(response: Response, status = 200): Promise<CartResponse> {
  expect(response.status).toBe(status);
  expectRequestContextHeaders(response);
  const body: unknown = await response.json();
  const result = cartResponseSchema.safeParse(body);
  expect(result.success).toBe(true);
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
  const result = contractErrorSchema.safeParse(body);
  expect(result.success).toBe(true);
  const error = body as ContractError;
  expect(error.code).toBe(code);
  return { error, raw };
}

function expectRequestContextHeaders(response: Response): void {
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("x-correlation-id")).toBeTruthy();
}

describe("Cart API", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /v1/cart returns an empty cart before anything is added (AC1)", async () => {
    app = (await startApp()).app;

    const cart = await expectCart(await send(app, "GET", "/v1/cart"));

    expect(cart).toEqual({ items: [], itemCount: 0, subtotalCents: 0 });
  });

  it("POST /v1/cart/items adds a priced line and returns the full cart with 200 (AC2)", async () => {
    app = (await startApp()).app;

    const cart = await expectCart(
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 }),
    );

    expect(cart).toEqual({
      items: [
        {
          itemId: "tiramisu",
          name: "Tiramisu",
          unitPriceCents: 750,
          quantity: 2,
          lineSubtotalCents: 1500,
          available: true,
        },
      ],
      itemCount: 2,
      subtotalCents: 1500,
    });
    // The write is persisted — a following read agrees.
    expect(await expectCart(await send(app, "GET", "/v1/cart"))).toEqual(cart);
  });

  it("merges a repeated add into one line, keeping first-add order (AC3)", async () => {
    app = (await startApp()).app;

    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });
    await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 1 });
    const cart = await expectCart(
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 3 }),
    );

    expect(cart.items.map((line) => [line.itemId, line.quantity])).toEqual([
      ["tiramisu", 5],
      ["garlic-bread", 1],
    ]);
    expect(cart.itemCount).toBe(6);
  });

  it("rejects a merge above 99 with 422 and leaves the cart unchanged (AC4)", async () => {
    app = (await startApp()).app;
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 98 });

    await expectContractError(
      await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 }),
      422,
      "CART_ITEM_QUANTITY_LIMIT_EXCEEDED",
    );

    const cart = await expectCart(await send(app, "GET", "/v1/cart"));
    expect(cart.items[0]?.quantity).toBe(98);
  });

  it("rejects a well-formed unknown item with 404 MENU_ITEM_NOT_FOUND, never echoing it (AC5)", async () => {
    app = (await startApp()).app;

    const { raw } = await expectContractError(
      await send(app, "POST", "/v1/cart/items", { itemId: "does-not-exist", quantity: 1 }),
      404,
      "MENU_ITEM_NOT_FOUND",
    );

    expect(raw).not.toContain("does-not-exist");
    expect((await expectCart(await send(app, "GET", "/v1/cart"))).items).toEqual([]);
  });

  it("rejects an unavailable item with 422 MENU_ITEM_UNAVAILABLE (AC5)", async () => {
    app = (await startApp()).app;

    await expectContractError(
      await send(app, "POST", "/v1/cart/items", { itemId: "gelato", quantity: 1 }),
      422,
      "MENU_ITEM_UNAVAILABLE",
    );

    expect((await expectCart(await send(app, "GET", "/v1/cart"))).items).toEqual([]);
  });

  it("PATCH /v1/cart/items/:itemId sets the quantity absolutely (AC6)", async () => {
    app = (await startApp()).app;
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 2 });

    const cart = await expectCart(
      await send(app, "PATCH", "/v1/cart/items/tiramisu", { quantity: 7 }),
    );

    expect(cart.items[0]?.quantity).toBe(7);
    expect(cart.subtotalCents).toBe(750 * 7);
  });

  it.each([
    ["zero", { quantity: 0 }],
    ["negative", { quantity: -1 }],
    ["non-integer", { quantity: 1.5 }],
    ["above 99", { quantity: 100 }],
    ["a string", { quantity: "2" }],
  ])(
    "rejects a %s quantity on PATCH with 400 field quantity, before the handler runs (AC6)",
    async (_label, body) => {
      const built = await buildApp();
      const handlerSpy = vi.spyOn(built.controller, "setItemQuantity");
      await built.app.init();
      await built.app.listen(0);
      app = built.app;

      const { error } = await expectContractError(
        await send(app, "PATCH", "/v1/cart/items/tiramisu", body),
        400,
        "INVALID_PAYLOAD",
      );

      expect(error.field).toBe("quantity");
      expect(handlerSpy).not.toHaveBeenCalled();
    },
  );

  it("rejects a PATCH with no quantity with 400 field quantity (AC6)", async () => {
    app = (await startApp()).app;

    const { error } = await expectContractError(
      await send(app, "PATCH", "/v1/cart/items/tiramisu", {}),
      400,
      "INVALID_PAYLOAD",
    );

    expect(error.field).toBe("quantity");
  });

  it.each([
    ["PATCH", { quantity: 1 }],
    ["DELETE", undefined],
  ] as const)(
    "%s on a menu item that is not in the cart returns 404 CART_ITEM_NOT_FOUND (AC7)",
    async (method, body) => {
      app = (await startApp()).app;

      await expectContractError(
        await send(app, method, "/v1/cart/items/garlic-bread", body),
        404,
        "CART_ITEM_NOT_FOUND",
      );
    },
  );

  it("DELETE /v1/cart/items/:itemId removes the whole line and recomputes totals (AC8)", async () => {
    app = (await startApp()).app;
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 5 });
    await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 2 });

    const cart = await expectCart(await send(app, "DELETE", "/v1/cart/items/tiramisu"));

    expect(cart.items.map((line) => line.itemId)).toEqual(["garlic-bread"]);
    expect(cart.itemCount).toBe(2);
    expect(cart.subtotalCents).toBe(595 * 2);
  });

  describe("input boundary (AC9)", () => {
    it("rejects a malformed itemId in the path with 400 field itemId, never echoing it", async () => {
      const built = await buildApp();
      const handlerSpy = vi.spyOn(built.controller, "removeItem");
      await built.app.init();
      await built.app.listen(0);
      app = built.app;

      const { error, raw } = await expectContractError(
        await send(app, "DELETE", "/v1/cart/items/Bad_ID"),
        400,
        "INVALID_PAYLOAD",
      );

      expect(error.field).toBe("itemId");
      expect(raw).not.toContain("Bad_ID");
      expect(handlerSpy).not.toHaveBeenCalled();
    });

    it("rejects a malformed itemId in the POST body with 400 field itemId", async () => {
      app = (await startApp()).app;

      const { error, raw } = await expectContractError(
        await send(app, "POST", "/v1/cart/items", { itemId: "Bad_ID", quantity: 1 }),
        400,
        "INVALID_PAYLOAD",
      );

      expect(error.field).toBe("itemId");
      expect(raw).not.toContain("Bad_ID");
    });

    it("rejects an unknown body key with 400", async () => {
      app = (await startApp()).app;

      await expectContractError(
        await send(app, "POST", "/v1/cart/items", {
          itemId: "tiramisu",
          quantity: 1,
          note: "extra",
        }),
        400,
        "INVALID_PAYLOAD",
      );
    });

    it("rejects a non-JSON body with 415", async () => {
      app = (await startApp()).app;

      const response = await fetch(`${baseUrl(app)}/v1/cart/items`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "itemId=tiramisu",
      });

      await expectContractError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    });
  });

  describe("cart identity is server-resolved (AC10)", () => {
    it("ignores cart-selecting headers and query parameters — every request acts on the one cart", async () => {
      app = (await startApp()).app;
      await send(
        app,
        "POST",
        "/v1/cart/items",
        { itemId: "tiramisu", quantity: 2 },
        { "x-cart-id": "cart-a", "x-cart-session-id": "session-a" },
      );

      const other = await expectCart(
        await send(app, "GET", "/v1/cart?cartId=cart-b&ownerId=someone-else", undefined, {
          "x-cart-id": "cart-b",
          "x-cart-session-id": "session-b",
        }),
      );

      expect(other.items.map((line) => line.itemId)).toEqual(["tiramisu"]);
    });

    it.each(["cartId", "ownerId"])("rejects %s in a request body with 400", async (key) => {
      app = (await startApp()).app;

      await expectContractError(
        await send(app, "POST", "/v1/cart/items", {
          itemId: "tiramisu",
          quantity: 1,
          [key]: "someone-else",
        }),
        400,
        "INVALID_PAYLOAD",
      );
    });

    it("has no /v1/carts/:cartId route", async () => {
      app = (await startApp()).app;

      await expectContractError(
        await send(app, "GET", "/v1/carts/some-cart"),
        404,
        "ROUTE_NOT_FOUND",
      );
    });
  });

  describe("price authority (AC11)", () => {
    it("rejects a caller-supplied price with 400 and stores nothing", async () => {
      app = (await startApp()).app;

      await expectContractError(
        await send(app, "POST", "/v1/cart/items", {
          itemId: "tiramisu",
          quantity: 1,
          unitPriceCents: 1,
        }),
        400,
        "INVALID_PAYLOAD",
      );

      expect((await expectCart(await send(app, "GET", "/v1/cart"))).items).toEqual([]);
    });

    it("prices every line at the Menu API's current price for that item", async () => {
      app = (await startApp()).app;
      const cart = await expectCart(
        await send(app, "POST", "/v1/cart/items", { itemId: "garlic-bread", quantity: 3 }),
      );

      const menuItem = (await (
        await send(app, "GET", "/v1/menu/items/garlic-bread")
      ).json()) as { priceCents: number; name: string };

      expect(cart.items[0]?.unitPriceCents).toBe(menuItem.priceCents);
      expect(cart.items[0]?.name).toBe(menuItem.name);
      expect(cart.items[0]?.lineSubtotalCents).toBe(menuItem.priceCents * 3);
    });
  });

  it("has no DELETE /v1/cart route — clearing is not a user-facing feature (AC16, OD5)", async () => {
    app = (await startApp()).app;
    await send(app, "POST", "/v1/cart/items", { itemId: "tiramisu", quantity: 1 });

    await expectContractError(await send(app, "DELETE", "/v1/cart"), 404, "ROUTE_NOT_FOUND");

    expect((await expectCart(await send(app, "GET", "/v1/cart"))).items).toHaveLength(1);
  });

  it("is not reachable without the /v1 prefix (versioning convention)", async () => {
    app = (await startApp()).app;

    const response = await send(app, "GET", "/cart");

    expect(response.status).toBe(404);
  });
});
