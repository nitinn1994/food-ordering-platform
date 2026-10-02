const CURRENCY = "INR";
const LOCALE = "en-IN";

// Money is represented as integer cents throughout this app. Never store or
// compute money as a float — see docs/product/food-ordering-frontend-mvp.md §7.
// With INR the minor unit is the paisa; the name "cents" is kept, as in the
// contracts (priceCents, subtotalCents).
//
// Whole amounts drop the ".00" (₹165), as on the reference design; others
// keep two digits (₹12.50) — docs/features/mcdelivery-redesign/plan.md OQ3.
export function formatCents(cents: number): string {
  const fractionDigits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
