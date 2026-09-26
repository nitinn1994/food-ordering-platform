"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { OrderSummary } from "./OrderSummary";
import type {
  CustomerDetails,
  OrderSummaryLine,
} from "../../lib/checkout/types";
import { userMessageFor } from "../../lib/api/userMessages";
import styles from "./CheckoutReview.module.css";

// Read-only recap of the details just entered, plus the same OrderSummary
// the confirmation step reuses (§13). The lines and total are commerce-api's
// live cart, not a client calculation
// (docs/features/phase-11-web-commerce-integration/plan.md §5).
//
// "Place order" is disabled while `submitting` — since Phase 11 a real,
// visible window while POST /v1/orders is in flight. What actually makes a
// second order impossible is layered: checkoutReducer's step guards,
// CheckoutFlow's own in-flight guard, and finally commerce-api's
// idempotency key. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §16.
//
// It is also disabled while any line is unavailable: commerce-api would
// refuse the order (422 MENU_ITEM_UNAVAILABLE), so the user is sent back to
// the cart up front (Phase 11 AC8, OD11). A failed placement is shown in an
// alert, in copy chosen by error code — never the backend's own words.
//
// Focuses its own heading on mount — the details→review transition named
// in §19. Without this, the "Continue to review" button that had focus
// unmounts along with CustomerDetailsForm, and focus silently falls back
// to <body>, which is exactly what §19 says to avoid.
export function CheckoutReview({
  details,
  lines,
  totalCents,
  hasUnavailableItems = false,
  submitting,
  submitError = null,
  onEditDetails,
  onPlaceOrder,
}: {
  details: CustomerDetails;
  lines: readonly OrderSummaryLine[];
  totalCents: number;
  hasUnavailableItems?: boolean;
  submitting: boolean;
  submitError?: unknown;
  onEditDetails: () => void;
  onPlaceOrder: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.review} aria-busy={submitting}>
      <h2 ref={headingRef} tabIndex={-1} className={styles.introHeading}>
        Review your order
      </h2>

      <section aria-labelledby="checkout-review-details-heading">
        <h3 id="checkout-review-details-heading">Your details</h3>
        <dl className={styles.detailsList}>
          <dt>Name</dt>
          <dd>{details.fullName}</dd>
          <dt>Phone</dt>
          <dd>{details.phone}</dd>
          {details.email ? (
            <>
              <dt>Email</dt>
              <dd>{details.email}</dd>
            </>
          ) : null}
        </dl>
        <button type="button" onClick={onEditDetails} disabled={submitting}>
          Edit details
        </button>
      </section>

      <section aria-labelledby="checkout-review-order-heading">
        <h3 id="checkout-review-order-heading">Your order</h3>
        <OrderSummary lines={lines} totalCents={totalCents} />
      </section>

      {submitError !== null ? (
        <p role="alert" className={styles.error}>
          {userMessageFor(submitError, "order")}
        </p>
      ) : null}

      {hasUnavailableItems ? (
        <p className={styles.error}>
          Some items in your cart are unavailable. Go back to your cart to
          remove them before placing the order.
        </p>
      ) : null}

      <div className={styles.actions}>
        <Link href="/cart">Back to cart</Link>
        <button
          type="button"
          onClick={onPlaceOrder}
          disabled={submitting || hasUnavailableItems}
        >
          {submitting ? "Placing order…" : "Place order"}
        </button>
      </div>
    </div>
  );
}
