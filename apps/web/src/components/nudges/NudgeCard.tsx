"use client";

import type { Nudge } from "@contracts/api-contracts";
import { formatCents } from "../../lib/money";
import { useCart } from "../../lib/state/cartStore";
import styles from "./NudgeCard.module.css";

// One nudge, on any surface (docs/features/mcdelivery-redesign/
// requirements.md AC-N5, AC-N6). Always both choices, equal weight: "Add",
// which is the customer's own add-to-cart (POST /v1/cart/items, then the
// cart re-reads), and "No thanks". Nothing is ever added without a press.
// The copy is commerce-api's; nothing here adds urgency. `onClose` closes
// the item for the session (both choices do) and hides the card.
export function NudgeCard({
  nudge,
  label,
  onClose,
  variant = "card",
}: {
  nudge: Nudge;
  label: string;
  onClose: () => void;
  variant?: "card" | "row" | "toast";
}) {
  const { addItem, pending } = useCart();

  return (
    <section className={`${styles.nudge} ${styles[variant]}`} aria-label={label}>
      {nudge.imageUrl !== undefined && (
        <img className={styles.image} src={nudge.imageUrl} alt="" width={56} height={42} />
      )}
      <div className={styles.text}>
        <p className={styles.headline}>{nudge.headline}</p>
        <p className={styles.price}>{formatCents(nudge.priceCents)}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.add}
          disabled={pending !== null}
          aria-label={`Add ${nudge.itemName}`}
          onClick={() => {
            addItem(nudge.itemId);
            onClose();
          }}
        >
          Add
        </button>
        <button
          type="button"
          className={styles.dismiss}
          onClick={onClose}
        >
          No thanks
        </button>
      </div>
    </section>
  );
}
