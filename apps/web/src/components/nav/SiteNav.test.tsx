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
  // mcdelivery-parity AC2: the "Menu" text link gave way to the
  // reference's search and cart icons; the brand link is the way home.
  it("shows Search and Cart links, with the backend's cart count as a badge", async () => {
    await renderWithCart(<SiteNav />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 2 }]),
    });

    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    const cart = screen.getByRole("link", { name: "Cart (2)" });
    expect(cart).toHaveAttribute("href", "/cart");
    expect(cart).toHaveTextContent("2");
  });

  it("marks only the current route with aria-current", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(screen.getByRole("link", { name: "Search" })).not.toHaveAttribute("aria-current");
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
    expect(screen.getByRole("link", { name: "Cart" })).toHaveTextContent("");

    await act(async () => response.resolve(jsonResponse(EMPTY_CART)));
    expect(screen.getByRole("link", { name: "Cart (0)" })).toBeInTheDocument();
  });

  it("shows no count after a failed load", async () => {
    await renderWithCart(<SiteNav />, { cart: errorReply(500, "INTERNAL_ERROR") });

    expect(await screen.findByRole("link", { name: "Cart" })).toBeInTheDocument();
  });
});

describe("SiteNav — header (mcdelivery-redesign Phase 1)", () => {
  it("orders the header like the reference (mcdelivery-parity AC2)", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    const names = Array.from(
      screen.getByRole("banner").querySelectorAll('[data-layout="desktop"] :is(a, button)'),
      (el) => el.getAttribute("aria-label") ?? el.textContent,
    );
    expect(names).toEqual([
      `${BRAND_NAME} home`,
      "Delivery (coming soon)",
      "Set your location to see delivery options near you Now (coming soon)",
      "Offers",
      "Restaurants Nearby",
      "Account",
      "Search",
      "Cart (0)",
    ]);
  });

  it("links the placeholder brand home", async () => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(screen.getByRole("link", { name: `${BRAND_NAME} home` })).toHaveAttribute(
      "href",
      "/",
    );
  });

  // mcdelivery-parity Phase 4: Offers, Restaurants Nearby and Account are
  // links now; only the delivery controls stay placeholders.
  it.each([
    ["Offers", "/offers"],
    ["Restaurants Nearby", "/restaurants-nearby"],
    ["Account", "/profile"],
  ])("links %s to %s", async (name, href) => {
    await renderWithCart(<SiteNav />, { cart: EMPTY_CART });

    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it.each([
    "Delivery (coming soon)",
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
        name: "Set your location to see delivery options near you Now (coming soon)",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
