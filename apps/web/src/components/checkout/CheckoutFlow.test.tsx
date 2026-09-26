import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { CheckoutFlow } from "./CheckoutFlow";
import { useCart } from "../../lib/state/cartStore";
import {
  EMPTY_CART,
  cartReply,
  errorReply,
  pricedCart,
  renderWithCart,
} from "../../test/cart";
import { deferred, jsonResponse, type RecordedCall } from "../../test/fetchStub";
import { ORDER_ID, orderResponse } from "../../test/order";

// /checkout against commerce-api (stubbed): the lines and total are the
// backend cart's, and "Place order" is POST /v1/orders — Phase 11 AC10–AC14.

afterEach(() => {
  vi.unstubAllGlobals();
});

const ONE_TIRAMISU = pricedCart([{ itemId: "tiramisu", quantity: 1 }]);
const PLACED = { status: 201, body: orderResponse() };

// Exposes the provider's cart without CartPanel/SiteNav, to confirm the cart
// is genuinely empty after an order (Phase 4 AC16).
function CartCountProbe() {
  const { itemCount, status } = useCart();
  return <p data-testid="cart-count">{status === "ready" ? itemCount : "-"}</p>;
}

async function fillValidDetails(
  user: ReturnType<typeof userEvent.setup>,
  { fullName = "Ada Lovelace", phone = "5551234567" } = {},
) {
  await user.type(screen.getByLabelText("Full name"), fullName);
  await user.type(screen.getByLabelText("Phone number"), phone);
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
}

const orderPosts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "POST" && call.url.endsWith("/v1/orders"));

const keyOf = (call: RecordedCall | undefined) =>
  (call?.body as { idempotencyKey?: string } | undefined)?.idempotencyKey;

describe("CheckoutFlow — empty-cart guard (AC3)", () => {
  it("renders the empty-cart notice and no form, total, or submit control", async () => {
    await renderWithCart(<CheckoutFlow />, { cart: EMPTY_CART });

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
  });

  it("shows a loading notice, not the empty notice, until the cart has loaded (Phase 11)", async () => {
    const response = deferred<Response>();
    await renderWithCart(<CheckoutFlow />, { cart: () => response.promise });

    expect(screen.getByText("Loading your cart…")).toBeInTheDocument();
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();

    await act(async () => response.resolve(jsonResponse(ONE_TIRAMISU)));
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });
});

describe("CheckoutFlow — non-empty cart (AC1)", () => {
  it("renders the customer-details form instead of the empty-cart notice", async () => {
    await renderWithCart(<CheckoutFlow />, { cart: ONE_TIRAMISU });

    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("announces a validation failure through the checkout live region (AC9)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, { cart: ONE_TIRAMISU });

    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "There are errors in the form. Please review and correct them.",
    );
  });

  it("advances to the review step, showing details and the backend's order summary together (AC11)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: { ...pricedCart([{ itemId: "tiramisu", quantity: 2 }]), subtotalCents: 1234 },
    });

    await fillValidDetails(user);

    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 2")).toBeInTheDocument();
    // The backend's subtotal, not unit × quantity (Phase 11 AC4).
    expect(screen.getByText("Total: $12.34")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeInTheDocument();
  });

  it("returns from review to details with every value intact (AC12)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, { cart: ONE_TIRAMISU });

    await fillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Edit details" }));

    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone number")).toHaveValue("5551234567");
  });

  it("moves focus into the review step rather than leaving it on the button that just unmounted (AC19)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, { cart: ONE_TIRAMISU });

    await fillValidDetails(user);

    expect(
      screen.getByRole("heading", { name: "Review your order" }),
    ).toHaveFocus();
  });

  it("blocks placing the order while a line is unavailable (Phase 11 AC8)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: pricedCart([{ itemId: "tiramisu", quantity: 1, available: false }]),
    });

    await fillValidDetails(user);

    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
  });
});

describe("CheckoutFlow — placing an order on commerce-api (Phase 11 AC10, AC11)", () => {
  it("POSTs only a key and the trimmed customer, then shows commerce-api's order and re-reads the emptied cart", async () => {
    const { stub, user } = await renderWithCart(
      <>
        <CartCountProbe />
        <CheckoutFlow />
      </>,
      { cart: ONE_TIRAMISU, replies: [PLACED, cartReply(EMPTY_CART)] },
    );

    await fillValidDetails(user, { fullName: "  Ada Lovelace ", phone: " 5551234567 " });
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(
      await screen.findByRole("heading", { name: "Order confirmed" }),
    ).toHaveFocus();
    const [post] = orderPosts(stub.calls);
    expect(post?.body).toEqual({
      idempotencyKey: expect.any(String),
      customer: { fullName: "Ada Lovelace", phone: "5551234567" },
    });

    // Guard order matters (Phase 4 AC15): the cart is now empty, but the
    // confirmed step still renders instead of the empty-cart notice.
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("0"));
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    expect(screen.getByText(ORDER_ID)).toBeInTheDocument();
    expect(screen.getByText("Tiramisu × 1")).toBeInTheDocument();
    expect(screen.getByText("Total: $7.50")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the menu" }),
    ).toHaveAttribute("href", "/");
  });

  it("announces the placed order with commerce-api's order id", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [PLACED, cartReply(EMPTY_CART)],
    });

    await fillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `Order placed. Your order number is ${ORDER_ID}.`,
      ),
    );
  });

  it("sends one request however many times Place order is activated, and shows Placing order… meanwhile", async () => {
    const response = deferred<Response>();
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [() => response.promise, cartReply(EMPTY_CART)],
    });
    await fillValidDetails(user);

    const button = screen.getByRole("button", { name: "Place order" });
    await user.click(button);
    await user.click(button);

    expect(screen.getByRole("button", { name: "Placing order…" })).toBeDisabled();
    expect(orderPosts(stub.calls)).toHaveLength(1);

    await act(async () => response.resolve(jsonResponse(orderResponse(), 201)));
    expect(await screen.findByRole("heading", { name: "Order confirmed" })).toBeInTheDocument();
    expect(orderPosts(stub.calls)).toHaveLength(1);
  });

  it("states that no payment was taken (ADR-0011, Phase 11 AC14)", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [PLACED, cartReply(EMPTY_CART)],
    });

    await fillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText(/no payment was taken/i)).toBeInTheDocument();
  });
});

describe("CheckoutFlow — order failures (Phase 11 AC12, AC13)", () => {
  it("after the automatic retries are exhausted, offers a manual retry with the same key", async () => {
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [
        { networkError: true },
        { networkError: true },
        { networkError: true },
        PLACED,
        cartReply(EMPTY_CART),
      ],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent(
      "We can't reach the restaurant right now. Check your connection and try again.",
    );
    expect(orderPosts(stub.calls)).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("heading", { name: "Order confirmed" })).toBeInTheDocument();
    const keys = orderPosts(stub.calls).map(keyOf);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(1);
  });

  it("uses a fresh key after the details are edited", async () => {
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [errorReply(500, "INTERNAL_ERROR"), PLACED, cartReply(EMPTY_CART)],
    });
    await fillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    await user.click(screen.getByRole("button", { name: "Place order" }));

    await screen.findByRole("heading", { name: "Order confirmed" });
    const [first, second] = orderPosts(stub.calls).map(keyOf);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("CART_EMPTY → re-reads the cart and shows the empty notice", async () => {
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [errorReply(422, "CART_EMPTY"), cartReply(EMPTY_CART)],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText("Your cart is empty.")).toBeInTheDocument();
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("MENU_ITEM_UNAVAILABLE → re-reads the cart, explains, and blocks placing until it is fixed", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [
        errorReply(422, "MENU_ITEM_UNAVAILABLE"),
        cartReply(pricedCart([{ itemId: "tiramisu", quantity: 1, available: false }])),
      ],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An item in your cart is no longer available. Please review your cart.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled(),
    );
  });

  it("CART_CONFLICT → re-reads the cart and asks the user to check it", async () => {
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [
        errorReply(409, "CART_CONFLICT"),
        cartReply(pricedCart([{ itemId: "tiramisu", quantity: 2 }])),
      ],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your cart was updated. Please check it and try again.",
    );
    expect(await screen.findByText("Tiramisu × 2")).toBeInTheDocument();
    expect(stub.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("a rejected customer field → back to the details step with that field's error, summary focused", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [
        {
          status: 400,
          body: { code: "INVALID_PAYLOAD", message: "customer.phone: Invalid string", field: "customer.phone" },
        },
      ],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByLabelText("Phone number")).toHaveValue("5551234567");
    const summary = screen.getByRole("group", { name: "There are errors in your details" });
    expect(summary).toHaveTextContent("Enter a valid phone number.");
    expect(summary).toHaveFocus();
    expect(screen.queryByText(/Invalid string/)).toBeNull();
  });

  it("IDEMPOTENCY_KEY_REUSED → asks to place again, with a new key", async () => {
    const { stub, user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [errorReply(409, "IDEMPOTENCY_KEY_REUSED"), PLACED, cartReply(EMPTY_CART)],
    });
    await fillValidDetails(user);
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please review your details and place the order again.",
    );
    await user.click(screen.getByRole("button", { name: "Place order" }));

    await screen.findByRole("heading", { name: "Order confirmed" });
    const [first, second] = orderPosts(stub.calls).map(keyOf);
    expect(first).not.toBe(second);
  });

  it("never renders the backend's own error message", async () => {
    const { user } = await renderWithCart(<CheckoutFlow />, {
      cart: ONE_TIRAMISU,
      replies: [errorReply(500, "INTERNAL_ERROR")],
    });
    await fillValidDetails(user);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side. Please try again.",
    );
    expect(screen.queryByText(/Backend detail/)).toBeNull();
  });
});
