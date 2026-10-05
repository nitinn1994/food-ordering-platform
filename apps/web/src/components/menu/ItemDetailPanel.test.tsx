import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { ItemDetailPanel } from "./ItemDetailPanel";
import { useState } from "react";
import { useUi } from "../../lib/state/uiStore";
import { useCart } from "../../lib/state/cartStore";
import { MENU } from "../../test/fixtures/menu";
import { EMPTY_CART, pricedCart, renderWithCart } from "../../test/cart";
import type { StubReply } from "../../test/fetchStub";

afterEach(() => {
  vi.unstubAllGlobals();
});

function OpenDetailButton({ itemId }: { itemId: string }) {
  const { showItemDetail } = useUi();
  return (
    <button type="button" onClick={() => showItemDetail(itemId)}>
      Open {itemId}
    </button>
  );
}

function renderDetail(itemId = "tiramisu", replies: StubReply[] = []) {
  return renderWithCart(
    <>
      <OpenDetailButton itemId={itemId} />
      <ItemDetailPanel categories={MENU} />
    </>,
    { cart: EMPTY_CART, replies },
  );
}

describe("ItemDetailPanel — AC11", () => {
  it("renders nothing when no item is selected", async () => {
    await renderDetail();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // mcdelivery-parity AC7: a modal dialog named by the item.
  it("shows the enriched fields in a modal dialog once an item is opened", async () => {
    const { user } = await renderDetail();

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));

    const dialog = screen.getByRole("dialog", { name: "Tiramisu" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent(/espresso-soaked ladyfingers/i);
    expect(dialog).toHaveTextContent("₹7.50");
    expect(dialog).toHaveTextContent("450 kcal");
    expect(dialog).toHaveTextContent("vegetarian");
    expect(dialog).toHaveTextContent("gluten");
  });

  it("closes when the close button is activated, and gives focus back", async () => {
    const { user } = await renderDetail();
    const opener = screen.getByRole("button", { name: "Open tiramisu" });

    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { user } = await renderDetail();

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds the item through the backend cart, then closes once it is confirmed", async () => {
    const { user } = await renderDetail("tiramisu", [
      { body: pricedCart([{ itemId: "tiramisu", quantity: 1 }]) },
    ]);

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add to cart" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open tiramisu" })).toHaveFocus();
  });

  it("offers no Add button for an unavailable item", async () => {
    const { user } = await renderDetail("gelato");

    await user.click(screen.getByRole("button", { name: "Open gelato" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Add to cart" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Currently unavailable.");
  });

  it("stays open when the add fails", async () => {
    const { user } = await renderDetail("tiramisu", [
      { status: 500, body: { code: "INTERNAL_ERROR", message: "x" } },
    ]);

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add to cart" }));

    expect(
      await within(screen.getByRole("dialog")).findByRole("button", { name: "Add to cart" }),
    ).toBeEnabled();
  });
});

function AddButton({ itemId, label }: { itemId: string; label: string }) {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem(itemId)}>
      {label}
    </button>
  );
}

function DetailState() {
  return <output>{useUi().detailItemId ?? "closed"}</output>;
}

// mcdelivery-parity review findings 2 and 3.
describe("ItemDetailPanel — lifecycle", () => {
  it("closes after a confirmed add from a control inside it, such as its suggestion", async () => {
    const { user } = await renderWithCart(
      <>
        <OpenDetailButton itemId="tiramisu" />
        <ItemDetailPanel categories={MENU}>
          <AddButton itemId="garlic-bread" label="Add suggestion" />
        </ItemDetailPanel>
      </>,
      { cart: EMPTY_CART, replies: [{ body: pricedCart([{ itemId: "garlic-bread", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    await user.click(screen.getByRole("button", { name: "Add suggestion" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("stays open when an add started elsewhere — a card, voice or chat — is confirmed", async () => {
    const { user } = await renderWithCart(
      <>
        <OpenDetailButton itemId="tiramisu" />
        <AddButton itemId="garlic-bread" label="Add from elsewhere" />
        <ItemDetailPanel categories={MENU} />
        <DetailState />
      </>,
      { cart: EMPTY_CART, replies: [{ body: pricedCart([{ itemId: "garlic-bread", quantity: 1 }]) }] },
    );

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    // jsdom has no inert page behind the modal, so the outside button is
    // still clickable here — standing in for a voice or chat add.
    await user.click(screen.getByRole("button", { name: "Add from elsewhere" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("tiramisu"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole("dialog", { name: "Tiramisu" })).toBeInTheDocument();
  });

  it("clears the open item when its page goes, so the next page does not reopen it", async () => {
    function Page() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>
            Leave page
          </button>
          {shown && <ItemDetailPanel categories={MENU} />}
          <OpenDetailButton itemId="tiramisu" />
          <DetailState />
        </>
      );
    }
    const { user } = await renderWithCart(<Page />, { cart: EMPTY_CART });

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    expect(screen.getByRole("status")).toHaveTextContent("tiramisu");
    // Leaving while it is open (a script click: jsdom has no inert page).
    screen.getByRole("button", { name: "Leave page" }).click();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("closed"));
  });

  it("does not open an item left over from before it mounted", async () => {
    function Late() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <OpenDetailButton itemId="tiramisu" />
          <button type="button" onClick={() => setShown(true)}>
            Arrive
          </button>
          {shown && <ItemDetailPanel categories={MENU} />}
        </>
      );
    }
    const { user } = await renderWithCart(<Late />, { cart: EMPTY_CART });

    await user.click(screen.getByRole("button", { name: "Open tiramisu" }));
    await user.click(screen.getByRole("button", { name: "Arrive" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
