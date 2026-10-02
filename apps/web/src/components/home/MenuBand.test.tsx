import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuBand } from "./MenuBand";
import { UiProvider } from "../../lib/state/uiStore";

describe("MenuBand", () => {
  it("is the page's heading and holds the menu search", () => {
    render(
      <UiProvider>
        <MenuBand />
      </UiProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Our Menu" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search menu")).toHaveAttribute("placeholder", "Search here");
  });
});
