import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartPanel } from "./CartPanel";
import { CartProvider, useCart } from "../../lib/state/cartStore";
import { UiProvider } from "../../lib/state/uiStore";
import { MENU } from "../../lib/fixtures/menu";

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

function renderPanel() {
  return render(
    <UiProvider>
      <CartProvider>
        <AddTiramisuButton />
        <CartPanel categories={MENU} />
      </CartProvider>
    </UiProvider>,
  );
}

describe("CartPanel — compact summary", () => {
  it("shows the empty state and no 'View cart' link when the cart is empty", () => {
    renderPanel();

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /view cart/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the item count, subtotal, and a link to /cart once an item is added", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(
      screen.getByRole("heading", { name: "Cart (1)" }),
    ).toBeInTheDocument();
    // tiramisu is 750 cents in the fixture menu.
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view cart/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });
});
