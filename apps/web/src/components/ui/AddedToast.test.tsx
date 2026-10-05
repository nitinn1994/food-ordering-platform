import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { AddedToast, ADDED_TOAST_MS } from "./AddedToast";
import { useCart } from "../../lib/state/cartStore";
import { EMPTY_CART, errorReply, pricedCart, renderWithCart } from "../../test/cart";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function AddButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add
    </button>
  );
}

// mcdelivery-parity AC7: the toast follows a backend-confirmed add only.
describe("AddedToast", () => {
  it("names the added line once commerce-api confirms it, then goes away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await renderWithCart(
      <>
        <AddedToast />
        <AddButton />
      </>,
      { cart: EMPTY_CART, replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "add" }));
    expect(await screen.findByText("Tiramisu added to cart")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(ADDED_TOAST_MS);
    });
    expect(screen.queryByText("Tiramisu added to cart")).not.toBeInTheDocument();
  });

  it("shows nothing when the add fails", async () => {
    const { user } = await renderWithCart(
      <>
        <AddedToast />
        <AddButton />
      </>,
      { cart: EMPTY_CART, replies: [errorReply(500, "INTERNAL_ERROR")] },
    );

    await user.click(screen.getByRole("button", { name: "add" }));
    await act(async () => {});

    expect(screen.queryByText(/added to cart/)).not.toBeInTheDocument();
  });

  it("is hidden from assistive technology — CartAnnouncer speaks for cart changes", async () => {
    const { container } = await renderWithCart(<AddedToast />, { cart: EMPTY_CART });

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
