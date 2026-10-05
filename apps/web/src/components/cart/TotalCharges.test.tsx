import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TotalCharges } from "./TotalCharges";
import { DeliveryNote } from "./DeliveryNote";
import { pricedCart } from "../../test/cart";

// mcdelivery-parity AC13.
describe("TotalCharges", () => {
  it("expands to show only commerce-api's own figures", async () => {
    const cart = pricedCart([{ itemId: "tiramisu", quantity: 2 }]);
    const { container } = render(<TotalCharges cart={cart} />);

    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    await userEvent.setup().click(screen.getByText("Total Charges"));
    expect(details).toHaveAttribute("open");

    expect(details).toHaveTextContent("Item total (2 items)₹15");
    expect(details).toHaveTextContent("To pay₹15");
    expect(details).not.toHaveTextContent(/GST|tax|handling|delivery fee/i);
  });
});

describe("DeliveryNote", () => {
  it("is a labelled local note that says it is not sent", async () => {
    render(<DeliveryNote />);

    const note = screen.getByRole("textbox", { name: "Delivery instructions" });
    expect(note).toHaveAccessibleDescription("Not sent with your order in this demo.");
    await userEvent.setup().type(note, "Gate code 42");
    expect(note).toHaveValue("Gate code 42");
  });
});
