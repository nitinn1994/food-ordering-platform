// Frontend-only checkout types. Everything here is throwaway simulation
// state, not a contract — see lib/checkout/order.ts's header comment and
// docs/features/phase-4-frontend-checkout-simulation/plan.md. None of this
// is added to packages/contracts/: placing an order is a business intent
// (system-architecture.md §4.4), and commerce-api will define the real
// shape when it exists.

export type CheckoutStep = "details" | "review" | "submitting" | "confirmed";

export type CustomerDetails = {
  fullName: string;
  phone: string;
  email: string;
};

export type CustomerDetailsErrors = Partial<
  Record<keyof CustomerDetails, string>
>;

export type SimulatedOrderLine = {
  itemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineSubtotalCents: number;
};

// totalCents is always subtotalCents in this phase (D5, no tax/fee/tip/
// discount) — see lib/checkout/order.ts for where that equality is set.
export type SimulatedOrder = {
  orderId: string;
  placedAt: number;
  customer: CustomerDetails;
  lines: SimulatedOrderLine[];
  subtotalCents: number;
  totalCents: number;
};

export type CheckoutState = {
  step: CheckoutStep;
  details: CustomerDetails;
  errors: CustomerDetailsErrors;
  submitAttempted: boolean;
  order: SimulatedOrder | null;
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
  order: null,
};
