import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { CartLine as CartLineData } from "@contracts/api-contracts";
import { CartLine } from "./CartLine";
import { CartProvider } from "../../lib/state/cartStore";
import { UiProvider } from "../../lib/state/uiStore";
import { pricedCart, renderWithCart } from "../../test/cart";
import styles from "./CartLine.module.css";

afterEach(() => {
  vi.unstubAllGlobals();
});

function line(itemId: string, quantity: number, available?: boolean): CartLineData {
  const [result] = pricedCart([{ itemId, quantity, available }]).items;
  if (!result) {
    throw new Error("pricedCart returned no line");
  }
  return result;
}

describe("CartLine — AC3 (accessible remove button)", () => {
  it("names the item in the remove button's accessible name", async () => {
    await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 1)} />
      </ul>,
    );

    expect(
      screen.getByRole("button", { name: "Remove Tiramisu from cart" }),
    ).toBeInTheDocument();
  });

  it("distinguishes multiple lines by accessible name", async () => {
    await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 1)} />
        <CartLine line={line("garlic-bread", 2)} />
      </ul>,
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
  it("shows the backend's line subtotal as-is (Phase 11 AC4)", async () => {
    await renderWithCart(
      <ul>
        <CartLine line={{ ...line("garlic-bread", 2), lineSubtotalCents: 1111 }} />
      </ul>,
    );

    expect(screen.getByText("$11.11")).toBeInTheDocument();
  });

  it("sets the absolute quantity q+1 / q-1 via PATCH (Phase 11 AC5)", async () => {
    const { stub, user } = await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 2)} />
      </ul>,
      {
        replies: [
          { body: pricedCart([{ itemId: "tiramisu", quantity: 3 }]) },
          { body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) },
        ],
      },
    );

    await user.click(screen.getByRole("button", { name: "Increase quantity of Tiramisu" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity of Tiramisu" }));

    expect(stub.calls.slice(1)).toMatchObject([
      { method: "PATCH", url: "/api/commerce/v1/cart/items/tiramisu", body: { quantity: 3 } },
      { method: "PATCH", url: "/api/commerce/v1/cart/items/tiramisu", body: { quantity: 1 } },
    ]);
  });

  it("removes via DELETE", async () => {
    const { stub, user } = await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 2)} />
      </ul>,
      { replies: [{ body: pricedCart([]) }] },
    );

    await user.click(screen.getByRole("button", { name: "Remove Tiramisu from cart" }));

    expect(stub.calls[1]).toMatchObject({
      method: "DELETE",
      url: "/api/commerce/v1/cart/items/tiramisu",
    });
  });

  it("tab order within a line is decrease, increase, then remove", async () => {
    const { user } = await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 2)} />
      </ul>,
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

  it("briefly highlights the line after its confirmed quantity changes", async () => {
    const { rerender, container } = await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 1)} />
      </ul>,
    );

    expect(container.querySelector("li")).not.toHaveClass(
      styles.changed as string,
    );

    // renderWithCart wraps in providers; rerender must too.
    rerender(
      <UiProvider>
        <CartProvider>
          <ul>
            <CartLine line={line("tiramisu", 2)} />
          </ul>
        </CartProvider>
      </UiProvider>,
    );

    expect(container.querySelector("li")).toHaveClass(
      styles.changed as string,
    );
  });
});

describe("CartLine — unavailable (Phase 11 AC8)", () => {
  it("is labelled Unavailable, with only Remove enabled", async () => {
    await renderWithCart(
      <ul>
        <CartLine line={line("tiramisu", 2, false)} />
      </ul>,
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase quantity of Tiramisu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity of Tiramisu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Tiramisu from cart" })).toBeEnabled();
  });
});
