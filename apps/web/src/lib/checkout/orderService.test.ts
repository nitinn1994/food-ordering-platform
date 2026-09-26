import { describe, expect, it, vi } from "vitest";
import { createFetchStub } from "../../test/fetchStub";
import { ApiError } from "../api/errors";
import {
  customerFieldErrorFor,
  placeOrder,
  toCreateOrderRequest,
} from "./orderService";

const BASE = "http://api.test";
const ORDER = {
  orderId: "9d3a5a7b-3458-41c1-8585-871e24db8cfd",
  status: "placed",
  placedAt: "2026-09-25T14:06:15.712Z",
  customer: { fullName: "Ada Lovelace", phone: "5551234" },
  items: [
    {
      itemId: "tiramisu",
      name: "Tiramisu",
      unitPriceCents: 750,
      quantity: 2,
      lineSubtotalCents: 1500,
    },
  ],
  itemCount: 2,
  subtotalCents: 1500,
  totalCents: 1500,
};

function setup() {
  const stub = createFetchStub();
  const deps = { fetchImpl: stub.fetch, baseUrl: BASE, sleep: vi.fn(async () => undefined) };
  return { stub, deps };
}

describe("toCreateOrderRequest", () => {
  it("trims every value and omits a blank email", () => {
    expect(
      toCreateOrderRequest(
        { fullName: "  Ada Lovelace ", phone: " 555 1234 ", email: "   " },
        "key-1",
      ),
    ).toEqual({
      idempotencyKey: "key-1",
      customer: { fullName: "Ada Lovelace", phone: "555 1234" },
    });
  });

  it("keeps a given email, trimmed", () => {
    expect(
      toCreateOrderRequest(
        { fullName: "Ada", phone: "5551234", email: " ada@example.com " },
        "key-1",
      ).customer,
    ).toEqual({ fullName: "Ada", phone: "5551234", email: "ada@example.com" });
  });
});

describe("placeOrder", () => {
  it("POSTs only the key and customer to /v1/orders", async () => {
    const { stub, deps } = setup();
    stub.reply({ status: 201, body: ORDER });
    const body = toCreateOrderRequest(
      { fullName: "Ada Lovelace", phone: "5551234", email: "" },
      "key-1",
    );

    await expect(placeOrder(body, deps)).resolves.toEqual(ORDER);
    expect(stub.calls[0]).toMatchObject({
      method: "POST",
      url: `${BASE}/v1/orders`,
      body: { idempotencyKey: "key-1", customer: { fullName: "Ada Lovelace", phone: "5551234" } },
    });
    expect(Object.keys(stub.calls[0]?.body as object)).toEqual(["idempotencyKey", "customer"]);
  });

  it("retries a transient failure with the same idempotency key", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true }, { status: 201, body: ORDER });
    const body = toCreateOrderRequest({ fullName: "Ada", phone: "5551234", email: "" }, "key-1");

    await placeOrder(body, deps);

    expect(stub.calls.map((call) => (call.body as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "key-1",
      "key-1",
    ]);
  });

  it("rejects a request that breaks the contract without calling the API", async () => {
    const { stub, deps } = setup();

    const result = placeOrder(
      { idempotencyKey: "key-1", customer: { fullName: "Ada", phone: "12" } },
      deps,
    );

    await expect(result).rejects.toMatchObject({
      kind: "http",
      status: 400,
      code: "INVALID_PAYLOAD",
      field: "customer.phone",
    });
    expect(stub.calls).toHaveLength(0);
  });
});

describe("customerFieldErrorFor", () => {
  it.each([
    ["customer.fullName", "fullName"],
    ["customer.phone", "phone"],
    ["customer.email", "email"],
  ] as const)("%s → the %s form field", (apiField, formField) => {
    const result = customerFieldErrorFor(
      new ApiError({ kind: "http", status: 400, code: "INVALID_PAYLOAD", field: apiField }),
    );
    expect(result?.field).toBe(formField);
    expect(result?.message).toEqual(expect.any(String));
  });

  it("is null for anything that is not a customer field error", () => {
    expect(
      customerFieldErrorFor(
        new ApiError({ kind: "http", status: 400, code: "INVALID_PAYLOAD", field: "idempotencyKey" }),
      ),
    ).toBeNull();
    expect(
      customerFieldErrorFor(new ApiError({ kind: "http", status: 422, code: "CART_EMPTY" })),
    ).toBeNull();
    expect(customerFieldErrorFor(new ApiError({ kind: "network" }))).toBeNull();
    expect(customerFieldErrorFor(new Error("x"))).toBeNull();
  });
});
