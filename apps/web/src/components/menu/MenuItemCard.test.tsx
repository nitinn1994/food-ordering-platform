import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { MenuItemCard } from "./MenuItemCard";
import { findMenuItem } from "../../test/fixtures/menu";
import { pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";

// Phase 11 AC5, AC6: "Add to cart" is a POST of quantity 1, and nothing
// changes until the backend answers.

afterEach(() => {
  vi.unstubAllGlobals();
});

function requireItem(itemId: string) {
  const item = findMenuItem(itemId);
  if (!item) {
    throw new Error(`fixture missing ${itemId}`);
  }
  return item;
}

describe("MenuItemCard — Add to cart", () => {
  it("POSTs the item with quantity 1", async () => {
    const { stub, user } = await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("tiramisu")} />
      </ul>,
      { replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(stub.calls[1]).toMatchObject({
      method: "POST",
      url: "/api/commerce/v1/cart/items",
      body: { itemId: "tiramisu", quantity: 1 },
    });
  });

  it("says Adding… on the card being added and disables every add while in flight", async () => {
    const response = deferred<Response>();
    const { stub, user } = await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("tiramisu")} />
        <MenuItemCard item={requireItem("garlic-bread")} />
      </ul>,
      { replies: [() => response.promise] },
    );

    await user.click(screen.getAllByRole("button", { name: "Add to cart" })[0]!);

    const adding = screen.getByRole("button", { name: "Adding…" });
    expect(adding).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(stub.calls).toHaveLength(2);

    await act(async () =>
      response.resolve(jsonResponse(pricedCart([{ itemId: "tiramisu", quantity: 1 }]))),
    );
    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: "Add to cart" })) {
      expect(button).toBeEnabled();
    }
  });

  it("keeps an unavailable item's button disabled and labelled Unavailable", async () => {
    await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("gelato")} />
      </ul>,
    );

    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });
});

describe("MenuItemCard — card anatomy (mcdelivery-redesign AC-U3)", () => {
  it("shows the veg marker, name, description, price, allergens and calories", async () => {
    const item = requireItem("garlic-bread");
    await renderWithCart(
      <ul>
        <MenuItemCard item={item} />
      </ul>,
    );

    expect(screen.getByRole("img", { name: "Vegetarian" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: item.name })).toBeInTheDocument();
    expect(screen.getByText(item.description)).toBeInTheDocument();
    expect(screen.getByText("₹5.95")).toBeInTheDocument();
    expect(screen.getByText(`Contains: ${item.allergens.join(", ")}`)).toBeInTheDocument();
    expect(screen.getByText(`${item.calories} kcal`)).toBeInTheDocument();
  });

  it("marks an item without a vegetarian tag as non-vegetarian and says when nothing is listed", async () => {
    await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("soup-of-the-day")} />
      </ul>,
    );

    expect(screen.getByRole("img", { name: "Non-vegetarian" })).toBeInTheDocument();
    expect(screen.getByText("No listed allergens")).toBeInTheDocument();
  });

  it("shows 'Add +' while keeping 'Add to cart' as the button's name", async () => {
    await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("tiramisu")} />
      </ul>,
    );

    expect(screen.getByRole("button", { name: "Add to cart" })).toHaveTextContent("Add +");
  });
});

describe("MenuItemCard — presentation fields (mcdelivery-redesign Phase 2)", () => {
  it("shows the item's image, badge and weight when the menu has them", async () => {
    const { container } = await renderWithCart(
      <ul>
        <MenuItemCard
          item={{
            ...requireItem("tiramisu"),
            imageUrl: "/menu/dessert.svg",
            badge: "bestseller",
            weightGrams: 120,
          }}
        />
      </ul>,
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/menu/dessert.svg");
    expect(image).toHaveAttribute("alt", "");
    expect(screen.getByText("Bestseller")).toBeInTheDocument();
    expect(screen.getByText(/120 g · \d+ kcal/)).toBeInTheDocument();
  });

  it("falls back to the illustration with no image, and shows no badge or weight", async () => {
    const { container } = await renderWithCart(
      <ul>
        <MenuItemCard item={requireItem("tiramisu")} />
      </ul>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/ g · /)).not.toBeInTheDocument();
  });
});
