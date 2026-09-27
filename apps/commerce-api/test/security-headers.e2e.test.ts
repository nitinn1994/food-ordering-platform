import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { withInMemoryPersistence } from "./support/in-memory-persistence";

// Phase 18 (plan.md §3 S-2; requirements.md AC5, AC6): every response —
// success, validation failure, 404, 413, 415 — carries the security headers
// and no-store, and readiness reports 503 when there is no database.

const EXPECTED = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

describe("security headers and readiness (Phase 18 AC5, AC6)", () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await withInMemoryPersistence(
      Test.createTestingModule({ imports: [AppModule.forRoot(testConfig())] }),
    ).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected the HTTP server to report a port");
    }
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const json = { "content-type": "application/json" };

  it.each([
    ["GET /health", "/health", {}],
    ["GET /v1/menu", "/v1/menu", {}],
    ["GET /v1/cart", "/v1/cart", {}],
    ["POST /v1/cart/items", "/v1/cart/items", { method: "POST", headers: json, body: '{"itemId":"tiramisu","quantity":1}' }],
    ["POST /v1/orders (invalid → 400)", "/v1/orders", { method: "POST", headers: json, body: "{}" }],
    ["GET /v1/orders/:id (404)", "/v1/orders/00000000-0000-4000-8000-000000000000", {}],
    ["unknown route (404)", "/nope", {}],
    ["non-JSON body (415)", "/v1/cart/items", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }],
    ["oversized body (413)", "/v1/cart/items", { method: "POST", headers: json, body: JSON.stringify({ pad: "x".repeat(20_000) }) }],
  ] as const)("sets every header on %s", async (_label, path, init) => {
    const response = await fetch(`${base}${path}`, init as RequestInit);

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  it("answers GET /health/ready with 503 not_ready when the database is absent", async () => {
    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready" });
  });

  it("keeps GET /health live when the database is absent", async () => {
    const response = await fetch(`${base}/health`);

    expect(response.status).toBe(200);
  });
});
