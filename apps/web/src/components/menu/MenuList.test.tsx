import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuList } from "./MenuList";
import { MenuSearch } from "./MenuSearch";
import { ItemDetailPanel } from "./ItemDetailPanel";
import { UiProvider } from "../../lib/state/uiStore";
import { CartProvider } from "../../lib/state/cartStore";
import type { MenuCategory } from "@contracts/api-contracts";
import { MENU } from "../../test/fixtures/menu";
import { installFetchStub } from "../../test/fetchStub";
import { EMPTY_CART } from "../../test/cart";

// MenuItemCard (rendered whenever a category has items) calls useCart(), so
// any render exercising real items needs CartProvider too, not just
// UiProvider. The empty-category case doesn't need it — it never reaches
// MenuItemCard. CartProvider loads the backend cart on mount (Phase 11), so
// every test answers that GET with an empty cart.
beforeEach(() => {
  installFetchStub().reply({ body: EMPTY_CART });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithProviders(categories: readonly MenuCategory[]) {
  return render(
    <UiProvider>
      <CartProvider>
        <MenuList categories={categories} />
      </CartProvider>
    </UiProvider>,
  );
}

describe("MenuList — AC9", () => {
  it("renders all categories and items when no filter is active", () => {
    renderWithProviders(MENU);
    expect(screen.getByText("Tiramisu")).toBeInTheDocument();
    expect(screen.getByText("Garlic Bread")).toBeInTheDocument();
  });
});

describe("MenuList — AC11 (real card wiring, not just ItemDetailPanel in isolation)", () => {
  it("opens the detail panel when a real rendered card is clicked", async () => {
    render(
      <UiProvider>
        <CartProvider>
          <MenuList categories={MENU} />
          <ItemDetailPanel categories={MENU} />
        </CartProvider>
      </UiProvider>,
    );
    const user = userEvent.setup();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "View details for Tiramisu" }),
    );

    // mcdelivery-parity AC7: the detail is a modal dialog now.
    expect(
      screen.getByRole("dialog", { name: "Tiramisu" }),
    ).toHaveTextContent(/espresso-soaked ladyfingers/i);
  });
});

describe("MenuList — AC10 (no-results, distinct from empty-category)", () => {
  it('shows "no items in this category" for a structurally empty category, with no query', () => {
    // Hand-constructed, not from the real fixture — the fixture has no
    // naturally-empty category, so this is the only way to reach this
    // branch (which is exactly why MenuList takes categories as a prop).
    const emptyCategory: MenuCategory[] = [
      { id: "seasonal", name: "Seasonal", items: [] },
    ];
    renderWithProviders(emptyCategory);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No items in this category.",
    );
  });

  it('shows "no items match" for a search with no results, distinct from the empty-category message', async () => {
    render(
      <UiProvider>
        <CartProvider>
          <MenuSearch />
          <MenuList categories={MENU} />
        </CartProvider>
      </UiProvider>,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Search menu"), "sushi");

    expect(screen.getByRole("status")).toHaveTextContent(
      'No items match "sushi".',
    );
  });
});

describe("MenuList — Veg / Non-Veg chips (mcdelivery-redesign AC-U4)", () => {
  it("filters to vegetarian items, and back to everything when pressed again", async () => {
    renderWithProviders(MENU);
    const user = userEvent.setup();
    const veg = screen.getByRole("button", { name: "Veg" });

    expect(veg).toHaveAttribute("aria-pressed", "false");
    await user.click(veg);

    expect(veg).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Garlic Bread")).toBeInTheDocument();
    expect(screen.queryByText("Soup of the Day")).not.toBeInTheDocument();

    await user.click(veg);
    expect(screen.getByText("Soup of the Day")).toBeInTheDocument();
  });

  it("filters to non-vegetarian items, with only one chip pressed at a time", async () => {
    renderWithProviders(MENU);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Veg" }));
    await user.click(screen.getByRole("button", { name: "Non-Veg" }));

    expect(screen.getByRole("button", { name: "Veg" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Soup of the Day")).toBeInTheDocument();
    expect(screen.queryByText("Garlic Bread")).not.toBeInTheDocument();
  });

  // Was covered by the removed Deals + Non-Veg case (mcdelivery-parity
  // review finding 4); the diet chip alone can empty a menu too.
  it("says when the chip leaves nothing", async () => {
    const onlyNonVeg: MenuCategory[] = MENU.map((category) => ({
      ...category,
      items: category.items.filter((item) => item.id === "soup-of-the-day"),
    })).filter((category) => category.items.length > 0);
    renderWithProviders(onlyNonVeg);

    await userEvent.setup().click(screen.getByRole("button", { name: "Veg" }));

    expect(screen.getByRole("status")).toHaveTextContent("No items match these filters.");
  });
});

// mcdelivery-parity Phase 3: the Popular / Deals / New Launch chips moved
// to MenuBand as links to /tag/[feature] (MenuBand.test.tsx), and their
// filter was removed (review finding 4).
describe("MenuList — featured chips moved out", () => {
  it("renders no featured chips of its own", () => {
    renderWithProviders(MENU);
    expect(screen.queryByRole("group", { name: "Featured" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deals" })).not.toBeInTheDocument();
  });
});
