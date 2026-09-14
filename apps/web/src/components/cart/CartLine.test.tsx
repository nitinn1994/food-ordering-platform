import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartLine } from "./CartLine";
import { CartProvider } from "../../lib/state/cartStore";
import { findMenuItem } from "../../lib/fixtures/menu";
import styles from "./CartLine.module.css";

function requireMenuItem(itemId: string) {
  const item = findMenuItem(itemId);
  if (!item) {
    throw new Error(`fixture missing expected item: ${itemId}`);
  }
  return item;
}

describe("CartLine — AC3 (accessible remove button)", () => {
  it("names the item in the remove button's accessible name", () => {
    render(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "tiramisu", quantity: 1 }}
            item={requireMenuItem("tiramisu")}
          />
        </ul>
      </CartProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Remove Tiramisu from cart" }),
    ).toBeInTheDocument();
  });

  it("distinguishes multiple lines by accessible name", () => {
    render(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "tiramisu", quantity: 1 }}
            item={requireMenuItem("tiramisu")}
          />
          <CartLine
            line={{ itemId: "garlic-bread", quantity: 2 }}
            item={requireMenuItem("garlic-bread")}
          />
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

describe("CartLine — quantity controls and subtotal", () => {
  it("shows the line subtotal as price × quantity", () => {
    render(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "garlic-bread", quantity: 2 }}
            item={requireMenuItem("garlic-bread")}
          />
        </ul>
      </CartProvider>,
    );

    // garlic-bread is 595 cents in the fixture menu; 595 * 2 = 1190 = $11.90.
    expect(screen.getByText("$11.90")).toBeInTheDocument();
  });

  it("tab order within a line is decrease, increase, then remove", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "tiramisu", quantity: 2 }}
            item={requireMenuItem("tiramisu")}
          />
        </ul>
      </CartProvider>,
    );

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Remove Tiramisu from cart" }),
    ).toHaveFocus();
  });

  it("briefly highlights the line after its quantity changes", () => {
    const { rerender, container } = render(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "tiramisu", quantity: 1 }}
            item={requireMenuItem("tiramisu")}
          />
        </ul>
      </CartProvider>,
    );

    expect(container.querySelector("li")).not.toHaveClass(
      styles.changed as string,
    );

    rerender(
      <CartProvider>
        <ul>
          <CartLine
            line={{ itemId: "tiramisu", quantity: 2 }}
            item={requireMenuItem("tiramisu")}
          />
        </ul>
      </CartProvider>,
    );

    expect(container.querySelector("li")).toHaveClass(
      styles.changed as string,
    );
  });
});
