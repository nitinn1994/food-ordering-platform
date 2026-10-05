import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPlaceholder } from "./LoginPlaceholder";

// mcdelivery-parity AC12, OQ4 (a): looks like the reference's sign-in,
// collects nothing.
describe("LoginPlaceholder", () => {
  it("opens a 'Hi there!' dialog that says sign-in is not available", async () => {
    const user = userEvent.setup();
    render(<LoginPlaceholder />);

    await user.click(screen.getByRole("button", { name: "Log in / Sign up" }));

    const dialog = screen.getByRole("dialog", { name: "Hi there!" });
    expect(within(dialog).getByRole("note")).toHaveTextContent("Sign-in is not available in this demo");
  });

  it("has a disabled mobile field and Verify button, and no form to submit", async () => {
    const user = userEvent.setup();
    render(<LoginPlaceholder />);

    await user.click(screen.getByRole("button", { name: "Log in / Sign up" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Mobile number")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Verify Mobile" })).toBeDisabled();
    expect(dialog.querySelector("form")).toBeNull();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    render(<LoginPlaceholder />);

    await user.click(screen.getByRole("button", { name: "Log in / Sign up" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in / Sign up" })).toHaveFocus();
  });
});
