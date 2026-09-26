import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { CartAnnouncer } from "./CartAnnouncer";
import { useCart } from "../../lib/state/cartStore";
import { EMPTY_CART, pricedCart, renderWithCart } from "../../test/cart";

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

describe("CartAnnouncer", () => {
  it("renders an empty, polite live region on mount", async () => {
    await renderWithCart(<CartAnnouncer />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
  });

  it("does not announce the cart arriving on first load (Phase 11)", async () => {
    await renderWithCart(<CartAnnouncer />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 3 }]),
    });

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces the new item count after a confirmed cart change", async () => {
    const { user } = await renderWithCart(
      <>
        <AddTiramisuButton />
        <CartAnnouncer />
      </>,
      { cart: EMPTY_CART, replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(await screen.findByText("1 item in cart.")).toBeInTheDocument();
  });

  it("uses plural phrasing for more than one item", async () => {
    const { user } = await renderWithCart(
      <>
        <AddTiramisuButton />
        <CartAnnouncer />
      </>,
      {
        cart: EMPTY_CART,
        replies: [
          { body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) },
          { body: pricedCart([{ itemId: "tiramisu", quantity: 2 }]) },
        ],
      },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    await screen.findByText("1 item in cart.");
    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(await screen.findByText("2 items in cart.")).toBeInTheDocument();
  });
});
