"use client";

import { useReducer, useRef, useState, type ReactNode } from "react";
import { useCart } from "../../lib/state/cartStore";
import { checkoutReducer } from "../../lib/checkout/checkoutReducer";
import {
  initialCheckoutState,
  type CustomerDetails,
} from "../../lib/checkout/types";
import { createIdempotencyKey } from "../../lib/checkout/idempotencyKey";
import {
  customerFieldErrorFor,
  placeOrder,
  toCreateOrderRequest,
} from "../../lib/checkout/orderService";
import { ApiError } from "../../lib/api/errors";
import { COMMERCE_ERROR_CODES } from "../../lib/api/userMessages";
import { CartErrorMessage } from "../cart/CartErrorMessage";
import { EmptyCheckoutNotice } from "./EmptyCheckoutNotice";
import { CustomerDetailsForm } from "./CustomerDetailsForm";
import { CheckoutReview } from "./CheckoutReview";
import { OrderConfirmation } from "./OrderConfirmation";
import { CheckoutAnnouncer } from "./CheckoutAnnouncer";

const VALIDATION_FAILURE_MESSAGE =
  "There are errors in the form. Please review and correct them.";

// Placement failures after which the cart on screen may no longer be what
// the backend holds — re-read it (plan.md §10).
const CART_CHANGING_FAILURES: ReadonlySet<string> = new Set([
  COMMERCE_ERROR_CODES.CART_EMPTY,
  COMMERCE_ERROR_CODES.MENU_ITEM_UNAVAILABLE,
  COMMERCE_ERROR_CODES.CART_CONFLICT,
]);

// Owns the checkout step machine (lib/checkout/checkoutReducer.ts) and the
// guard that decides what /checkout shows. Guard order is deliberate — see
// docs/features/phase-4-frontend-checkout-simulation/plan.md §15: a
// confirmed order is checked BEFORE the empty-cart guard, because placing
// an order empties the cart. Checking "empty" first would blank the
// confirmation screen the instant an order succeeds — the single likeliest
// defect named in the plan's risk table.
//
// Everything commerce-related comes from commerce-api
// (docs/features/phase-11-web-commerce-integration/plan.md §5): the lines
// and total under review are the backend cart's, and "Place order" is
// POST /v1/orders, which builds the order from that server-side cart and
// empties it. This component sends only an idempotency key and the
// customer's details, then re-reads the cart. It never clears or edits the
// cart itself.
export function CheckoutFlow() {
  const { cart, status, refresh } = useCart();
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [announcement, setAnnouncement] = useState("");
  // `state.step` is this render's value; two clicks in one frame both see
  // "review". This ref is what makes the second one a no-op rather than a
  // second request (AC10 — the server's idempotency key is the backstop).
  const placing = useRef(false);

  function handleDetailsChange(field: keyof CustomerDetails, value: string) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  function handleDetailsSubmit() {
    dispatch({ type: "SUBMIT_DETAILS", idempotencyKey: createIdempotencyKey() });
  }

  function handleValidationFailure() {
    setAnnouncement(VALIDATION_FAILURE_MESSAGE);
  }

  function handleEditDetails() {
    dispatch({ type: "EDIT_DETAILS" });
  }

  async function handlePlaceOrder() {
    if (
      placing.current ||
      state.step !== "review" ||
      state.idempotencyKey === null
    ) {
      return;
    }
    placing.current = true;
    dispatch({ type: "PLACE_ORDER" });
    try {
      // Transient failures are retried inside placeOrder with this same
      // key; a manual "Place order" after a failure reuses it too, so any
      // retry replays the original order rather than creating a second one
      // (plan.md §13, OD12).
      const order = await placeOrder(
        toCreateOrderRequest(state.details, state.idempotencyKey),
      );
      dispatch({ type: "ORDER_PLACED", order });
      setAnnouncement(`Order placed. Your order number is ${order.orderId}.`);
      // The backend emptied the cart as part of placing the order.
      void refresh();
    } catch (error) {
      const fieldError = customerFieldErrorFor(error);
      if (fieldError) {
        dispatch({ type: "RETURN_TO_DETAILS", ...fieldError });
        setAnnouncement(VALIDATION_FAILURE_MESSAGE);
        return;
      }
      const code = error instanceof ApiError ? error.code : undefined;
      dispatch({
        type: "ORDER_FAILED",
        error,
        // The old key can never succeed again (plan.md §11).
        ...(code === COMMERCE_ERROR_CODES.IDEMPOTENCY_KEY_REUSED
          ? { idempotencyKey: createIdempotencyKey() }
          : {}),
      });
      if (code !== undefined && CART_CHANGING_FAILURES.has(code)) {
        void refresh();
      }
    } finally {
      placing.current = false;
    }
  }

  let content: ReactNode;
  if (state.step === "confirmed") {
    // state.order is always set by the time step becomes "confirmed" —
    // ORDER_PLACED (the only transition into this step) always carries one.
    content = state.order ? <OrderConfirmation order={state.order} /> : null;
  } else if (cart === null) {
    // Not yet loaded (or the load failed — CartErrorMessage then offers
    // "Try again"). Never the empty notice: an unknown cart is not an empty
    // one (plan.md §5).
    content = (
      <>
        <CartErrorMessage />
        {status === "loading" ? <p role="status">Loading your cart…</p> : null}
      </>
    );
  } else if (cart.items.length === 0) {
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
            lines={cart.items}
            totalCents={cart.subtotalCents}
            hasUnavailableItems={cart.items.some((line) => !line.available)}
            submitting={state.step === "submitting"}
            submitError={state.submitError}
            onEditDetails={handleEditDetails}
            onPlaceOrder={() => void handlePlaceOrder()}
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
