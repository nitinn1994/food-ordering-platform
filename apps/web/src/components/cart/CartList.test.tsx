import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { CartList } from "./CartList";
import { EMPTY_CART, errorReply, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CartList — empty state", () => {
  it("shows the empty state with a link back to the menu", async () => {
    await renderWithCart(<CartList />, { cart: EMPTY_CART });

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /browse the menu/i }),
    ).toHaveAttribute("href", "/");
  });

  it("renders no quantity controls or totals when empty", async () => {
    await renderWithCart(<CartList />, { cart: EMPTY_CART });

    expect(
      screen.queryByRole("button", { name: /quantity/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
  });

  it("does not show a link to checkout when empty (AC2)", async () => {
    await renderWithCart(<CartList />, { cart: EMPTY_CART });

    expect(
      screen.queryByRole("link", { name: /proceed to checkout/i }),
    ).not.toBeInTheDocument();
  });
});

describe("CartList — with items", () => {
  it("renders every line with name, quantity controls, and the backend's subtotal", async () => {
    await renderWithCart(<CartList />, {
      cart: pricedCart([
        { itemId: "tiramisu", quantity: 1 },
        { itemId: "garlic-bread", quantity: 1 },
      ]),
    });

    expect(screen.getByText("Tiramisu")).toBeInTheDocument();
    expect(screen.getByText("Garlic Bread")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase quantity of Tiramisu" }),
    ).toBeInTheDocument();
    // tiramisu (750) + garlic-bread (595) = 1345 cents = $13.45.
    expect(screen.getByText("Total: $13.45")).toBeInTheDocument();
  });

  it("shows a link to checkout once the cart has a line (AC2)", async () => {
    await renderWithCart(<CartList />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
    });

    expect(
      screen.getByRole("link", { name: /proceed to checkout/i }),
    ).toHaveAttribute("href", "/checkout");
  });

  it("marks the list busy and disables every control while a change is in flight (Phase 11 AC6)", async () => {
    const response = deferred<Response>();
    const { container, user } = await renderWithCart(<CartList />, {
      cart: pricedCart([
        { itemId: "tiramisu", quantity: 2 },
        { itemId: "garlic-bread", quantity: 1 },
      ]),
      replies: [() => response.promise],
    });

    await user.click(screen.getByRole("button", { name: "Increase quantity of Tiramisu" }));

    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText("Total: $20.95")).toBeInTheDocument();

    await act(async () =>
      response.resolve(
        jsonResponse(
          pricedCart([
            { itemId: "tiramisu", quantity: 3 },
            { itemId: "garlic-bread", quantity: 1 },
          ]),
        ),
      ),
    );
    expect(screen.getByText("Total: $28.45")).toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
  });
});

describe("CartList — unavailable lines (Phase 11 AC8)", () => {
  it("flags the line, disables its stepper, keeps Remove, and blocks checkout", async () => {
    await renderWithCart(<CartList />, {
      cart: pricedCart([
        { itemId: "tiramisu", quantity: 2, available: false },
        { itemId: "garlic-bread", quantity: 1 },
      ]),
    });

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase quantity of Tiramisu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity of Tiramisu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Tiramisu from cart" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Increase quantity of Garlic Bread" })).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: /proceed to checkout/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/remove them to continue to checkout/i)).toBeInTheDocument();
  });
});

describe("CartList — load failure", () => {
  it("offers Try again, which re-reads the cart", async () => {
    const { user } = await renderWithCart(<CartList />, {
      cart: errorReply(500, "INTERNAL_ERROR"),
      replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }],
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on our side. Please try again.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("Tiramisu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
