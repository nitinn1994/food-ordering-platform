import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { MenuCategory } from "@contracts/api-contracts";
import { SearchView } from "./SearchView";
import { MENU } from "../../test/fixtures/menu";
import { EMPTY_CART, renderWithCart } from "../../test/cart";
import { RECENT_SEARCHES_KEY } from "../../lib/search/recentSearches";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const POPULAR: readonly MenuCategory[] = MENU.map((category) => ({
  ...category,
  items: category.items.map((item) =>
    item.id === "tiramisu" ? { ...item, featured: ["popular" as const] } : item,
  ),
}));

// mcdelivery-parity AC8.
describe("SearchView", () => {
  it("shows popular items while the box is empty", async () => {
    await renderWithCart(<SearchView categories={POPULAR} />, { cart: EMPTY_CART });

    const popular = screen.getByRole("region", { name: "Popular items" });
    expect(within(popular).getAllByRole("listitem")).toHaveLength(1);
    expect(popular).toHaveTextContent("Tiramisu");
  });

  it("filters the menu by name or description as you type, ignoring case", async () => {
    const { user } = await renderWithCart(<SearchView categories={MENU} />, { cart: EMPTY_CART });

    await user.type(screen.getByRole("searchbox", { name: "Search the menu" }), "TIRAM");

    expect(screen.getByRole("heading", { name: "1 result for “TIRAM”" })).toBeInTheDocument();
    expect(screen.getByText("Tiramisu")).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    const { user } = await renderWithCart(<SearchView categories={MENU} />, { cart: EMPTY_CART });

    await user.type(screen.getByRole("searchbox"), "zzzz");

    expect(screen.getByRole("heading", { name: "No results for “zzzz”" })).toBeInTheDocument();
  });

  it("remembers a submitted search, offers it again, and clears", async () => {
    const { user } = await renderWithCart(<SearchView categories={MENU} />, { cart: EMPTY_CART });
    const box = screen.getByRole("searchbox");

    await user.type(box, "garlic{Enter}");
    await user.clear(box);

    const recent = screen.getByRole("region", { name: "Recent searches" });
    await user.click(within(recent).getByRole("button", { name: "garlic" }));
    expect(box).toHaveValue("garlic");

    await user.clear(box);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("region", { name: "Recent searches" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });
});
