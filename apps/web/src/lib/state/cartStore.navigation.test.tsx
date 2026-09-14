import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartProvider, useCart } from "./cartStore";

// Simulates what a route change does to the component tree: the "page"
// content is swapped out, but CartProvider stays mounted, because it now
// lives in app/layout.tsx, above every route's page.tsx (Phase 3.2's
// provider hoist). RTL cannot drive the real Next.js router, so this proves
// the mechanism the hoist relies on — the same provider instance surviving
// a child swap — rather than the router itself. See AC13,
// docs/features/phase-3-frontend-cart-simulation/plan.md.

function AddButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

function CartCount() {
  const { itemCount } = useCart();
  return <span>count: {itemCount}</span>;
}

function PageA() {
  return (
    <div>
      <AddButton />
      <CartCount />
    </div>
  );
}

function PageB() {
  return (
    <div>
      <CartCount />
    </div>
  );
}

describe("CartProvider — survives a simulated route swap", () => {
  it("keeps cart state when the mounted page child changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CartProvider>
        <PageA />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    expect(screen.getByText("count: 1")).toBeInTheDocument();

    rerender(
      <CartProvider>
        <PageB />
      </CartProvider>,
    );

    expect(screen.getByText("count: 1")).toBeInTheDocument();
  });
});
