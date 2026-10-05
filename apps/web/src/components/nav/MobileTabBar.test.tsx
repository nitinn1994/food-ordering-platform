import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MobileTabBar } from "./MobileTabBar";
import { EMPTY_CART, pricedCart, renderWithCart } from "../../test/cart";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => {
  navigation.pathname = "/";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// mcdelivery-parity AC4.
describe("MobileTabBar", () => {
  it("links Home, Menu, Search and Account", async () => {
    await renderWithCart(<MobileTabBar />, { cart: EMPTY_CART });

    const tabs = within(screen.getByRole("navigation", { name: "Tabs" })).getAllByRole("link");
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["Menu", "/menu"],
      ["Search", "/search"],
      ["Account", "/profile"],
    ]);
  });

  it.each([
    ["/", "Home"],
    ["/menu/burgers", "Menu"],
    ["/tag/deal", "Menu"],
    ["/search", "Search"],
    ["/profile", "Account"],
  ])("marks only the current tab on %s", async (pathname, current) => {
    navigation.pathname = pathname;
    await renderWithCart(<MobileTabBar />, { cart: EMPTY_CART });

    const marked = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual([current]);
  });

  it("is not shown during checkout", async () => {
    navigation.pathname = "/checkout";
    await renderWithCart(<MobileTabBar />, { cart: EMPTY_CART });

    expect(screen.queryByRole("navigation", { name: "Tabs" })).not.toBeInTheDocument();
  });

  it("adds a View cart bar with the backend's figures on pages without the cart panel", async () => {
    navigation.pathname = "/search";
    await renderWithCart(<MobileTabBar />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 2 }]),
    });

    const bar = await screen.findByRole("link", { name: /View cart/ });
    expect(bar).toHaveAttribute("href", "/cart");
    expect(bar).toHaveTextContent("2 items");
  });

  it.each(["/", "/menu/burgers", "/cart"])(
    "adds no cart bar on %s, which shows the cart already",
    async (pathname) => {
      navigation.pathname = pathname;
      await renderWithCart(<MobileTabBar />, {
        cart: pricedCart([{ itemId: "tiramisu", quantity: 1 }]),
      });

      expect(screen.queryByRole("link", { name: /View cart/ })).not.toBeInTheDocument();
    },
  );

  it("adds no cart bar while the cart is empty", async () => {
    navigation.pathname = "/search";
    await renderWithCart(<MobileTabBar />, { cart: EMPTY_CART });

    expect(screen.queryByRole("link", { name: /View cart/ })).not.toBeInTheDocument();
  });
});
