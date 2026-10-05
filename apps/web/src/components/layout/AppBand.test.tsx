import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppBand } from "./AppBand";

describe("AppBand", () => {
  it("is a titled region whose call to action is an unavailable placeholder", () => {
    render(<AppBand />);

    expect(
      screen.getByRole("region", { name: "Order by voice, text or touch." }),
    ).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Get the app (coming soon)" });
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(cta).not.toBeDisabled();
  });
});
