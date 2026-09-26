import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderConfirmation } from "./OrderConfirmation";
import { ORDER_ID, orderResponse } from "../../test/order";

// Renders commerce-api's OrderResponse (Phase 11 AC11).
const ORDER = orderResponse();

describe("OrderConfirmation", () => {
  it("shows the order id, customer recap, and order summary (AC14)", () => {
    render(<OrderConfirmation order={ORDER} />);

    expect(screen.getByText(ORDER_ID)).toBeInTheDocument();
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

  it("states plainly that no payment was taken — the ADR-0011 disclosure, reworded for a real order (Phase 11 AC14)", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(screen.getByText(/no payment was taken/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not send orders to a restaurant/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
  });

  it("shows when the order was placed, from the backend's timestamp", () => {
    render(<OrderConfirmation order={ORDER} />);
    expect(document.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-09-25T14:06:15.712Z",
    );
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
