"use client";

import { useId, useState } from "react";
import { DEMO_OFFERS, filterOffers } from "../../lib/content/offers";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import styles from "./OfferGrid.module.css";

// The reference's coupon grid (docs/features/mcdelivery-parity/
// reference-inventory.md §9; AC9), display only (OQ3 (a)): there is no
// Apply button and nothing here touches the cart or its total. As on the
// reference, an offer the current cart is below the minimum for is shown
// greyed out — the comparison uses commerce-api's own subtotal.
export function OfferGrid() {
  const [query, setQuery] = useState("");
  const { cart } = useCart();
  const inputId = useId();
  const offers = filterOffers(DEMO_OFFERS, query);

  return (
    <div className={styles.offers}>
      <div className={styles.searchRow}>
        <label htmlFor={inputId} className={styles.label}>
          Search offers
        </label>
        <input
          id={inputId}
          type="search"
          className={styles.input}
          value={query}
          placeholder="Enter a code or keyword"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {offers.length === 0 ? (
        <p role="status">No offers match “{query.trim()}”.</p>
      ) : (
        <ul className={styles.grid}>
          {offers.map((offer) => {
            const belowMinimum = cart !== null && cart.subtotalCents < offer.minCartCents;
            return (
              <li
                key={offer.code}
                className={belowMinimum ? `${styles.card} ${styles.dimmed}` : styles.card}
              >
                <span className={styles.tag}>Demo offer</span>
                <h2 className={styles.title}>{offer.title}</h2>
                <p className={styles.description}>{offer.description}</p>
                <p className={styles.code}>
                  Code <strong>{offer.code}</strong>
                </p>
                <p className={styles.minimum}>
                  On orders of {formatCents(offer.minCartCents)} or more
                  {belowMinimum && " — add more to your cart to qualify"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
