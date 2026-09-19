import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutFlow } from "./CheckoutFlow";
import { CartProvider, useCart } from "../../lib/state/cartStore";
import { MENU } from "../../lib/fixtures/menu";

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

// Exposes cart line count without CartPanel/SiteNav (neither is mounted in
// these isolated component tests) — used to confirm the cart is genuinely
// empty after a simulated order is placed (AC16).
function CartLineCountProbe() {
  const { lines } = useCart();
  return <p data-testid="cart-line-count">{lines.length}</p>;
}

async function addItemAndFillValidDetails(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("button", { name: "add tiramisu" }));
  await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Phone number"), "5551234567");
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
}

describe("CheckoutFlow — empty-cart guard (AC3)", () => {
  it("renders the empty-cart notice and no form, total, or submit control", () => {
    render(
      <CartProvider>
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
  });
});

describe("CheckoutFlow — non-empty cart (AC1)", () => {
  it("renders the customer-details form instead of the empty-cart notice once an item is added", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("announces a validation failure through the checkout live region (AC9)", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));
    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "There are errors in the form. Please review and correct them.",
    );
  });

  it("advances to the review step, showing details and the order summary together (AC11)", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);

    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeInTheDocument();
  });

  it("returns from review to details with every value intact (AC12)", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Edit details" }));

    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone number")).toHaveValue("5551234567");
  });

  it("moves focus into the review step rather than leaving it on the button that just unmounted (AC19)", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);

    expect(
      screen.getByRole("heading", { name: "Review your order" }),
    ).toHaveFocus();
  });
});

describe("CheckoutFlow — placing an order (AC13–AC18)", () => {
  it("walks from review to a confirmation that survives the cart being cleared, without ever showing the empty-cart guard", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CartLineCountProbe />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    // Guard order matters here (AC15): the cart is now empty, but the
    // confirmed step still renders instead of the empty-cart notice — the
    // single likeliest defect named in the plan's risk table.
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    expect(screen.getByText(/^ORD-[A-Z0-9]{6}$/)).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the menu" }),
    ).toHaveAttribute("href", "/");

    // The cart itself is genuinely empty (AC16), not just visually hidden.
    expect(screen.getByTestId("cart-line-count")).toHaveTextContent("0");

    // Focus moved into the confirmation rather than being left on the
    // "Place order" button that just unmounted (AC19).
    expect(
      screen.getByRole("heading", { name: "Order confirmed" }),
    ).toHaveFocus();
  });

  it("announces the placed order through the checkout live region", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      /order placed\. your order number is ord-[a-z0-9]{6}\./i,
    );
  });

  it("states plainly that the order is simulated (AC17)", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <AddTiramisuButton />
        <CheckoutFlow categories={MENU} />
      </CartProvider>,
    );

    await addItemAndFillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(
      screen.getByText(/this is a simulated order/i),
    ).toBeInTheDocument();
  });
});
