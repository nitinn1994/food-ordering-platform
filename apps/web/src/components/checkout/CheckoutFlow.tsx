"use client";

import { useReducer, useState, type ReactNode } from "react";
import type { MenuCategory } from "../../lib/fixtures/menu";
import { useCart } from "../../lib/state/cartStore";
import { checkoutReducer } from "../../lib/checkout/checkoutReducer";
import {
  initialCheckoutState,
  type CustomerDetails,
} from "../../lib/checkout/types";
import { buildSimulatedOrder, resolveOrderLines } from "../../lib/checkout/order";
import { createOrderId } from "../../lib/checkout/orderId";
import { cartSubtotalCents } from "../../lib/cart/pricing";
import { EmptyCheckoutNotice } from "./EmptyCheckoutNotice";
import { CustomerDetailsForm } from "./CustomerDetailsForm";
import { CheckoutReview } from "./CheckoutReview";
import { OrderConfirmation } from "./OrderConfirmation";
import { CheckoutAnnouncer } from "./CheckoutAnnouncer";

const VALIDATION_FAILURE_MESSAGE =
  "There are errors in the form. Please review and correct them.";

// Owns the checkout step machine (lib/checkout/checkoutReducer.ts) and the
// guard that decides what /checkout shows. Guard order is deliberate — see
// docs/features/phase-4-frontend-checkout-simulation/plan.md §15: a
// confirmed order is checked BEFORE the empty-cart guard, because placing
// an order clears the cart (CLEAR_CART). Checking "empty" first would blank
// the confirmation screen the instant an order succeeds — the single
// likeliest defect named in the plan's risk table.
export function CheckoutFlow({
  categories,
}: {
  categories: readonly MenuCategory[];
}) {
  const { lines, clearCart } = useCart();
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [announcement, setAnnouncement] = useState("");

  function handleDetailsChange(field: keyof CustomerDetails, value: string) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  function handleDetailsSubmit() {
    dispatch({ type: "SUBMIT_DETAILS" });
  }

  function handleValidationFailure() {
    setAnnouncement(VALIDATION_FAILURE_MESSAGE);
  }

  function handleEditDetails() {
    dispatch({ type: "EDIT_DETAILS" });
  }

  // Everything below runs synchronously, in one event handler, per D9 (no
  // artificial submission latency) — docs/features/phase-4-frontend-
  // checkout-simulation/plan.md. checkoutReducer's own guards make a second
  // *persisted* order impossible (ORDER_PLACED is a no-op outside
  // "submitting"), but without this early return a second invocation of
  // this handler itself — a fast double-click landing before React commits
  // the disabled attribute, or a held-key repeat — would still build a
  // second, unpersisted order and re-announce it, mismatching what
  // OrderConfirmation actually shows. Guarding here, the same way
  // checkoutReducer guards its own transitions, makes the whole handler a
  // no-op on a second call, not just the state update.
  function handlePlaceOrder() {
    if (state.step !== "review") {
      return;
    }
    dispatch({ type: "PLACE_ORDER" });
    const order = buildSimulatedOrder(
      lines,
      categories,
      state.details,
      createOrderId(),
      Date.now(),
    );
    dispatch({ type: "ORDER_PLACED", order });
    clearCart();
    setAnnouncement(`Order placed. Your order number is ${order.orderId}.`);
  }

  let content: ReactNode;
  if (state.step === "confirmed") {
    // state.order is always set by the time step becomes "confirmed" —
    // ORDER_PLACED (the only transition into this step) always carries one.
    content = state.order ? <OrderConfirmation order={state.order} /> : null;
  } else if (lines.length === 0) {
    content = <EmptyCheckoutNotice />;
  } else {
    switch (state.step) {
      case "details":
        content = (
          <CustomerDetailsForm
            details={state.details}
            errors={state.errors}
            onChange={handleDetailsChange}
            onSubmit={handleDetailsSubmit}
            onValidationFailure={handleValidationFailure}
          />
        );
        break;
      case "review":
      case "submitting":
        content = (
          <CheckoutReview
            details={state.details}
            lines={resolveOrderLines(lines, categories)}
            totalCents={cartSubtotalCents(lines, categories)}
            submitting={state.step === "submitting"}
            onEditDetails={handleEditDetails}
            onPlaceOrder={handlePlaceOrder}
          />
        );
        break;
      default:
        content = null;
    }
  }

  return (
    <>
      <CheckoutAnnouncer message={announcement} />
      {content}
    </>
  );
}
