"use client";

import type { MenuItem } from "@contracts/api-contracts";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { isVegetarian } from "../../lib/menu/diet";
import { BADGE_LABELS } from "../../lib/menu/featured";
import { FoodIllustration } from "../brand/illustrations";
import styles from "./MenuItemCard.module.css";

// "Add to cart" is the one cart action that sends a delta (POST, quantity
// 1). Disabled while any cart mutation is in flight; the card whose add is
// in flight says so (docs/features/phase-11-web-commerce-integration/
// plan.md §4, §12). `available` is only a hint here — commerce-api is what
// enforces it.
//
// The card anatomy follows the reference design (docs/features/
// mcdelivery-redesign/requirements.md AC-U3): veg marker, image, name,
// one-line description, price, a full-width "Add +" button, then allergens
// and calories. The Add button's accessible name stays "Add to cart" — the
// visible "Add" is part of it, and "+" is decorative.
export function MenuItemCard({ item }: { item: MenuItem }) {
  const { addItem, pending } = useCart();
  const isAdding = pending?.op === "add" && pending.itemId === item.id;
  const { highlightedItemId, showItemDetail } = useUi();
  const isHighlighted = item.id === highlightedItemId;
  const vegetarian = isVegetarian(item);

  return (
    <li
      className={
        isHighlighted ? `${styles.card} ${styles.highlighted}` : styles.card
      }
    >
      {item.badge !== undefined && (
        <span className={styles.badge}>{BADGE_LABELS[item.badge]}</span>
      )}
      <span
        className={`${styles.marker} ${vegetarian ? styles.veg : styles.nonVeg}`}
        role="img"
        aria-label={vegetarian ? "Vegetarian" : "Non-vegetarian"}
      />
      <button
        type="button"
        className={styles.detailsButton}
        onClick={() => showItemDetail(item.id)}
        aria-label={`View details for ${item.name}`}
      >
        <span className={styles.image}>
          {item.imageUrl !== undefined ? (
            // Decorative: the name is right below. A same-origin path, per
            // the contract; plain <img>, since menu art is small static SVG.
            <img src={item.imageUrl} alt="" width={180} height={135} loading="lazy" />
          ) : (
            <FoodIllustration />
          )}
        </span>
        <h3 className={styles.name}>{item.name}</h3>
        <p className={styles.description}>{item.description}</p>
        <p className={styles.price}>{formatCents(item.priceCents)}</p>
      </button>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => addItem(item.id)}
        disabled={!item.available || pending !== null}
        aria-label={item.available && !isAdding ? "Add to cart" : undefined}
      >
        {!item.available ? (
          "Unavailable"
        ) : isAdding ? (
          "Adding…"
        ) : (
          <>
            Add <span aria-hidden="true">+</span>
          </>
        )}
      </button>
      <p className={styles.meta}>
        <span>
          {item.allergens.length > 0
            ? `Contains: ${item.allergens.join(", ")}`
            : "No listed allergens"}
        </span>
        <span>
          {item.weightGrams !== undefined && `${item.weightGrams} g · `}
          {item.calories} kcal
        </span>
      </p>
    </li>
  );
}
