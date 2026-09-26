import type { OrderResponse } from "@contracts/api-contracts";

// Checkout state for apps/web's /checkout flow. The order itself is not
// defined here: it is commerce-api's OrderResponse
// (@contracts/api-contracts), created by POST /v1/orders — see
// docs/features/phase-11-web-commerce-integration/plan.md §5. What is here
// is form and step state, which stays frontend-owned (plan.md §8).

export type CheckoutStep = "details" | "review" | "submitting" | "confirmed";

export type CustomerDetails = {
  fullName: string;
  phone: string;
  email: string;
};

export type CustomerDetailsErrors = Partial<
  Record<keyof CustomerDetails, string>
>;

// The fields OrderSummary renders — satisfied by both a cart line (review,
// live prices) and an order line (confirmation, prices as placed).
export type OrderSummaryLine = {
  itemId: string;
  name: string;
  quantity: number;
  lineSubtotalCents: number;
};

export type CheckoutState = {
  step: CheckoutStep;
  details: CustomerDetails;
  errors: CustomerDetailsErrors;
  submitAttempted: boolean;
  // One key per review of one set of details, reused for every retry of
  // that submission so a retry replays rather than duplicates the order;
  // cleared when the details are edited (plan.md OD12).
  idempotencyKey: string | null;
  // The last failed placement, shown on the review step (plan.md §11).
  submitError: unknown;
  // commerce-api's response, kept only to display the confirmation.
  order: OrderResponse | null;
};

export const initialCustomerDetails: CustomerDetails = {
  fullName: "",
  phone: "",
  email: "",
};

export const initialCheckoutState: CheckoutState = {
  step: "details",
  details: initialCustomerDetails,
  errors: {},
  submitAttempted: false,
  idempotencyKey: null,
  submitError: null,
  order: null,
};
