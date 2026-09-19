import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyCheckoutNotice } from "./EmptyCheckoutNotice";

describe("EmptyCheckoutNotice", () => {
  it("shows the empty-cart message and a link back to the menu", () => {
    render(<EmptyCheckoutNotice />);
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /browse the menu/i }),
    ).toHaveAttribute("href", "/");
  });

  it("renders no form control, total, or submit button", () => {
    render(<EmptyCheckoutNotice />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
  });
});
