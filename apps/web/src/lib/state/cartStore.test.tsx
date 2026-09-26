import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { useCart } from "./cartStore";
import {
  EMPTY_CART,
  cartReply,
  errorReply,
  pricedCart,
  renderWithCart,
} from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";

// The provider as a holder of commerce-api's cart — Phase 11 AC4–AC7, AC9.
// The Phase 3 cart rules this file used to test (merge, 99 cap, no zero)
// are now the backend's, covered by commerce-api's own cart tests.

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  const cart = useCart();
  return (
    <div>
      <p data-testid="status">{cart.status}</p>
      <p data-testid="count">{cart.itemCount}</p>
      <p data-testid="pending">{cart.pending ? `${cart.pending.op}:${cart.pending.itemId}` : "none"}</p>
      <p data-testid="error">{cart.errorMessage ?? "none"}</p>
      <p data-testid="lines">
        {cart.cart?.items.map((line) => `${line.itemId}×${line.quantity}`).join(",") ?? "null"}
      </p>
      <button type="button" onClick={() => cart.addItem("tiramisu")}>add</button>
      <button type="button" onClick={() => cart.setQuantity("tiramisu", 3)}>set 3</button>
      <button type="button" onClick={() => cart.removeItem("tiramisu")}>remove</button>
      <button type="button" onClick={() => void cart.refresh()}>refresh</button>
      <button type="button" onClick={cart.dismissError}>dismiss</button>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe("CartProvider — loading", () => {
  it("loads GET /v1/cart on mount and exposes the body as-is", async () => {
    const cart = pricedCart([{ itemId: "tiramisu", quantity: 2 }]);
    const { stub } = await renderWithCart(<Probe />, { cart });

    expect(stub.calls[0]).toMatchObject({ method: "GET", url: "/api/commerce/v1/cart" });
    expect(text("status")).toBe("ready");
    expect(text("lines")).toBe("tiramisu×2");
    expect(text("count")).toBe("2");
  });

  it("reports loading, with no cart and a count of 0, until the backend answers", async () => {
    const response = deferred<Response>();
    const { stub } = await renderWithCart(<Probe />, { cart: () => response.promise });

    expect(text("status")).toBe("loading");
    expect(text("lines")).toBe("null");

    await act(async () => response.resolve(jsonResponse(EMPTY_CART)));
    expect(text("status")).toBe("ready");
    expect(stub.calls).toHaveLength(1);
  });

  it("is in the error state, with a friendly message, when the first load fails", async () => {
    await renderWithCart(<Probe />, {
      cart: errorReply(500, "INTERNAL_ERROR"),
    });

    await waitFor(() => expect(text("status")).toBe("error"));
    expect(text("error")).toBe("Something went wrong on our side. Please try again.");
    expect(text("lines")).toBe("null");
  });

  it("recovers from a failed load through refresh()", async () => {
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: errorReply(500, "INTERNAL_ERROR"),
      replies: [cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))],
    });
    await waitFor(() => expect(text("status")).toBe("error"));

    await user.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("error")).toBe("none");
    expect(text("lines")).toBe("tiramisu×1");
    expect(stub.calls).toHaveLength(2);
  });
});

describe("CartProvider — mutations replace the cart with the response (AC5)", () => {
  it.each([
    ["add", { method: "POST", url: "/api/commerce/v1/cart/items", body: { itemId: "tiramisu", quantity: 1 } }],
    ["set 3", { method: "PATCH", url: "/api/commerce/v1/cart/items/tiramisu", body: { quantity: 3 } }],
    ["remove", { method: "DELETE", url: "/api/commerce/v1/cart/items/tiramisu", body: undefined }],
  ])("%s sends the right request and shows exactly the response", async (button, expected) => {
    const response = pricedCart([{ itemId: "garlic-bread", quantity: 4 }]);
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
      replies: [cartReply(response)],
    });

    await user.click(screen.getByRole("button", { name: button }));

    await waitFor(() => expect(text("lines")).toBe("garlic-bread×4"));
    expect(stub.calls[1]).toMatchObject(expected);
    expect(text("count")).toBe("4");
    expect(stub.calls).toHaveLength(2);
  });
});

describe("CartProvider — pending (AC6)", () => {
  it("changes nothing until the backend answers, and exposes the in-flight op", async () => {
    const response = deferred<Response>();
    const { user } = await renderWithCart(<Probe />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
      replies: [() => response.promise],
    });

    await user.click(screen.getByRole("button", { name: "set 3" }));

    expect(text("pending")).toBe("setQuantity:tiramisu");
    expect(text("lines")).toBe("tiramisu×1");

    await act(async () =>
      response.resolve(jsonResponse(pricedCart([{ itemId: "tiramisu", quantity: 3 }]))),
    );
    expect(text("pending")).toBe("none");
    expect(text("lines")).toBe("tiramisu×3");
  });

  it("ignores a second mutation while one is in flight", async () => {
    const response = deferred<Response>();
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: EMPTY_CART,
      replies: [() => response.promise],
    });

    await user.click(screen.getByRole("button", { name: "add" }));
    await user.click(screen.getByRole("button", { name: "add" }));
    await user.click(screen.getByRole("button", { name: "remove" }));

    expect(stub.calls.filter((call) => call.method !== "GET")).toHaveLength(1);
    await act(async () => response.resolve(jsonResponse(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))));
    expect(text("lines")).toBe("tiramisu×1");
  });
});

describe("CartProvider — response ordering (review finding #1)", () => {
  it("never lets a late initial load overwrite a newer mutation response", async () => {
    const initialLoad = deferred<Response>();
    const { user } = await renderWithCart(<Probe />, {
      cart: () => initialLoad.promise,
      replies: [cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))],
    });

    // The add is sent while the initial GET is still in flight, and its
    // response arrives first.
    await user.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() => expect(text("lines")).toBe("tiramisu×1"));

    // The older GET response then arrives — and must be ignored.
    await act(async () => initialLoad.resolve(jsonResponse(EMPTY_CART)));
    expect(text("lines")).toBe("tiramisu×1");
    expect(text("count")).toBe("1");
  });

  it("ignores a late failure of an older load, too", async () => {
    const initialLoad = deferred<Response>();
    const { user } = await renderWithCart(<Probe />, {
      cart: () => initialLoad.promise,
      replies: [cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))],
    });

    await user.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() => expect(text("lines")).toBe("tiramisu×1"));

    await act(async () =>
      initialLoad.resolve(
        jsonResponse({ code: "INTERNAL_ERROR", message: "x" }, 500),
      ),
    );
    expect(text("error")).toBe("none");
    expect(text("status")).toBe("ready");
  });
});

describe("CartProvider — failures (AC7)", () => {
  it.each([
    ["CART_CONFLICT", 409, "Your cart was updated. Please check it and try again."],
    ["MENU_ITEM_UNAVAILABLE", 422, "Sorry, that item is currently unavailable."],
    ["MENU_ITEM_NOT_FOUND", 404, "That item is no longer on the menu."],
    ["CART_ITEM_QUANTITY_LIMIT_EXCEEDED", 422, "You've reached the maximum quantity for this item."],
  ])("%s → friendly message, then one re-read, never a retry", async (code, status, message) => {
    const reread = pricedCart([{ itemId: "garlic-bread", quantity: 1 }]);
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: EMPTY_CART,
      replies: [errorReply(status, code), cartReply(reread)],
    });

    await user.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(text("lines")).toBe("garlic-bread×1"));
    expect(text("error")).toBe(message);
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
    expect(screen.queryByText(/Backend detail/)).toBeNull();
  });

  it("treats CART_ITEM_NOT_FOUND on remove as already removed — no message", async () => {
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
      replies: [errorReply(404, "CART_ITEM_NOT_FOUND"), cartReply(EMPTY_CART)],
    });

    await user.click(screen.getByRole("button", { name: "remove" }));

    await waitFor(() => expect(text("lines")).toBe(""));
    expect(text("error")).toBe("none");
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "DELETE", "GET"]);
  });

  it("never retries a POST after a network failure; it re-reads the cart instead", async () => {
    const { stub, user } = await renderWithCart(<Probe />, {
      cart: EMPTY_CART,
      replies: [{ networkError: true }, cartReply(EMPTY_CART)],
    });

    await user.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(text("pending")).toBe("none"));
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
    expect(text("error")).toBe(
      "We can't reach the restaurant right now. Check your connection and try again.",
    );
  });

  it("keeps the last confirmed cart on screen when the re-read also fails", async () => {
    const { user } = await renderWithCart(<Probe />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
      replies: [
        errorReply(409, "CART_CONFLICT"),
        errorReply(500, "INTERNAL_ERROR"),
      ],
    });

    await user.click(screen.getByRole("button", { name: "set 3" }));

    await waitFor(() => expect(text("pending")).toBe("none"));
    expect(text("status")).toBe("ready");
    expect(text("lines")).toBe("tiramisu×1");
    expect(text("error")).toBe("Something went wrong on our side. Please try again.");
  });

  it("clears the message on dismiss", async () => {
    const { user } = await renderWithCart(<Probe />, {
      cart: EMPTY_CART,
      replies: [errorReply(422, "MENU_ITEM_UNAVAILABLE"), cartReply(EMPTY_CART)],
    });
    await user.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() => expect(text("error")).not.toBe("none"));

    await user.click(screen.getByRole("button", { name: "dismiss" }));

    expect(text("error")).toBe("none");
  });
});
