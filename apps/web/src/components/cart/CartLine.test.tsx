import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartLine } from "./CartLine";
import { CartProvider } from "../../lib/state/cartStore";
import { MENU } from "../../lib/fixtures/menu";

describe("CartLine — AC3 (accessible remove button)", () => {
  it("names the item in the remove button's accessible name", () => {
    render(
      <CartProvider categories={MENU}>
        <ul>
          <CartLine line={{ itemId: "tiramisu", quantity: 1 }} />
        </ul>
      </CartProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Remove Tiramisu from cart" }),
    ).toBeInTheDocument();
  });

  it("distinguishes multiple lines by accessible name", () => {
    render(
      <CartProvider categories={MENU}>
        <ul>
          <CartLine line={{ itemId: "tiramisu", quantity: 1 }} />
          <CartLine line={{ itemId: "garlic-bread", quantity: 2 }} />
        </ul>
      </CartProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Remove Tiramisu from cart" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Garlic Bread from cart" }),
    ).toBeInTheDocument();
  });
});
