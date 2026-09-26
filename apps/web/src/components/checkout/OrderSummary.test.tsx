import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderSummary } from "./OrderSummary";
import type { OrderLine } from "@contracts/api-contracts";

const LINES: OrderLine[] = [
  {
    itemId: "garlic-bread",
    name: "Garlic Bread",
    unitPriceCents: 595,
    quantity: 2,
    lineSubtotalCents: 1190,
  },
  {
    itemId: "tiramisu",
    name: "Tiramisu",
    unitPriceCents: 750,
    quantity: 1,
    lineSubtotalCents: 750,
  },
];

describe("OrderSummary", () => {
  it("renders every line with its name, quantity, and subtotal (AC4)", () => {
    render(<OrderSummary lines={LINES} totalCents={1940} />);

    expect(screen.getByText("Garlic Bread × 2")).toBeInTheDocument();
    expect(screen.getByText("$11.90")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByText("$7.50")).toBeInTheDocument();
  });

  it("renders the total in the same format /cart uses (AC5)", () => {
    render(<OrderSummary lines={LINES} totalCents={1940} />);
    expect(screen.getByText("Total: $19.40")).toBeInTheDocument();
  });

  it("renders no lines and a zero total for an empty order", () => {
    render(<OrderSummary lines={[]} totalCents={0} />);
    expect(screen.getByText("Total: $0.00")).toBeInTheDocument();
  });
});
