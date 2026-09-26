import { describe, expect, it, vi } from "vitest";
import { createFetchStub } from "../../test/fetchStub";
import { ApiError } from "../api/errors";
import {
  addCartItem,
  getCart,
  removeCartItem,
  setCartItemQuantity,
} from "./cartService";

const BASE = "http://api.test";
const CART = {
  items: [
    {
      itemId: "tiramisu",
      name: "Tiramisu",
      unitPriceCents: 750,
      quantity: 2,
      lineSubtotalCents: 1500,
      available: true,
    },
  ],
  itemCount: 2,
  subtotalCents: 1500,
};

function setup() {
  const stub = createFetchStub();
  const deps = { fetchImpl: stub.fetch, baseUrl: BASE, sleep: vi.fn(async () => undefined) };
  return { stub, deps };
}

describe("cartService", () => {
  it("getCart → GET /v1/cart", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: CART });

    await expect(getCart(deps)).resolves.toEqual(CART);
    expect(stub.calls[0]).toMatchObject({ method: "GET", url: `${BASE}/v1/cart` });
  });

  it("getCart retries a transient failure", async () => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true }, { body: CART });

    await expect(getCart(deps)).resolves.toEqual(CART);
    expect(stub.calls).toHaveLength(2);
  });

  it("addCartItem → POST /v1/cart/items {itemId, quantity}", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: CART });

    await addCartItem("tiramisu", 1, deps);
    expect(stub.calls[0]).toMatchObject({
      method: "POST",
      url: `${BASE}/v1/cart/items`,
      body: { itemId: "tiramisu", quantity: 1 },
    });
  });

  it("setCartItemQuantity → PATCH /v1/cart/items/:itemId {quantity}", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: CART });

    await setCartItemQuantity("tiramisu", 3, deps);
    expect(stub.calls[0]).toMatchObject({
      method: "PATCH",
      url: `${BASE}/v1/cart/items/tiramisu`,
      body: { quantity: 3 },
    });
  });

  it("removeCartItem → DELETE /v1/cart/items/:itemId with no body", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: { items: [], itemCount: 0, subtotalCents: 0 } });

    await removeCartItem("tiramisu", deps);
    expect(stub.calls[0]).toMatchObject({
      method: "DELETE",
      url: `${BASE}/v1/cart/items/tiramisu`,
      body: undefined,
    });
  });

  it("encodes the item id into the path", async () => {
    const { stub, deps } = setup();
    stub.reply({ body: CART });

    await setCartItemQuantity("a/b", 1, deps);
    expect(stub.calls[0]?.url).toBe(`${BASE}/v1/cart/items/a%2Fb`);
  });

  it.each([
    ["addCartItem", (deps: Parameters<typeof getCart>[0]) => addCartItem("tiramisu", 1, deps)],
    ["setCartItemQuantity", (deps: Parameters<typeof getCart>[0]) => setCartItemQuantity("tiramisu", 2, deps)],
    ["removeCartItem", (deps: Parameters<typeof getCart>[0]) => removeCartItem("tiramisu", deps)],
  ])("%s is never retried automatically", async (_name, call) => {
    const { stub, deps } = setup();
    stub.reply({ networkError: true });

    await expect(call(deps)).rejects.toBeInstanceOf(ApiError);
    expect(stub.calls).toHaveLength(1);
  });
});
