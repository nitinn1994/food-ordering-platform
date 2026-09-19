"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { OrderSummary } from "./OrderSummary";
import type {
  CustomerDetails,
  SimulatedOrderLine,
} from "../../lib/checkout/types";
import styles from "./CheckoutReview.module.css";

// Read-only recap of the details just entered, plus the same OrderSummary
// the confirmation step reuses (§13). "Place order" is disabled while
// `submitting` — in this phase's zero-latency design (D9) that window is
// not independently visible. What actually makes a second order
// impossible is layered: checkoutReducer's own step guards protect the
// persisted order, and CheckoutFlow.handlePlaceOrder guards itself the
// same way, so even a second invocation of the handler (this attribute's
// last line of defense failing) is a complete no-op. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §16.
//
// Focuses its own heading on mount — the details→review transition named
// in §19. Without this, the "Continue to review" button that had focus
// unmounts along with CustomerDetailsForm, and focus silently falls back
// to <body>, which is exactly what §19 says to avoid.
export function CheckoutReview({
  details,
  lines,
  totalCents,
  submitting,
  onEditDetails,
  onPlaceOrder,
}: {
  details: CustomerDetails;
  lines: readonly SimulatedOrderLine[];
  totalCents: number;
  submitting: boolean;
  onEditDetails: () => void;
  onPlaceOrder: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.review}>
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

      <div className={styles.actions}>
        <Link href="/cart">Back to cart</Link>
        <button type="button" onClick={onPlaceOrder} disabled={submitting}>
          Place order
        </button>
      </div>
    </div>
  );
}
