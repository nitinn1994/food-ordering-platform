import { validateCustomerDetails } from "./validation";
import type { CheckoutState, CustomerDetails, SimulatedOrder } from "./types";

// The checkout step machine — separated from any component so it is unit
// testable the same way cartReducer and uiReducer are. Lives entirely in
// apps/web; not a UI command and not added to uiStore or cartStore. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md.

export type CheckoutAction =
  | { type: "SET_FIELD"; field: keyof CustomerDetails; value: string }
  | { type: "SUBMIT_DETAILS" }
  | { type: "EDIT_DETAILS" }
  | { type: "PLACE_ORDER" }
  | { type: "ORDER_PLACED"; order: SimulatedOrder };

export function checkoutReducer(
  state: CheckoutState,
  action: CheckoutAction,
): CheckoutState {
  switch (action.type) {
    case "SET_FIELD": {
      const details = { ...state.details, [action.field]: action.value };
      if (!state.submitAttempted) {
        return { ...state, details };
      }
      // Once a submit has failed, re-validate per keystroke so a fixed
      // field's error clears without requiring another submit (AC10).
      const errors = validateCustomerDetails(details);
      return { ...state, details, errors };
    }
    case "SUBMIT_DETAILS": {
      if (state.step !== "details") {
        return state;
      }
      const errors = validateCustomerDetails(state.details);
      if (Object.keys(errors).length > 0) {
        return { ...state, errors, submitAttempted: true };
      }
      return { ...state, step: "review", errors: {}, submitAttempted: true };
    }
    case "EDIT_DETAILS":
      if (state.step !== "review") {
        return state;
      }
      return { ...state, step: "details" };
    case "PLACE_ORDER":
      // Only "review" may start a submission — this, plus "submitting"
      // rejecting a second PLACE_ORDER below, is what makes a second
      // activation of "Place order" a no-op rather than a second order
      // (AC13).
      if (state.step !== "review") {
        return state;
      }
      return { ...state, step: "submitting" };
    case "ORDER_PLACED":
      if (state.step !== "submitting") {
        return state;
      }
      return { ...state, step: "confirmed", order: action.order };
    default:
      return state;
  }
}
