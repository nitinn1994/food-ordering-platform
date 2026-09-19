import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "./FormField";

describe("FormField", () => {
  it("associates the label with the input via htmlFor/id", () => {
    render(
      <FormField
        id="checkout-full-name"
        label="Full name"
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("carries no aria-invalid or aria-describedby when there is no error", () => {
    render(
      <FormField
        id="checkout-full-name"
        label="Full name"
        value=""
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText("Full name");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("wires aria-invalid and aria-describedby to the visible error message (AC8)", () => {
    render(
      <FormField
        id="checkout-full-name"
        label="Full name"
        value=""
        onChange={() => {}}
        error="Enter your name."
      />,
    );
    const input = screen.getByLabelText("Full name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("checkout-full-name-error");
    expect(screen.getByText("Enter your name.")).toHaveAttribute(
      "id",
      describedBy,
    );
  });
});
