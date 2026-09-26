import { describe, expect, it } from "vitest";
import { ApiError, isRetryable } from "./errors";

describe("ApiError", () => {
  it("carries kind, status, code, field and requestId", () => {
    const error = new ApiError({
      kind: "http",
      status: 400,
      code: "INVALID_PAYLOAD",
      field: "customer.phone",
      requestId: "req-1",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error).toMatchObject({
      kind: "http",
      status: 400,
      code: "INVALID_PAYLOAD",
      field: "customer.phone",
      requestId: "req-1",
    });
  });

  it("has a developer summary that names no field value", () => {
    expect(new ApiError({ kind: "http", status: 409, code: "CART_CONFLICT" }).message).toBe(
      "Commerce API request failed (http 409 CART_CONFLICT)",
    );
    expect(new ApiError({ kind: "network" }).message).toBe(
      "Commerce API request failed (network)",
    );
  });
});

describe("isRetryable", () => {
  it.each([
    [{ kind: "network" as const }, true],
    [{ kind: "timeout" as const }, true],
    [{ kind: "http" as const, status: 503 }, true],
    [{ kind: "http" as const, status: 500 }, false],
    [{ kind: "http" as const, status: 409 }, false],
    [{ kind: "http" as const, status: 422 }, false],
    [{ kind: "invalid-response" as const, status: 200 }, false],
  ])("%o → %s", (init, expected) => {
    expect(isRetryable(new ApiError(init))).toBe(expected);
  });
});
