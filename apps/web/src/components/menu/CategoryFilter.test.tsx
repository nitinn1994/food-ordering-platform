import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryFilter } from "./CategoryFilter";
import { UiProvider } from "../../lib/state/uiStore";
import { MENU } from "../../lib/fixtures/menu";

function renderWithProvider() {
  return render(
    <UiProvider>
      <CategoryFilter categories={MENU} />
    </UiProvider>,
  );
}

describe("CategoryFilter — AC2 (ARIA correctness)", () => {
  it('does not use role="tablist"', () => {
    renderWithProvider();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("exposes a group of toggle buttons with aria-pressed", () => {
    renderWithProvider();
    expect(
      screen.getByRole("group", { name: "Menu categories" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles aria-pressed when a category is selected", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    const dessertsButton = screen.getByRole("button", { name: "Desserts" });
    expect(dessertsButton).toHaveAttribute("aria-pressed", "false");

    await user.click(dessertsButton);

    expect(dessertsButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
