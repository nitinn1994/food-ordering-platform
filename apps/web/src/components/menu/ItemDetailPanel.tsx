"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuCategory } from "@contracts/api-contracts";
import { findMenuItemIn } from "../../lib/menu/menuSource";
import { formatCents } from "../../lib/money";
import { isVegetarian } from "../../lib/menu/diet";
import { useCart } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { useAddSettled } from "../../lib/cart/useConfirmedAdd";
import { FoodIllustration } from "../brand/illustrations";
import { Overlay } from "../ui/Overlay";
import styles from "./ItemDetailPanel.module.css";

// The item detail, now the reference's modal (docs/features/
// mcdelivery-parity/plan.md, Phase 3; AC7): a centred dialog over a
// blurred page on desktop, a bottom sheet below 1200px. It replaces the
// earlier non-modal side panel (docs/features/phase-2-menu-browsing/plan.md
// §6); the native <dialog> (components/ui/Overlay) supplies the focus trap
// and Escape that the side panel deliberately avoided hand-rolling.
// `children` is a slot rendered at the end — the item-detail nudge
// (mcdelivery-redesign Phase 4) — so it comes and goes with the detail.
export function ItemDetailPanel({
  categories,
  children,
}: {
  categories: readonly MenuCategory[];
  children?: ReactNode;
}) {
  const { detailItemId, showItemDetail } = useUi();
  const { addItem, pending } = useCart();
  const showRef = useRef(showItemDetail);
  showRef.current = showItemDetail;

  // The open item lives in the root uiStore, so it would outlive the page:
  // leaving with a detail open (Back, a link) must not reopen it on the
  // next page that shows details (review finding 2). The panel shows
  // nothing until mounted and drops any item left over from before; it
  // also closes the detail when its page goes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    showRef.current(null);
    setMounted(true);
    return () => {
      showRef.current(null);
    };
  }, []);

  // Closes once commerce-api confirms an add made from inside the detail —
  // its Add button or the suggestion below it — so the "Item added to cart"
  // toast, which a modal's top layer would cover, shows. An add started
  // anywhere else (a card, voice, chat) leaves it open (review finding 3).
  const startedHere = useRef(false);
  const clicking = useRef(false);
  useEffect(() => {
    // An add that begins during a click inside the detail is its own.
    if (pending?.op === "add" && clicking.current) startedHere.current = true;
  }, [pending]);
  useAddSettled((_itemId, confirmed) => {
    if (!startedHere.current) return;
    startedHere.current = false;
    if (confirmed) showRef.current(null);
  });

  if (!mounted || !detailItemId) {
    return null;
  }

  const item = findMenuItemIn(categories, detailItemId);

  if (!item) {
    return null;
  }

  const titleId = `item-detail-${item.id}`;
  const vegetarian = isVegetarian(item);
  const isAdding = pending?.op === "add" && pending.itemId === item.id;

  return (
    <Overlay key={item.id} labelledBy={titleId} onClose={() => showItemDetail(null)}>
      <div
        className={styles.panel}
        onClickCapture={() => {
          // Marks this click while it and the render it causes run (React
          // flushes a click's updates and effects before any timer).
          clicking.current = true;
          window.setTimeout(() => {
            clicking.current = false;
          }, 0);
        }}
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => showItemDetail(null)}
          aria-label="Close details"
        >
          ×
        </button>
        <div className={styles.image}>
          {item.imageUrl !== undefined ? (
            <img src={item.imageUrl} alt="" width={240} height={180} />
          ) : (
            <FoodIllustration />
          )}
        </div>
        {/* The marker sits beside the heading, not in it, so the dialog's
            name is just the item's. */}
        <div className={styles.title}>
          <span
            className={`${styles.marker} ${vegetarian ? styles.veg : styles.nonVeg}`}
            role="img"
            aria-label={vegetarian ? "Vegetarian" : "Non-vegetarian"}
          />
          <h2 id={titleId}>{item.name}</h2>
        </div>
        <p className={styles.price}>{formatCents(item.priceCents)}</p>
        <p>{item.longDescription}</p>
        <p className={styles.nutrition}>
          {item.weightGrams !== undefined && `${item.weightGrams} g · `}
          {item.calories} kcal
        </p>
        {item.dietaryTags.length > 0 && (
          <p>
            <strong>Dietary:</strong> {item.dietaryTags.join(", ")}
          </p>
        )}
        {item.allergens.length > 0 && (
          <p>
            <strong>Allergens:</strong> {item.allergens.join(", ")}
          </p>
        )}
        {item.available ? (
          <button
            type="button"
            className={styles.add}
            onClick={() => addItem(item.id)}
            disabled={pending !== null}
          >
            {isAdding ? "Adding…" : "Add to cart"}
          </button>
        ) : (
          <p role="status" className={styles.soldOut}>
            Currently unavailable.
          </p>
        )}
        {children}
      </div>
    </Overlay>
  );
}
