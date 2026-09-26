"use client";

import styles from "./QuantityStepper.module.css";

// − / qty / + control. Bare "+"/"−" glyphs are never the accessible name —
// each button names the item it acts on (AC15). Disabled means genuinely
// inoperable (`disabled`, not `aria-disabled`) so a screen reader and a
// mouse agree on what can be pressed. `disabled` turns both off at once —
// while a cart mutation is in flight, or for an unavailable line
// (docs/features/phase-11-web-commerce-integration/plan.md §4).
export function QuantityStepper({
  itemName,
  quantity,
  maxQuantity,
  disabled = false,
  onIncrement,
  onDecrement,
}: {
  itemName: string;
  quantity: number;
  maxQuantity: number;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <span className={styles.stepper}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || quantity <= 1}
        aria-label={`Decrease quantity of ${itemName}`}
      >
        −
      </button>
      <span className={styles.quantity}>{quantity}</span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || quantity >= maxQuantity}
        aria-label={`Increase quantity of ${itemName}`}
      >
        +
      </button>
    </span>
  );
}
