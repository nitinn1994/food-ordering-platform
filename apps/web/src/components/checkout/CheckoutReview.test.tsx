import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutReview } from "./CheckoutReview";
import type {
  CustomerDetails,
  SimulatedOrderLine,
} from "../../lib/checkout/types";

const LINES: SimulatedOrderLine[] = [
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
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
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
});
