import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { MenuCategory } from "@contracts/api-contracts";
import { MENU } from "../../../test/fixtures/menu";
import { EMPTY_CART, renderWithCart } from "../../../test/cart";
import TagPage from "./page";

const FEATURED: readonly MenuCategory[] = MENU.map((category) => ({
  ...category,
  items: category.items.map((item) =>
    item.id === "tiramisu" || item.id === "gelato" ? { ...item, featured: ["deal" as const] } : item,
  ),
}));

vi.mock("../../../lib/menu/menuSource", async (original) => ({
  ...(await original<typeof import("../../../lib/menu/menuSource")>()),
  getMenu: async () => FEATURED,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const params = (feature: string) => ({ params: Promise.resolve({ feature }) });

// mcdelivery-parity AC6.
describe("/tag/[feature]", () => {
  it("lists every item carrying the feature under the feature's title", async () => {
    await renderWithCart(await TagPage(params("deal")), { cart: EMPTY_CART });

    expect(screen.getByRole("heading", { level: 1, name: "Deals" })).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("shows a sold-out item without an Add button", async () => {
    await renderWithCart(await TagPage(params("deal")), { cart: EMPTY_CART });

    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(1);
  });

  it("says so when no item carries the feature", async () => {
    await renderWithCart(await TagPage(params("popular")), { cart: EMPTY_CART });

    expect(screen.getByRole("status")).toHaveTextContent("Nothing here right now");
  });

  it("is a 404 for anything that is not a menu feature", async () => {
    await expect(TagPage(params("free-stuff"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
