"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { OrderSummary } from "./OrderSummary";
import type { SimulatedOrder } from "../../lib/checkout/types";
import styles from "./OrderConfirmation.module.css";

// Renders entirely from an immutable order snapshot — never reads useCart
// or the checkout reducer — so it is unaffected by the cart being cleared
// the instant the order was placed (AC15). See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §16.
//
// Focuses its own heading on mount — the review→confirmed transition named
// in §19. Without this, whichever control had focus in CheckoutReview
// ("Place order") unmounts along with it, and focus silently falls back to
// <body>, which is exactly what §19 says to avoid.
export function OrderConfirmation({ order }: { order: SimulatedOrder }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const placedAt = new Date(order.placedAt);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.confirmation}>
      <h2 ref={headingRef} tabIndex={-1} className={styles.introHeading}>
        Order confirmed
      </h2>
      <p className={styles.orderId}>
        Order <strong>{order.orderId}</strong>
      </p>
      <p>
        Placed{" "}
        <time dateTime={placedAt.toISOString()}>
          {placedAt.toLocaleString()}
        </time>
      </p>

      <section aria-labelledby="checkout-confirmation-details-heading">
        <h3 id="checkout-confirmation-details-heading">Your details</h3>
        <dl className={styles.detailsList}>
          <dt>Name</dt>
          <dd>{order.customer.fullName}</dd>
          <dt>Phone</dt>
          <dd>{order.customer.phone}</dd>
          {order.customer.email ? (
            <>
              <dt>Email</dt>
              <dd>{order.customer.email}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="checkout-confirmation-order-heading">
        <h3 id="checkout-confirmation-order-heading">Your order</h3>
        <OrderSummary lines={order.lines} totalCents={order.totalCents} />
      </section>

      <p className={styles.simulationNotice}>
        This is a simulated order. Nothing was sent to a restaurant and no
        payment was taken.
      </p>

      <Link href="/">Back to the menu</Link>
    </div>
  );
}
