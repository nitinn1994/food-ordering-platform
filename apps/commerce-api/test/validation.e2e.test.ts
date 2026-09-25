import { contractErrorSchema, type ContractError } from "@contracts/common";
import { HttpStatus } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppLogger } from "../src/common/logging/logger";
import { configureApp } from "../src/configure-app";
import { ValidationFixtureController } from "./fixtures/validation-fixture.controller";

// Business routes are versioned (configure-app.ts's enableVersioning),
// unlike /health — requirements.md AC10. This fixture reuses that same
// real behaviour rather than assuming it.
const FIXTURE_PATH = "/v1/test/validation-fixture";

async function buildFixtureApp(): Promise<{
  app: NestExpressApplication;
  controller: ValidationFixtureController;
}> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ValidationFixtureController],
  }).compile();

  const controller = moduleRef.get(ValidationFixtureController);
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    // Matches main.ts: without this, Nest's default logger writes plain
    // coloured text, not JSON — the AC7 log-capture test below parses each
    // captured line as JSON, so it would silently find nothing without this.
    logger: new AppLogger({ json: true, logLevels: ["error"] }),
  });

  // The exact function main.ts calls, unmodified (requirements.md AC11) —
  // this used to be duplicated by hand here, until sub-phase 6.4 extracted
  // it. The duplication had already caused one real bug (see
  // configure-app.ts's own comment on middleware ordering); using the same
  // function removes the possibility of the two setups drifting apart.
  configureApp(app);

  return { app, controller };
}

async function startFixtureApp(): Promise<{
  app: NestExpressApplication;
  controller: ValidationFixtureController;
}> {
  const built = await buildFixtureApp();
  await built.app.init();
  await built.app.listen(0);
  return built;
}

function baseUrl(app: NestExpressApplication): string {
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the HTTP server to report a port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function expectContractError(
  response: Response,
): Promise<ContractError> {
  const body: unknown = await response.json();
  const result = contractErrorSchema.safeParse(body);
  expect(result.success).toBe(true);
  return body as ContractError;
}

// Every response — success or error — must carry both ids (requirements.md
// AC8). This is the exact assertion that was missing when a real 413
// response was found, live, to be missing both headers; it is asserted
// explicitly here rather than only implied by the 200 case.
function expectRequestContextHeaders(response: Response): void {
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("x-correlation-id")).toBeTruthy();
}

// Verbatim from docs/api/contracts.md §4's "ACCEPTED" business-intent
// example, so this test exercises the same payload the contract docs cite.
const VALID_INTENT_REQUEST = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  idempotencyKey: "01HQ8ZK9",
  issuedAt: "2026-09-19T10:04:09.000Z",
  intent: { type: "AddItemToCart", itemId: "tiramisu", quantity: 1 },
};

describe("validation and error model (AC5, AC6, AC7, AC10)", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("accepts a well-formed request under /v1 and returns it unchanged (AC10)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INTENT_REQUEST),
    });

    expect(response.status).toBe(HttpStatus.CREATED);
    expect(await response.json()).toEqual(VALID_INTENT_REQUEST);
  });

  it("is not reachable without the /v1 prefix (AC10)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(
      `${baseUrl(app)}/test/validation-fixture`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_INTENT_REQUEST),
      },
    );

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
  });

  it("rejects an invalid body with 400 INVALID_PAYLOAD before the handler runs (AC6)", async () => {
    const built = await buildFixtureApp();
    const handleSpy = vi.spyOn(built.controller, "handle");
    await built.app.init();
    await built.app.listen(0);
    app = built.app;

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_INTENT_REQUEST,
        intent: { type: "AddItemToCart" }, // missing itemId, quantity
      }),
    });

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    const error = await expectContractError(response);
    expect(error.code).toBe("INVALID_PAYLOAD");
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it("rejects an unknown key under strict-object validation (AC6)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_INTENT_REQUEST, extra: "not allowed" }),
    });

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    const error = await expectContractError(response);
    expect(error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects contractVersion: 2 with UNSUPPORTED_CONTRACT_VERSION (AC6)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_INTENT_REQUEST, contractVersion: 2 }),
    });

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    const error = await expectContractError(response);
    expect(error.code).toBe("UNSUPPORTED_CONTRACT_VERSION");
    expect(error.field).toBe("contractVersion");
  });

  it("never echoes the rejected payload back (AC6)", async () => {
    const started = await startFixtureApp();
    app = started.app;
    const secretLookingValue = "sk_live_marker_9f3a_should_not_echo";

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_INTENT_REQUEST,
        intent: { type: secretLookingValue },
      }),
    });

    const raw = await response.text();
    expect(raw).not.toContain(secretLookingValue);
  });

  it("returns 404 ROUTE_NOT_FOUND for an unknown route (AC5)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}/does/not/exist`);

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expectRequestContextHeaders(response);
    const error = await expectContractError(response);
    expect(error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("returns 415 UNSUPPORTED_MEDIA_TYPE for a non-JSON body (AC5)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });

    expect(response.status).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    expectRequestContextHeaders(response);
    const error = await expectContractError(response);
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("returns 413 PAYLOAD_TOO_LARGE for a body over the 16kb limit, still carrying both ids (AC5, AC8)", async () => {
    const started = await startFixtureApp();
    app = started.app;
    const oversized = JSON.stringify({ padding: "x".repeat(20_000) });

    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    });

    expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expectRequestContextHeaders(response);
    const error = await expectContractError(response);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a bare 500 INTERNAL_ERROR that leaks nothing, but logs the detail with the requestId (AC7)", async () => {
    const started = await startFixtureApp();
    app = started.app;

    // ConsoleLogger's .error() writes to stderr, not stdout (see its own
    // doc comment: "Prints to stderr with newline") — every other level
    // this service logs at (log/warn/etc., see logger.test.ts) writes to
    // stdout, so both are spied here rather than assuming one.
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const response = await fetch(`${baseUrl(app)}${FIXTURE_PATH}/boom`);

    // Read the captured calls before restoring: mockRestore() also clears
    // mock.calls (the same reset that mockClear() does), so reading it
    // afterward would always find nothing.
    const loggedLines = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls]
      .map(([chunk]) => String(chunk).trim())
      .filter((line) => line.length > 0);
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    const raw = await response.text();
    expect(raw).not.toContain("boom-secret-detail-9f3a");
    expect(raw).not.toContain("at ValidationFixtureController"); // no stack

    const error = await expectContractError(
      new Response(raw, { headers: response.headers }),
    );
    expect(error.code).toBe("INTERNAL_ERROR");

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();

    const matchingLine = loggedLines.find((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return (
          typeof parsed.message === "string" &&
          parsed.message.includes("boom-secret-detail-9f3a")
        );
      } catch {
        return false;
      }
    });
    expect(matchingLine).toBeDefined();
    expect(JSON.parse(matchingLine ?? "{}").requestId).toBe(requestId);
  });
});
