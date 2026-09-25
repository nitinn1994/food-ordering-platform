import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { testConfig } from "../src/config/test-config";
import { configureApp } from "../src/configure-app";
import { withInMemoryPersistence } from "./support/in-memory-persistence";

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function startApp(): Promise<NestExpressApplication> {
  const moduleRef = await withInMemoryPersistence(
    Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig())],
    }),
  ).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  // The exact function main.ts calls, unmodified — requirements.md AC11.
  configureApp(app);
  await app.init();
  await app.listen(0);
  return app;
}

describe("commerce-api application (AC2, AC10, AC11)", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves GET /health with a bare liveness body (AC2)", async () => {
    app = await startApp();

    const response = await fetch(`${baseUrl(app)}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("does not serve /health under the /v1 prefix — it is unversioned (AC10)", async () => {
    app = await startApp();

    const response = await fetch(`${baseUrl(app)}/v1/health`);

    expect(response.status).toBe(404);
  });

  it("does not advertise the framework via X-Powered-By", async () => {
    app = await startApp();

    const response = await fetch(`${baseUrl(app)}/health`);

    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});
