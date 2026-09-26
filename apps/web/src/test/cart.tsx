import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import type { CartResponse } from "@contracts/api-contracts";
import { CartProvider } from "../lib/state/cartStore";
import { UiProvider } from "../lib/state/uiStore";
import { installFetchStub, type StubReply } from "./fetchStub";
import { findMenuItem } from "./fixtures/menu";

// Test-only helpers for components that read the backend cart through
// useCart(). Pair every test file that uses them with
// `afterEach(() => vi.unstubAllGlobals())`.

export const EMPTY_CART: CartResponse = { items: [], itemCount: 0, subtotalCents: 0 };

// Stands in for commerce-api's pricing, so tests can describe a cart by
// item and quantity. Test-side only — apps/web itself never prices.
export function pricedCart(
  lines: readonly { itemId: string; quantity: number; available?: boolean }[],
): CartResponse {
  const items = lines.map(({ itemId, quantity, available }) => {
    const item = findMenuItem(itemId);
    if (!item) {
      throw new Error(`test fixture has no menu item ${itemId}`);
    }
    return {
      itemId,
      name: item.name,
      unitPriceCents: item.priceCents,
      quantity,
      lineSubtotalCents: item.priceCents * quantity,
      available: available ?? item.available,
    };
  });
  return {
    items,
    itemCount: items.reduce((total, line) => total + line.quantity, 0),
    subtotalCents: items.reduce((total, line) => total + line.lineSubtotalCents, 0),
  };
}

export function cartReply(cart: CartResponse): StubReply {
  return { body: cart };
}

export function errorReply(status: number, code: string, message = "Backend detail that must never render."): StubReply {
  return { status, body: { code, message } };
}

// Renders `ui` inside UiProvider + CartProvider. The provider's initial
// GET /v1/cart answers with `cart`; `replies` answer the requests after it,
// in order. Resolves once that first GET has been made and — unless the test
// is holding it in flight itself (a function reply) — has settled.
export async function renderWithCart(
  ui: ReactNode,
  { cart = EMPTY_CART, replies = [] }: { cart?: CartResponse | StubReply; replies?: StubReply[] } = {},
) {
  const stub = installFetchStub();
  stub.reply("items" in cart ? cartReply(cart) : cart, ...replies);
  const user = userEvent.setup();
  const result = render(
    <UiProvider>
      <CartProvider>{ui}</CartProvider>
    </UiProvider>,
  );
  await waitFor(() => expect(stub.calls.length).toBeGreaterThanOrEqual(1));
  if (typeof cart !== "function") {
    await waitFor(() => expect(screen.queryByText("Loading your cart…")).toBeNull());
  }
  return { ...result, stub, user };
}
