import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartAnnouncer } from "./CartAnnouncer";
import { CartProvider, useCart } from "../../lib/state/cartStore";

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

describe("CartAnnouncer", () => {
  it("renders an empty, polite live region on mount", () => {
    render(
      <CartProvider>
        <CartAnnouncer />
      </CartProvider>,
    );

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
  });

  it("announces the new item count after a cart change", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CartAnnouncer />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(screen.getByRole("status")).toHaveTextContent("1 item in cart.");
  });

  it("uses plural phrasing for more than one item", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CartAnnouncer />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(screen.getByRole("status")).toHaveTextContent("2 items in cart.");
  });
});
