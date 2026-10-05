import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryBento, tileSize } from "./CategoryBento";
import { UiProvider, useUi } from "../../lib/state/uiStore";
import { MENU } from "../../test/fixtures/menu";

function Selected() {
  return <output>{useUi().selectedCategory ?? "none"}</output>;
}

// mcdelivery-parity AC5: one full-width tile, then rows of two, then three.
describe("CategoryBento", () => {
  it("sizes tiles full, half, half, then thirds", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(tileSize)).toEqual([
      "full",
      "half",
      "half",
      "third",
      "third",
      "third",
      "third",
    ]);
  });

  it("selects the tapped category and brings the menu into view", async () => {
    const scrollIntoView = vi.fn();
    const target = document.createElement("section");
    target.id = "menu-items";
    target.scrollIntoView = scrollIntoView;
    document.body.append(target);

    render(
      <UiProvider>
        <CategoryBento categories={MENU} />
        <Selected />
      </UiProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Browse categories" });
    const first = MENU[0]!;
    await userEvent.setup().click(within(nav).getByRole("button", { name: first.name }));

    expect(screen.getByRole("status")).toHaveTextContent(first.id);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    target.remove();
  });
});
