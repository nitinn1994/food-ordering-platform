import { useReducer, useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerDetailsForm } from "./CustomerDetailsForm";
import { checkoutReducer } from "../../lib/checkout/checkoutReducer";
import { initialCheckoutState } from "../../lib/checkout/types";

// Wired the same way CheckoutFlow wires this component — the real
// checkoutReducer (already unit tested in checkoutReducer.test.ts), not a
// mock, so these tests exercise the actual submit → validate →
// focus/announce path end to end.
function Harness() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [announceCount, setAnnounceCount] = useState(0);

  return (
    <>
      <p data-testid="announce-count">{announceCount}</p>
      <CustomerDetailsForm
        details={state.details}
        errors={state.errors}
        onChange={(field, value) => dispatch({ type: "SET_FIELD", field, value })}
        onSubmit={() => dispatch({ type: "SUBMIT_DETAILS" })}
        onValidationFailure={() => setAnnounceCount((count) => count + 1)}
      />
    </>
  );
}

describe("CustomerDetailsForm — invalid submit (AC7, AC8, AC9)", () => {
  it("shows an error for every required field and preserves entered values", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText("Full name"), "   ");
    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    // Each field's own error paragraph, looked up by the id its input's
    // aria-describedby points at — distinct from the identical wording
    // that also appears as a link in the error summary above the form.
    expect(document.getElementById("checkout-full-name-error")).toHaveTextContent(
      "Enter your name.",
    );
    expect(document.getElementById("checkout-phone-error")).toHaveTextContent(
      "Enter a phone number.",
    );
    expect(screen.getByLabelText("Full name")).toHaveValue("   ");
  });

  it("leaves email valid (optional) when every other required field is blank", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    expect(screen.getByLabelText("Email (optional)")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("wires aria-invalid and aria-describedby on an invalid field", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    const nameInput = screen.getByLabelText("Full name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute(
      "aria-describedby",
      "checkout-full-name-error",
    );
  });

  it("moves focus to the error summary and reports the failure once", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    expect(
      screen.getByRole("group", { name: "There are errors in your details" }),
    ).toHaveFocus();
    expect(screen.getByTestId("announce-count")).toHaveTextContent("1");
  });
});

describe("CustomerDetailsForm — fixing a field after a failed submit (AC10)", () => {
  it("clears a field's error as soon as it becomes valid, without resubmitting", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    expect(document.getElementById("checkout-full-name-error")).toHaveTextContent(
      "Enter your name.",
    );

    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");

    expect(
      document.getElementById("checkout-full-name-error"),
    ).not.toBeInTheDocument();
    // Phone is still blank and still invalid — only the fixed field clears.
    expect(document.getElementById("checkout-phone-error")).toHaveTextContent(
      "Enter a phone number.",
    );
  });
});

describe("CustomerDetailsForm — navigation", () => {
  it("offers a way back to the cart", () => {
    render(<Harness />);
    expect(
      screen.getByRole("link", { name: "Back to cart" }),
    ).toHaveAttribute("href", "/cart");
  });
});

describe("CustomerDetailsForm — keyboard operability (AC19)", () => {
  it("tabs through the fields and actions in a sane order", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByLabelText("Full name")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText("Phone number")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText("Email (optional)")).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Back to cart" })).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toHaveFocus();
  });
});
