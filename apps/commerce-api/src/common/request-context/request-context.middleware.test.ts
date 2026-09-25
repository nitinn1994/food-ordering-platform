import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { getRequestContext, requestContextStorage } from "./request-context";
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  RequestContextMiddleware,
} from "./request-context.middleware";

// Constructs the minimal req/res shape the middleware actually reads —
// req.header(name) and res.setHeader(name, value) — rather than a full
// Express mock; cast through `unknown` since nothing else on Request/
// Response is touched.
function fakeReq(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function fakeRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("RequestContextMiddleware", () => {
  it("always generates its own X-Request-Id, ignoring any inbound value", () => {
    const middleware = new RequestContextMiddleware();
    const req = fakeReq({ "x-request-id": "client-supplied-id" });
    const res = fakeRes();
    const next = vi.fn();

    middleware.use(req, res, next);

    expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_PATTERN);
    expect(res.headers[REQUEST_ID_HEADER]).not.toBe("client-supplied-id");
    expect(next).toHaveBeenCalledOnce();
  });

  it("echoes back a valid inbound X-Correlation-Id", () => {
    const middleware = new RequestContextMiddleware();
    const req = fakeReq({ "x-correlation-id": "turn_7f3a" });
    const res = fakeRes();

    middleware.use(req, res, vi.fn());

    expect(res.headers[CORRELATION_ID_HEADER]).toBe("turn_7f3a");
  });

  it("generates a correlation id when none is supplied", () => {
    const middleware = new RequestContextMiddleware();
    const res = fakeRes();

    middleware.use(fakeReq({}), res, vi.fn());

    expect(res.headers[CORRELATION_ID_HEADER]).toMatch(UUID_PATTERN);
  });

  it("generates a correlation id when the inbound one is invalid (too long)", () => {
    const middleware = new RequestContextMiddleware();
    const res = fakeRes();
    const tooLong = "x".repeat(65); // correlationIdSchema caps at 64 chars

    middleware.use(fakeReq({ "x-correlation-id": tooLong }), res, vi.fn());

    expect(res.headers[CORRELATION_ID_HEADER]).toMatch(UUID_PATTERN);
  });

  it("makes both ids available downstream via AsyncLocalStorage", () => {
    const middleware = new RequestContextMiddleware();
    const res = fakeRes();
    let observed: ReturnType<typeof getRequestContext>;

    middleware.use(fakeReq({ "x-correlation-id": "turn_7f3a" }), res, () => {
      observed = getRequestContext();
    });

    expect(observed).toEqual({
      requestId: res.headers[REQUEST_ID_HEADER],
      correlationId: "turn_7f3a",
    });
    // Outside the middleware's `next()` call, there is no active context.
    expect(requestContextStorage.getStore()).toBeUndefined();
  });
});
