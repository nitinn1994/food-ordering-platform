import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UiProvider } from "../../../lib/state/uiStore";
import { useSelectedCategory } from "../../../lib/menu/routeCategory";
import { MENU } from "../../../test/fixtures/menu";
import CategoryPage, { generateMetadata } from "./page";

vi.mock("../../../lib/menu/menuSource", () => ({ getMenu: async () => MENU }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
// The menu itself is covered by its own tests; this checks the route.
vi.mock("../../../components/menu/MenuLayout", () => ({
  MenuLayout: function MenuLayout() {
    return <p>selected: {useSelectedCategory() ?? "all"}</p>;
  },
}));

const params = (categoryId: string) => ({ params: Promise.resolve({ categoryId }) });

// mcdelivery-parity AC6.
describe("/menu/[categoryId]", () => {
  it("renders the menu opened on that category", async () => {
    const first = MENU[0]!;
    render(<UiProvider>{await CategoryPage(params(first.id))}</UiProvider>);

    expect(screen.getByText(`selected: ${first.id}`)).toBeInTheDocument();
  });

  it("is a 404 for an unknown category", async () => {
    await expect(CategoryPage(params("no-such-category"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("titles the page with the category name", async () => {
    const first = MENU[0]!;
    expect((await generateMetadata(params(first.id))).title).toContain(first.name);
  });
});
