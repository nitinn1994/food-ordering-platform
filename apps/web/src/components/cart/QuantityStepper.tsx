"use client";

import styles from "./QuantityStepper.module.css";

// − / qty / + control. Bare "+"/"−" glyphs are never the accessible name —
// each button names the item it acts on (AC15). Disabled means genuinely
// inoperable (`disabled`, not `aria-disabled`) so a screen reader and a
// mouse agree on what can be pressed.
export function QuantityStepper({
  itemName,
  quantity,
  maxQuantity,
  onIncrement,
  onDecrement,
}: {
  itemName: string;
  quantity: number;
  maxQuantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <span className={styles.stepper}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={quantity <= 1}
        aria-label={`Decrease quantity of ${itemName}`}
      >
        −
      </button>
      <span className={styles.quantity}>{quantity}</span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={quantity >= maxQuantity}
        aria-label={`Increase quantity of ${itemName}`}
      >
        +
      </button>
    </span>
  );
}
