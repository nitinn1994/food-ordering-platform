const CURRENCY = "USD";
const LOCALE = "en-US";

// Money is represented as integer cents throughout this app. Never store or
// compute money as a float — see docs/product/food-ordering-frontend-mvp.md §7.

export function formatCents(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(cents / 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
