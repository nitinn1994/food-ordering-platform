"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./FormField.module.css";

// One place for the label/id/aria-invalid/aria-describedby wiring, so it
// cannot drift between the three checkout fields — the same discipline
// QuantityStepper already established for accessible names (Phase 3 AC15),
// extended to form controls (AC8). See
// docs/features/phase-4-frontend-checkout-simulation/plan.md §13, §19.
type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function FormField({ id, label, error, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
