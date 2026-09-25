import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { menuItemResponseSchema, menuResponseSchema } from "@contracts/api-contracts";
import { contractErrorSchema, type ContractError } from "@contracts/common";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { MenuController } from "../src/modules/menu/menu.controller";

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

// Same two-step build/start split as test/validation.e2e.test.ts — a spy on
// the controller has to be installed before app.init(), so the AC4 test
// below calls buildApp() directly rather than startApp().
async function buildApp(): Promise<{
  app: NestExpressApplication;
  controller: MenuController;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(testConfig())],
  }).compile();

  const controller = moduleRef.get(MenuController);
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  // The exact function main.ts calls, unmodified — requirements.md AC11
  // (Phase 6), reused here so this test app is configured identically to
  // the production one.
  configureApp(app);

  return { app, controller };
}

async function startApp(): Promise<{
  app: NestExpressApplication;
  controller: MenuController;
}> {
  const built = await buildApp();
  await built.app.init();
  await built.app.listen(0);
  return built;
}

async function expectContractError(response: Response): Promise<ContractError> {
  const body: unknown = await response.json();
  const result = contractErrorSchema.safeParse(body);
  expect(result.success).toBe(true);
  return body as ContractError;
}

function expectRequestContextHeaders(response: Response): void {
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("x-correlation-id")).toBeTruthy();
}

describe("Menu API", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /v1/menu returns the full menu in fixture order (AC1)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/v1/menu`);

    expect(response.status).toBe(200);
    expectRequestContextHeaders(response);
    const body: unknown = await response.json();
    const result = menuResponseSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.categories.map((category) => category.id)).toEqual([
      "starters",
      "mains",
      "desserts",
    ]);
    expect(
      result.data.categories.flatMap((category) => category.items),
    ).toHaveLength(6);
  });

  it("GET /v1/menu/items/:itemId returns a found item (AC2)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/v1/menu/items/tiramisu`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const result = menuItemResponseSchema.safeParse(body);
    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBe("Tiramisu");
  });

  it("returns an unavailable item with available: false rather than omitting it (AC2)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/v1/menu/items/gelato`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const result = menuItemResponseSchema.safeParse(body);
    expect(result.success).toBe(true);
    expect(result.success && result.data.available).toBe(false);
  });

  it("returns 404 MENU_ITEM_NOT_FOUND for a well-formed unknown itemId (AC3)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(
      `${baseUrl(app)}/v1/menu/items/does-not-exist`,
    );

    expect(response.status).toBe(404);
    expectRequestContextHeaders(response);
    const error = await expectContractError(response);
    expect(error.code).toBe("MENU_ITEM_NOT_FOUND");
    // The message never names what wasn't found — see menu.errors.ts.
    expect(error.message).not.toContain("does-not-exist");
  });

  it("rejects a malformed itemId with 400 INVALID_PAYLOAD before the handler runs, never echoing it (AC4)", async () => {
    const built = await buildApp();
    const handlerSpy = vi.spyOn(built.controller, "getItem");
    await built.app.init();
    await built.app.listen(0);
    app = built.app;

    const response = await fetch(`${baseUrl(app)}/v1/menu/items/Bad_ID`);
    const raw = await response.text();

    expect(response.status).toBe(400);
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(raw).not.toContain("Bad_ID");

    const error = await expectContractError(
      new Response(raw, { headers: response.headers }),
    );
    expect(error.code).toBe("INVALID_PAYLOAD");
    expect(error.field).toBe("itemId");
  });

  it("is not reachable without the /v1 prefix (versioning convention)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/menu`);

    expect(response.status).toBe(404);
  });

  it("has no GET /v1/menu/categories route (AC9 — declined, no consumer)", async () => {
    const started = await startApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/v1/menu/categories`);

    expect(response.status).toBe(404);
  });
});
