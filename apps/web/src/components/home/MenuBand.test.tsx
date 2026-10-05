import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MenuCategory } from "@contracts/api-contracts";
import { MenuBand } from "./MenuBand";
import { UiProvider } from "../../lib/state/uiStore";
import { MENU } from "../../test/fixtures/menu";

const FEATURED: readonly MenuCategory[] = MENU.map((category) => ({
  ...category,
  items: category.items.map((item) =>
    item.id === "tiramisu" ? { ...item, featured: ["deal" as const, "new-launch" as const] } : item,
  ),
}));

function renderBand(categories: readonly MenuCategory[]) {
  return render(
    <UiProvider>
      <MenuBand categories={categories} />
    </UiProvider>,
  );
}

describe("MenuBand", () => {
  it("is the page's heading and holds the menu search", () => {
    renderBand(MENU);

    expect(screen.getByRole("heading", { level: 1, name: "Our Menu" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search menu")).toHaveAttribute("placeholder", "Search here");
  });

  // mcdelivery-parity AC5, AC6: chips open the feature's page.
  it("links each feature some item carries to its /tag page, and no others", () => {
    renderBand(FEATURED);

    const chips = within(screen.getByRole("navigation", { name: "Featured" })).getAllByRole("link");
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute("href")])).toEqual([
      ["Deals", "/tag/deal"],
      ["New Launch", "/tag/new-launch"],
    ]);
  });

  it("renders no chips for a menu without featured items", () => {
    renderBand(MENU);
    expect(screen.queryByRole("navigation", { name: "Featured" })).not.toBeInTheDocument();
  });
});
