import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileToolbar } from "./MobileToolbar";

// mcdelivery-parity AC4: the red mobile toolbar. Delivery is the only mode,
// so it is shown as current; everything else is an unavailable placeholder.
describe("MobileToolbar", () => {
  it("shows Delivery as the current order type and Take Away as unavailable", () => {
    render(<MobileToolbar />);

    const group = screen.getByRole("group", { name: "Order type" });
    expect(group).toHaveTextContent("Delivery");
    expect(screen.getByRole("button", { name: "Take Away (coming soon)" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it.each([
    "Set your location to see delivery options near you (coming soon)",
    "Now (coming soon)",
  ])(
    "renders %s as a focusable placeholder",
    (name) => {
      render(<MobileToolbar />);

      const control = screen.getByRole("button", { name });
      expect(control).toHaveAttribute("aria-disabled", "true");
      expect(control).not.toBeDisabled();
    },
  );
});
