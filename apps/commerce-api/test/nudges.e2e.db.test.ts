import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nudgesResponseSchema, type NudgesResponse } from "@contracts/api-contracts";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import type { DatabaseSchema } from "../src/database/database.schema";
import { seedMenu } from "../src/database/menu-seed";
import { DEMO_MENU_SEED } from "../src/modules/menu/infrastructure/demo-menu.seed";
import { createTestDatabase, resetDatabase, testDatabaseConfig } from "./support/test-database";

// GET /v1/nudges against PostgreSQL with the demo menu `db:seed` loads
// (docs/features/mcdelivery-redesign/plan.md, Phase 3: "one DB-suite
// test"). Proves the rules' category roles match the demo menu's real
// categories, and that the nudge carries the stored presentation fields.

describe("Nudges API on PostgreSQL with the demo menu", () => {
  let db: Kysely<DatabaseSchema>;
  let app: NestExpressApplication;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await seedMenu(db, DEMO_MENU_SEED);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(testDatabaseConfig())],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  function url(path: string): string {
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") throw new Error("no port");
    return `http://127.0.0.1:${address.port}${path}`;
  }

  async function nudges(query: string): Promise<NudgesResponse> {
    const response = await fetch(url(`/v1/nudges?${query}`));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(nudgesResponseSchema.safeParse(body).success).toBe(true);
    return body as NudgesResponse;
  }

  it("completes a burger with the popular side, then a drink, from the stored menu", async () => {
    await fetch(url("/v1/cart/items"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: "paneer-crunch-burger", quantity: 1 }),
    });

    const { nudges: [side] } = await nudges("surface=post-add&itemId=paneer-crunch-burger");
    expect(side).toEqual({
      id: "rule:complete-meal-side:fries-medium",
      kind: "complete-meal",
      surface: "post-add",
      itemId: "fries-medium",
      itemName: "Fries (Medium)",
      headline: "Add Fries (Medium) to complete your meal",
      priceCents: 10900,
      imageUrl: "/menu/fries.svg",
    });

    await fetch(url("/v1/cart/items"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: "fries-medium", quantity: 1 }),
    });
    const { nudges: [drink] } = await nudges("surface=cart");
    expect(drink).toMatchObject({ kind: "complete-meal", itemId: "soft-drink-medium" });
  });
});
