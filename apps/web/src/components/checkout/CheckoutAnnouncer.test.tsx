import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckoutAnnouncer } from "./CheckoutAnnouncer";

describe("CheckoutAnnouncer", () => {
  it("renders an empty, polite live region by default", () => {
    render(<CheckoutAnnouncer message="" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
  });

  it("renders whatever message it is given", () => {
    render(
      <CheckoutAnnouncer message="There are errors in the form. Please review and correct them." />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "There are errors in the form. Please review and correct them.",
    );
  });
});
