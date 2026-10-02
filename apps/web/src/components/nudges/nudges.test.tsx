import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import type { Nudge } from "@contracts/api-contracts";
import { CartNudge } from "./CartNudge";
import { NudgeToast } from "./NudgeToast";
import { ItemDetailNudge } from "./ItemDetailNudge";
import { NudgeProvider } from "../../lib/nudges/NudgeProvider";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { EMPTY_CART, pricedCart, renderWithCart } from "../../test/cart";

// docs/features/mcdelivery-redesign/requirements.md AC-N5, AC-N6, AC-V1.

const FRIES: Nudge = {
  id: "rule:complete-meal-side:garlic-bread",
  kind: "complete-meal",
  surface: "cart",
  itemId: "garlic-bread",
  itemName: "Garlic Bread",
  headline: "Add Garlic Bread to complete your meal",
  priceCents: 595,
};

function nudges(...list: Nudge[]) {
  return { body: { nudges: list } };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CartNudge", () => {
  it("asks nothing for an empty cart (AC-N1)", async () => {
    const { stub } = await renderWithCart(
      <NudgeProvider>
        <CartNudge />
      </NudgeProvider>,
      { cart: EMPTY_CART },
    );

    expect(stub.calls.map((call) => call.url)).toEqual(["/api/commerce/v1/cart"]);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows commerce-api's nudge for the confirmed cart, with both choices", async () => {
    const { stub } = await renderWithCart(
      <NudgeProvider>
        <CartNudge />
      </NudgeProvider>,
      { cart: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]), replies: [nudges(FRIES)] },
    );

    const card = await screen.findByRole("region", { name: "Suggestion for your cart" });
    expect(card).toHaveTextContent("Add Garlic Bread to complete your meal");
    expect(card).toHaveTextContent("₹5.95");
    expect(screen.getByRole("button", { name: "Add Garlic Bread" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No thanks" })).toBeEnabled();
    expect(stub.calls[1]?.url).toBe("/api/commerce/v1/nudges?surface=cart");
  });

  it("accepts through the customer's own add-to-cart, then hides (AC-N6)", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <CartNudge />
      </NudgeProvider>,
      {
        cart: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]),
        replies: [
          nudges(FRIES),
          { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }, { itemId: "garlic-bread", quantity: 1 }]) },
          nudges(),
        ],
      },
    );

    await user.click(await screen.findByRole("button", { name: "Add Garlic Bread" }));

    expect(stub.calls[2]).toMatchObject({
      method: "POST",
      url: "/api/commerce/v1/cart/items",
      body: { itemId: "garlic-bread", quantity: 1 },
    });
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
  });

  it("hides on 'No thanks' and never offers that item again this session (AC-N5)", async () => {
    const { user } = await renderWithCart(
      <NudgeProvider>
        <CartNudge />
      </NudgeProvider>,
      { cart: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]), replies: [nudges(FRIES)] },
    );

    await user.click(await screen.findByRole("button", { name: "No thanks" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("nudge-session:v1")).toContain('"closed":["garlic-bread"]');
  });

  it("shows nothing when the suggestion cannot be loaded", async () => {
    await renderWithCart(
      <NudgeProvider>
        <CartNudge />
      </NudgeProvider>,
      { cart: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]), replies: [{ networkError: true }, { networkError: true }, { networkError: true }] },
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

function RequestNudge({ nudgeId }: { nudgeId: string }) {
  const { applyUiAction, commandLog } = useUi();
  return (
    <>
      <button type="button" onClick={() => applyUiAction({ type: "SHOW_NUDGE", nudgeId })}>
        request
      </button>
      <output>{commandLog.map((entry) => entry.status).join(",")}</output>
    </>
  );
}

describe("NudgeToast — ShowNudge (AC-V1)", () => {
  it("shows the nudge only when commerce-api offers one with that id", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <RequestNudge nudgeId={FRIES.id} />
        <NudgeToast />
      </NudgeProvider>,
      { replies: [nudges({ ...FRIES, surface: "voice" })] },
    );

    await user.click(screen.getByRole("button", { name: "request" }));

    expect(await screen.findByRole("region", { name: "Suggestion" })).toHaveTextContent(
      FRIES.headline,
    );
    expect(stub.calls[1]?.url).toBe("/api/commerce/v1/nudges?surface=voice");
  });

  it("ignores and logs a ShowNudge commerce-api does not offer", async () => {
    const { user } = await renderWithCart(
      <NudgeProvider>
        <RequestNudge nudgeId="rule:invented:caviar" />
        <NudgeToast />
      </NudgeProvider>,
      { replies: [nudges({ ...FRIES, surface: "voice" })] },
    );

    await user.click(screen.getByRole("button", { name: "request" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("rejected"));
    expect(screen.queryByRole("region", { name: "Suggestion" })).not.toBeInTheDocument();
  });
});

function AddButton({ itemId }: { itemId: string }) {
  const { addItem } = useCart();
  return (
    <button type="button" onClick={() => addItem(itemId)}>
      add {itemId}
    </button>
  );
}

describe("NudgeToast — post-add", () => {
  it("asks for a post-add nudge after a successful add, for that item", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <AddButton itemId="margherita-pizza" />
        <NudgeToast />
      </NudgeProvider>,
      {
        replies: [
          { body: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]) },
          nudges({ ...FRIES, surface: "post-add" }),
        ],
      },
    );

    await user.click(screen.getByRole("button", { name: "add margherita-pizza" }));

    expect(await screen.findByRole("region", { name: "Suggestion" })).toBeInTheDocument();
    expect(stub.calls[2]?.url).toBe(
      "/api/commerce/v1/nudges?surface=post-add&itemId=margherita-pizza",
    );
  });

  it("does not ask after a failed add", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <AddButton itemId="gelato" />
        <NudgeToast />
      </NudgeProvider>,
      {
        replies: [
          { status: 422, body: { code: "MENU_ITEM_UNAVAILABLE", message: "x" } },
          { body: EMPTY_CART },
        ],
      },
    );

    await user.click(screen.getByRole("button", { name: "add gelato" }));

    await waitFor(() => expect(stub.calls).toHaveLength(3));
    expect(stub.calls.some((call) => call.url.includes("/nudges"))).toBe(false);
  });
});

describe("session guardrails across surfaces (AC-N5)", () => {
  it("does not offer on item-detail an item already offered on the cart", async () => {
    function OpenDetail() {
      const { showItemDetail } = useUi();
      return (
        <button type="button" onClick={() => showItemDetail("veggie-burger")}>
          open
        </button>
      );
    }
    const { user } = await renderWithCart(
      <NudgeProvider>
        <CartNudge />
        <OpenDetail />
        <ItemDetailNudge />
      </NudgeProvider>,
      {
        cart: pricedCart([{ itemId: "margherita-pizza", quantity: 1 }]),
        replies: [nudges(FRIES), nudges({ ...FRIES, surface: "item-detail", id: "rule:pairs-with:garlic-bread" })],
      },
    );
    await screen.findByRole("region", { name: "Suggestion for your cart" });

    await user.click(screen.getByRole("button", { name: "open" }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole("region", { name: "Pairs well with this item" })).not.toBeInTheDocument();
  });
});

describe("NudgeToast — each ShowNudge is handled once (review-report-phases-3-5.md #1)", () => {
  function Controls({ nudgeId }: { nudgeId: string }) {
    const { applyUiAction, selectCategory, commandLog } = useUi();
    return (
      <>
        <button type="button" onClick={() => applyUiAction({ type: "SHOW_NUDGE", nudgeId })}>
          request
        </button>
        <button type="button" onClick={() => selectCategory("desserts")}>
          other ui change
        </button>
        <output data-testid="rejections">
          {commandLog.filter((entry) => entry.status === "rejected").length}
        </output>
      </>
    );
  }

  function voiceFetches(calls: { url: string }[]) {
    return calls.filter((call) => call.url.includes("nudges?surface=voice")).length;
  }

  it("fetches once and logs once for an id commerce-api does not offer, and never again", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <Controls nudgeId="rule:invented:caviar" />
        <NudgeToast />
      </NudgeProvider>,
      { replies: Array.from({ length: 20 }, () => nudges()) },
    );

    await user.click(screen.getByRole("button", { name: "request" }));
    await waitFor(() => expect(screen.getByTestId("rejections")).toHaveTextContent("1"));
    await user.click(screen.getByRole("button", { name: "other ui change" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(voiceFetches(stub.calls)).toBe(1);
    expect(screen.getByTestId("rejections")).toHaveTextContent("1");
  });

  it("fetches a matching request once, even after later UI changes", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <Controls nudgeId={FRIES.id} />
        <NudgeToast />
      </NudgeProvider>,
      { replies: Array.from({ length: 20 }, () => nudges({ ...FRIES, surface: "voice" })) },
    );

    await user.click(screen.getByRole("button", { name: "request" }));
    await screen.findByRole("region", { name: "Suggestion" });
    await user.click(screen.getByRole("button", { name: "other ui change" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(voiceFetches(stub.calls)).toBe(1);
  });

  it("handles a repeat of the same id as a new request", async () => {
    const { stub, user } = await renderWithCart(
      <NudgeProvider>
        <Controls nudgeId="rule:invented:caviar" />
        <NudgeToast />
      </NudgeProvider>,
      { replies: Array.from({ length: 20 }, () => nudges()) },
    );

    await user.click(screen.getByRole("button", { name: "request" }));
    await waitFor(() => expect(screen.getByTestId("rejections")).toHaveTextContent("1"));
    await user.click(screen.getByRole("button", { name: "request" }));
    await waitFor(() => expect(screen.getByTestId("rejections")).toHaveTextContent("2"));

    expect(voiceFetches(stub.calls)).toBe(2);
  });
});
