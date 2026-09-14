import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartList } from "./CartList";
import { CartProvider, useCart } from "../../lib/state/cartStore";
import { MENU } from "../../lib/fixtures/menu";

function AddButtons() {
  const { addItem } = useCart();
  return (
    <>
      <button type="button" onClick={() => addItem("tiramisu")}>
        add tiramisu
      </button>
      <button type="button" onClick={() => addItem("garlic-bread")}>
        add garlic bread
      </button>
    </>
  );
}

describe("CartList — empty state", () => {
  it("shows the empty state with a link back to the menu", () => {
    render(
      <CartProvider>
        <CartList categories={MENU} />
      </CartProvider>,
    );

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /browse the menu/i }),
    ).toHaveAttribute("href", "/");
  });

  it("renders no quantity controls or totals when empty", () => {
    render(
      <CartProvider>
        <CartList categories={MENU} />
      </CartProvider>,
    );

    expect(
      screen.queryByRole("button", { name: /quantity/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
  });
});

describe("CartList — with items", () => {
  it("renders every line with name, quantity controls, and the cart subtotal", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddButtons />
        <CartList categories={MENU} />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    await user.click(
      screen.getByRole("button", { name: "add garlic bread" }),
    );

    expect(screen.getByText("Tiramisu")).toBeInTheDocument();
    expect(screen.getByText("Garlic Bread")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toBeInTheDocument();
    // tiramisu (750) + garlic-bread (595) = 1345 cents = $13.45.
    expect(screen.getByText("Total: $13.45")).toBeInTheDocument();
  });
});
