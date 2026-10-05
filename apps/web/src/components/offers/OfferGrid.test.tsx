import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { OfferGrid } from "./OfferGrid";
import { DEMO_OFFERS } from "../../lib/content/offers";
import { EMPTY_CART, renderWithCart } from "../../test/cart";

afterEach(() => {
  vi.unstubAllGlobals();
});

// mcdelivery-parity AC9: display only.
describe("OfferGrid", () => {
  it("shows every demo offer, labelled as such, with no way to apply one", async () => {
    await renderWithCart(<OfferGrid />, { cart: EMPTY_CART });

    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(DEMO_OFFERS.length);
    expect(cards[0]).toHaveTextContent("Demo offer");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("filters by code or words, and says when nothing matches", async () => {
    const { user } = await renderWithCart(<OfferGrid />, { cart: EMPTY_CART });
    const box = screen.getByRole("searchbox", { name: "Search offers" });

    await user.type(box, "coffee");
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);

    await user.clear(box);
    await user.type(box, "nothing-like-this");
    expect(screen.getByRole("status")).toHaveTextContent("No offers match");
  });

  it("never calls the cart API beyond loading it", async () => {
    const { user, stub } = await renderWithCart(<OfferGrid />, { cart: EMPTY_CART });

    await user.type(screen.getByRole("searchbox"), "meal");

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.method).toBe("GET");
  });
});
