import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderConfirmation } from "./OrderConfirmation";
import type { SimulatedOrder } from "../../lib/checkout/types";

const ORDER: SimulatedOrder = {
  orderId: "ORD-4F2K9Q",
  placedAt: Date.parse("2026-09-19T12:00:00Z"),
  customer: { fullName: "Ada Lovelace", phone: "5551234567", email: "" },
  lines: [
    {
      itemId: "tiramisu",
      name: "Tiramisu",
      unitPriceCents: 750,
      quantity: 1,
      lineSubtotalCents: 750,
    },
  ],
  subtotalCents: 750,
  totalCents: 750,
};

describe("OrderConfirmation", () => {
  it("shows the order id, customer recap, and order summary (AC14)", () => {
    render(<OrderConfirmation order={ORDER} />);

    expect(screen.getByText("ORD-4F2K9Q")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("5551234567")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
  });

  it("omits the email row when no email was provided", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("shows the email row when one was provided", () => {
    render(
      <OrderConfirmation
        order={{
          ...ORDER,
          customer: { ...ORDER.customer, email: "ada@example.com" },
        }}
      />,
    );
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("states plainly that the order is simulated (AC17)", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(
      screen.getByText(/this is a simulated order/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no payment was taken/i)).toBeInTheDocument();
  });

  it("links back to the menu (AC18)", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(
      screen.getByRole("link", { name: "Back to the menu" }),
    ).toHaveAttribute("href", "/");
  });

  it("focuses its own heading on mount — the review→confirmed transition (AC19)", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(
      screen.getByRole("heading", { name: "Order confirmed" }),
    ).toHaveFocus();
  });
});
