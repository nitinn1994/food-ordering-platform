import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteNav } from "./SiteNav";
import { CartProvider, useCart } from "../../lib/state/cartStore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

describe("SiteNav", () => {
  it("shows Menu and Cart links with the current cart count", () => {
    render(
      <CartProvider>
        <SiteNav />
      </CartProvider>,
    );

    expect(screen.getByRole("link", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cart (0)" })).toBeInTheDocument();
  });

  it("marks the current route with aria-current", () => {
    render(
      <CartProvider>
        <SiteNav />
      </CartProvider>,
    );

    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Cart (0)" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("updates the cart count when an item is added", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <SiteNav />
        <AddTiramisuButton />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(screen.getByRole("link", { name: "Cart (1)" })).toBeInTheDocument();
  });
});
