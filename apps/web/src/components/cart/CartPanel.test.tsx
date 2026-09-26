import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { CartPanel } from "./CartPanel";
import { useCart } from "../../lib/state/cartStore";
import { EMPTY_CART, errorReply, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";

afterEach(() => {
  vi.unstubAllGlobals();
});

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

describe("CartPanel — compact summary", () => {
  it("shows the empty state and no 'View cart' link when the cart is empty", async () => {
    await renderWithCart(<CartPanel />, { cart: EMPTY_CART });

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /view cart/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the backend's item count and subtotal, and a link to /cart", async () => {
    // Deliberately not unit × quantity: the panel must show what the
    // backend said, not recompute it (Phase 11 AC4).
    await renderWithCart(<CartPanel />, {
      cart: { ...pricedCart([{ itemId: "tiramisu", quantity: 2 }]), subtotalCents: 1234 },
    });

    expect(screen.getByRole("heading", { name: "Cart (2)" })).toBeInTheDocument();
    expect(screen.getByText("Total: $12.34")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view cart/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("updates from the response once an item is added", async () => {
    const { user } = await renderWithCart(
      <>
        <AddTiramisuButton />
        <CartPanel />
      </>,
      { replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(await screen.findByRole("heading", { name: "Cart (1)" })).toBeInTheDocument();
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
  });

  it("shows a loading state until the cart has loaded", async () => {
    const response = deferred<Response>();
    await renderWithCart(<CartPanel />, { cart: () => response.promise });

    expect(screen.getByRole("status")).toHaveTextContent("Loading your cart…");
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();

    await act(async () => response.resolve(jsonResponse(EMPTY_CART)));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("shows a failed add as an alert, in the backend's words never", async () => {
    const { user } = await renderWithCart(
      <>
        <AddTiramisuButton />
        <CartPanel />
      </>,
      { replies: [errorReply(422, "MENU_ITEM_UNAVAILABLE"), { body: EMPTY_CART }] },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sorry, that item is currently unavailable.",
    );
    await waitFor(() => expect(screen.queryByText(/Backend detail/)).toBeNull());
  });
});
