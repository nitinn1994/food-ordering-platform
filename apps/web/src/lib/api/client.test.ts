import { afterEach, describe, expect, it, vi } from "vitest";
import { cartResponseSchema } from "@contracts/api-contracts";
import { createFetchStub } from "../../test/fetchStub";
import { DEFAULT_TIMEOUT_MS, RETRY_DELAYS_MS, request } from "./client";
import { ApiError } from "./errors";

const EMPTY_CART = { items: [], itemCount: 0, subtotalCents: 0 };
const BASE = "http://api.test";

function setup() {
  const stub = createFetchStub();
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
  const deps = { fetchImpl: stub.fetch, baseUrl: BASE, sleep };
  return { stub, sleep, deps };
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the request to reject");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("request — success", () => {
  it("returns the schema-validated body", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: EMPTY_CART });

    await expect(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    ).resolves.toEqual(EMPTY_CART);
    expect(stub.calls[0]?.url).toBe(`${BASE}/v1/cart`);
  });

  it("sends GET and DELETE with no body and no Content-Type", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: EMPTY_CART }, { body: EMPTY_CART });

    await request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps);
    await request(
      { method: "DELETE", path: "/v1/cart/items/tiramisu", schema: cartResponseSchema },
      deps,
    );

    for (const call of stub.calls) {
      expect(call.body).toBeUndefined();
      expect(call.headers["Content-Type"]).toBeUndefined();
      expect(call.headers.Accept).toBe("application/json");
    }
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "DELETE"]);
  });

  it("sends a JSON body with Content-Type for POST and PATCH", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: EMPTY_CART });

    await request(
      {
        method: "POST",
        path: "/v1/cart/items",
        body: { itemId: "tiramisu", quantity: 1 },
        schema: cartResponseSchema,
      },
      deps,
    );

    expect(stub.calls[0]).toMatchObject({
      method: "POST",
      body: { itemId: "tiramisu", quantity: 1 },
      headers: { "Content-Type": "application/json" },
    });
  });

  it("never lets the response be served from an HTTP cache", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: EMPTY_CART });

    await request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps);

    expect(stub.fetch).toHaveBeenCalledWith(
      `${BASE}/v1/cart`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});

describe("request — failures", () => {
  it("parses a ContractError body into code and field, never keeping its message", async () => {
    const { stub, deps } = setup();
    stub.reply({
      status: 400,
      body: { code: "INVALID_PAYLOAD", message: "customer.phone: Invalid string", field: "customer.phone" },
      headers: { "x-request-id": "req-42" },
    });

    const error = await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(error).toMatchObject({
      kind: "http",
      status: 400,
      code: "INVALID_PAYLOAD",
      field: "customer.phone",
      requestId: "req-42",
    });
    expect(error.message).not.toContain("Invalid string");
  });

  it("keeps only the status for a non-JSON error body", async () => {
    const { stub, deps } = setup();
    stub.reply({ status: 502, rawBody: "<html>Bad Gateway</html>" });

    const error = await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(error.kind).toBe("http");
    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
  });

  it("rejects a 2xx body that does not match the contract", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { items: [], itemCount: 0 } });

    const error = await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(error.kind).toBe("invalid-response");
  });

  it("rejects an empty 2xx body", async () => {
    const { stub, deps } = setup();
    stub.reply({ rawBody: "" });

    const error = await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(error.kind).toBe("invalid-response");
  });

  it("maps a fetch rejection to a network error", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true });

    const error = await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(error.kind).toBe("network");
  });

  it("aborts and reports a timeout when the API does not answer in time", async () => {
    vi.useFakeTimers();
    const { stub, deps } = setup();
    stub.reply(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const pending = rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);

    expect((await pending).kind).toBe("timeout");
  });
});

describe("request — retries", () => {
  it("does not retry unless the caller opts in", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true });

    await rejection(
      request({ method: "GET", path: "/v1/cart", schema: cartResponseSchema }, deps),
    );

    expect(stub.calls).toHaveLength(1);
  });

  it("retries a network failure and a 503 with backoff, then succeeds", async () => {
    const { stub, deps, sleep } = setup();
    stub.reply(
      { networkError: true },
      { status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "Service unavailable." } },
      { body: EMPTY_CART },
    );

    await expect(
      request(
        { method: "GET", path: "/v1/cart", schema: cartResponseSchema, retry: true },
        deps,
      ),
    ).resolves.toEqual(EMPTY_CART);

    expect(stub.calls).toHaveLength(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([...RETRY_DELAYS_MS]);
  });

  it("gives up after the bounded number of retries", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true }, { networkError: true }, { networkError: true });

    const error = await rejection(
      request(
        { method: "GET", path: "/v1/cart", schema: cartResponseSchema, retry: true },
        deps,
      ),
    );

    expect(error.kind).toBe("network");
    expect(stub.calls).toHaveLength(1 + RETRY_DELAYS_MS.length);
  });

  it("never retries a 4xx, even when opted in", async () => {
    const { stub, deps } = setup();
    stub.reply({ status: 409, body: { code: "CART_CONFLICT", message: "Retry." } });

    await rejection(
      request(
        { method: "GET", path: "/v1/cart", schema: cartResponseSchema, retry: true },
        deps,
      ),
    );

    expect(stub.calls).toHaveLength(1);
  });

  it("repeats an opted-in POST with an identical body", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true }, { body: EMPTY_CART });
    const body = { idempotencyKey: "k-1", customer: { fullName: "Ada", phone: "5551234" } };

    await request(
      { method: "POST", path: "/v1/orders", body, schema: cartResponseSchema, retry: true },
      deps,
    );

    expect(stub.calls.map((call) => call.body)).toEqual([body, body]);
  });
});
