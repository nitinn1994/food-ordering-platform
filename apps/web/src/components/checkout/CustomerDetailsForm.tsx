"use client";

import { useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { validateCustomerDetails } from "../../lib/checkout/validation";
import type {
  CustomerDetails,
  CustomerDetailsErrors,
} from "../../lib/checkout/types";
import { FormField } from "./FormField";
import styles from "./CustomerDetailsForm.module.css";

type FieldMeta = {
  field: keyof CustomerDetails;
  id: string;
  label: string;
  type: "text" | "tel" | "email";
  autoComplete: string;
  inputMode: "text" | "tel" | "email";
};

const FIELD_META: FieldMeta[] = [
  {
    field: "fullName",
    id: "checkout-full-name",
    label: "Full name",
    type: "text",
    autoComplete: "name",
    inputMode: "text",
  },
  {
    field: "phone",
    id: "checkout-phone",
    label: "Phone number",
    type: "tel",
    autoComplete: "tel",
    inputMode: "tel",
  },
  {
    field: "email",
    id: "checkout-email",
    label: "Email (optional)",
    type: "email",
    autoComplete: "email",
    inputMode: "email",
  },
];

// Hand-rolled — no form library, matching ChatInput (the only other form in
// apps/web) and no zod (a trust-boundary tool this trusted first-party
// input isn't). See
// docs/features/phase-4-frontend-checkout-simulation/plan.md § Dependencies
// required.
//
// details/errors are owned by the parent's checkoutReducer (single source
// of truth); this component only decides, at the moment of submission,
// what to do with a *fresh* synchronous validation result: move focus to
// the error summary and report the failure upward (AC9). `focusPending`
// exists so a keystroke's own per-field revalidation (AC10) — which also
// changes `errors` by reference — never steals focus back to the summary;
// only a submit sets it.
export function CustomerDetailsForm({
  details,
  errors,
  onChange,
  onSubmit,
  onValidationFailure,
}: {
  details: CustomerDetails;
  errors: CustomerDetailsErrors;
  onChange: (field: keyof CustomerDetails, value: string) => void;
  onSubmit: () => void;
  onValidationFailure: () => void;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  useEffect(() => {
    if (focusPending.current && Object.keys(errors).length > 0) {
      focusPending.current = false;
      summaryRef.current?.focus();
    }
  }, [errors]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The `errors` prop is still last render's value here — onSubmit()'s
    // dispatch hasn't been processed by React yet — so this is computed
    // fresh from the pure validator rather than read from props.
    const freshErrors = validateCustomerDetails(details);
    onSubmit();
    if (Object.keys(freshErrors).length > 0) {
      onValidationFailure();
      focusPending.current = true;
    }
  }

  const errorEntries = Object.entries(errors) as [
    keyof CustomerDetails,
    string,
  ][];

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {errorEntries.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="checkout-error-summary-heading"
          className={styles.errorSummary}
        >
          <h2 id="checkout-error-summary-heading">
            There are errors in your details
          </h2>
          <ul>
            {errorEntries.map(([field, message]) => {
              const meta = FIELD_META.find((entry) => entry.field === field);
              return (
                <li key={field}>
                  {meta ? <a href={`#${meta.id}`}>{message}</a> : message}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {FIELD_META.map((meta) => (
        <FormField
          key={meta.field}
          id={meta.id}
          label={meta.label}
          type={meta.type}
          autoComplete={meta.autoComplete}
          inputMode={meta.inputMode}
          value={details[meta.field]}
          error={errors[meta.field]}
          onChange={(event) => onChange(meta.field, event.target.value)}
        />
      ))}

      <div className={styles.actions}>
        <Link href="/cart">Back to cart</Link>
        <button type="submit">Continue to review</button>
      </div>
    </form>
  );
}
