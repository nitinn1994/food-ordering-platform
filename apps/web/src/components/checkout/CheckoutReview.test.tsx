import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutReview } from "./CheckoutReview";
import type { OrderLine } from "@contracts/api-contracts";
import type { CustomerDetails } from "../../lib/checkout/types";
import { ApiError } from "../../lib/api/errors";

const LINES: OrderLine[] = [
  {
    itemId: "tiramisu",
    name: "Tiramisu",
    unitPriceCents: 750,
    quantity: 1,
    lineSubtotalCents: 750,
  },
];

const DETAILS: CustomerDetails = {
  fullName: "Ada Lovelace",
  phone: "5551234567",
  email: "",
};

function renderReview(overrides: Partial<Parameters<typeof CheckoutReview>[0]> = {}) {
  return render(
    <CheckoutReview
      details={DETAILS}
      lines={LINES}
      totalCents={750}
      submitting={false}
      onEditDetails={() => {}}
      onPlaceOrder={() => {}}
      {...overrides}
    />,
  );
}

describe("CheckoutReview", () => {
  it("shows the entered details and the order summary together (AC11)", () => {
    renderReview();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("5551234567")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
  });

  it("omits the email row when no email was provided", () => {
    renderReview();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("shows the email row when one was provided", () => {
    renderReview({ details: { ...DETAILS, email: "ada@example.com" } });
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("returns to details when Edit details is clicked (AC12)", async () => {
    const user = userEvent.setup();
    const onEditDetails = vi.fn();
    renderReview({ onEditDetails });

    await user.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEditDetails).toHaveBeenCalledOnce();
  });

  it("places the order when Place order is clicked", async () => {
    const user = userEvent.setup();
    const onPlaceOrder = vi.fn();
    renderReview({ onPlaceOrder });

    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(onPlaceOrder).toHaveBeenCalledOnce();
  });

  it("disables both actions while submitting (AC13)", () => {
    renderReview({ submitting: true });
    // Labelled "Placing order…" while submitting since Phase 11.
    expect(screen.getByRole("button", { name: "Placing order…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit details" }),
    ).toBeDisabled();
  });

  it("offers a way back to the cart", () => {
    renderReview();
    expect(
      screen.getByRole("link", { name: "Back to cart" }),
    ).toHaveAttribute("href", "/cart");
  });

  it("focuses its own heading on mount — the details→review transition (AC19)", () => {
    renderReview();
    expect(
      screen.getByRole("heading", { name: "Review your order" }),
    ).toHaveFocus();
  });

  it("reads Placing order… and is busy while submitting (Phase 11)", () => {
    const { container } = renderReview({ submitting: true });
    expect(screen.getByRole("button", { name: "Placing order…" })).toBeDisabled();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("shows a failed placement in friendly copy, never the backend's words (Phase 11 AC13)", () => {
    renderReview({
      submitError: new ApiError({ kind: "http", status: 422, code: "MENU_ITEM_UNAVAILABLE" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An item in your cart is no longer available. Please review your cart.",
    );
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
  });

  it("disables Place order while any item is unavailable (Phase 11 AC8)", () => {
    renderReview({ hasUnavailableItems: true });
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(screen.getByText(/some items in your cart are unavailable/i)).toBeInTheDocument();
  });
});
