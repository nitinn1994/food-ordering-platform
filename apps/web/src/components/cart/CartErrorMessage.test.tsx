import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { CartErrorMessage } from "./CartErrorMessage";
import { useCart } from "../../lib/state/cartStore";
import { EMPTY_CART, errorReply, renderWithCart } from "../../test/cart";

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

describe("CartErrorMessage", () => {
  it("renders nothing when there is no error", async () => {
    await renderWithCart(<CartErrorMessage />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Dismiss for a failed change on a loaded cart", async () => {
    const { user } = await renderWithCart(
      <>
        <AddTiramisuButton />
        <CartErrorMessage />
      </>,
      { cart: EMPTY_CART, replies: [errorReply(409, "CART_CONFLICT"), { body: EMPTY_CART }] },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your cart was updated. Please check it and try again.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "add tiramisu" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Try again when the cart never loaded", async () => {
    await renderWithCart(<CartErrorMessage />, { cart: { networkError: true } , replies: [{ networkError: true }, { networkError: true }] });

    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We can't reach the restaurant right now. Check your connection and try again.",
    );
  });
});
