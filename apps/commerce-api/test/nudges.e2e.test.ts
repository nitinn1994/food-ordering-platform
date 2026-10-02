import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { nudgesResponseSchema, type NudgesResponse } from "@contracts/api-contracts";
import { contractErrorSchema, type ContractError } from "@contracts/common";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { withInMemoryPersistence } from "./support/in-memory-persistence";

// GET /v1/nudges over HTTP (docs/features/mcdelivery-redesign/requirements.md
// AC-N1–AC-N4, AC-N6): the real AppModule and configureApp(), on the
// in-memory adapters and the test menu (menu.seed.ts: starters, mains,
// desserts). Each test starts its own app, so carts are not shared.

async function startApp(): Promise<NestExpressApplication> {
  const moduleRef = await withInMemoryPersistence(
    Test.createTestingModule({ imports: [AppModule.forRoot(testConfig())] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  await app.listen(0);
  return app;
}

function url(app: NestExpressApplication, path: string): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}${path}`;
}

async function nudges(app: NestExpressApplication, query: string): Promise<NudgesResponse> {
  const response = await fetch(url(app, `/v1/nudges?${query}`));
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(nudgesResponseSchema.safeParse(body).success).toBe(true);
  return body as NudgesResponse;
}

async function addToCart(app: NestExpressApplication, itemId: string): Promise<void> {
  const response = await fetch(url(app, "/v1/cart/items"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId, quantity: 1 }),
  });
  expect(response.status).toBe(200);
}

async function expectInvalid(app: NestExpressApplication, query: string, field: string) {
  const response = await fetch(url(app, `/v1/nudges?${query}`));
  expect(response.status).toBe(400);
  const body: unknown = await response.json();
  expect(contractErrorSchema.safeParse(body).success).toBe(true);
  expect(body as ContractError).toMatchObject({ code: "INVALID_PAYLOAD", field });
}

describe("Nudges API", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns no nudge for an empty cart (AC-N1)", async () => {
    app = await startApp();
    expect(await nudges(app, "surface=cart")).toEqual({ nudges: [] });
  });

  it("suggests a side once the server-side cart has a main, priced from the menu (AC-N1, AC-N2)", async () => {
    app = await startApp();
    await addToCart(app, "veggie-burger");

    const { nudges: [nudge] } = await nudges(app, "surface=cart");

    expect(nudge).toEqual({
      id: "rule:complete-meal-side:garlic-bread",
      kind: "complete-meal",
      surface: "cart",
      itemId: "garlic-bread",
      itemName: "Garlic Bread",
      headline: "Add Garlic Bread to complete your meal",
      priceCents: 595,
    });
  });

  it("is read-only: asking for nudges leaves the cart unchanged (AC-N6)", async () => {
    app = await startApp();
    await addToCart(app, "veggie-burger");
    const before = await (await fetch(url(app, "/v1/cart"))).json();

    await nudges(app, "surface=post-add&itemId=veggie-burger");

    expect(await (await fetch(url(app, "/v1/cart"))).json()).toEqual(before);
  });

  it("pairs the item being viewed, and treats an unknown well-formed item as no match", async () => {
    app = await startApp();
    const { nudges: [pairing] } = await nudges(app, "surface=item-detail&itemId=margherita-pizza");
    expect(pairing).toMatchObject({ kind: "pairing", itemId: "garlic-bread" });

    expect(await nudges(app, "surface=item-detail&itemId=no-such-item")).toEqual({ nudges: [] });
  });

  it.each([
    ["", "surface"],
    ["surface=checkout", "surface"],
    ["surface=cart&itemId=Bad_ID", "itemId"],
  ])("rejects ?%s with the 400 error model on %s (AC-N4)", async (query, field) => {
    app = await startApp();
    await expectInvalid(app, query, field);
  });

  it("rejects an unknown query parameter (strict query)", async () => {
    app = await startApp();
    const response = await fetch(url(app, "/v1/nudges?surface=cart&urgency=high"));
    expect(response.status).toBe(400);
  });
});
