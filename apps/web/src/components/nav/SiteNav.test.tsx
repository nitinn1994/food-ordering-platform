import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { SiteNav } from "./SiteNav";
import { useCart } from "../../lib/state/cartStore";
import { EMPTY_CART, errorReply, pricedCart, renderWithCart } from "../../test/cart";
import { deferred, jsonResponse } from "../../test/fetchStub";
import { BRAND_NAME } from "../../lib/brand";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function AddTiramisuButton() {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem("tiramisu")}>
      add tiramisu
    </button>
  );
}

describe("SiteNav", () => {
  it("shows Menu and Cart links with the backend's cart count", async () => {
    await renderWithCart(<SiteNav />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 2 }]),
    });

    expect(screen.getByRole("link", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cart (2)" })).toBeInTheDocument();
  });

  it("marks the current route with aria-current", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Cart (0)" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("updates the cart count when an item is added", async () => {
    const { user } = await renderWithCart(
      <>
        <SiteNav />
        <AddTiramisuButton />
      </>,
      { cart: EMPTY_CART, replies: [{ body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "add tiramisu" }));

    expect(await screen.findByRole("link", { name: "Cart (1)" })).toBeInTheDocument();
  });

  it("shows no count — never a guessed 0 — while loading or after a failed load (Phase 11)", async () => {
    const response = deferred<Response>();
    await renderWithCart(<SiteNav />, { cart: () => response.promise });

    expect(screen.getByRole("link", { name: "Cart" })).toBeInTheDocument();

    await act(async () => response.resolve(jsonResponse(EMPTY_CART)));
    expect(screen.getByRole("link", { name: "Cart (0)" })).toBeInTheDocument();
  });

  it("shows no count after a failed load", async () => {
    await renderWithCart(<SiteNav />, { cart: errorReply(500, "INTERNAL_ERROR") });

    expect(await screen.findByRole("link", { name: "Cart" })).toBeInTheDocument();
  });
});

describe("SiteNav — header (mcdelivery-redesign Phase 1)", () => {
  it("links the placeholder brand home", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(screen.getByRole("link", { name: `${BRAND_NAME} home` })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it.each([
    "Delivery (coming soon)",
    "Offers (coming soon)",
    "Restaurants Nearby (coming soon)",
    "Account (coming soon)",
  ])("renders %s as a focusable, unavailable placeholder", async (name) => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    const placeholder = screen.getByRole("button", { name });
    expect(placeholder).toHaveAttribute("aria-disabled", "true");
    expect(placeholder).not.toBeDisabled();
  });

  it("renders the location pill as a placeholder named by its visible text", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(
      screen.getByRole("button", {
        name: "Set your location to see delivery options near you, Now (coming soon)",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
