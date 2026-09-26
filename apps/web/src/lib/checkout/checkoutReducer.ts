import type { OrderResponse } from "@contracts/api-contracts";
import { validateCustomerDetails } from "./validation";
import type { CheckoutState, CustomerDetails } from "./types";

// The checkout step machine — separated from any component so it is unit
// testable the same way uiReducer is. Lives entirely in apps/web; not a UI
// command and not added to uiStore or cartStore. See
// docs/features/phase-4-frontend-checkout-simulation/plan.md.
//
// Since Phase 11 "submitting" is a real POST /v1/orders, so it can fail:
// ORDER_FAILED returns to review with the error, and RETURN_TO_DETAILS
// returns to the form when commerce-api rejected a customer field
// (docs/features/phase-11-web-commerce-integration/plan.md §5). The reducer
// stays pure: the idempotency key is created by the caller and passed in.

export type CheckoutAction =
  | { type: "SET_FIELD"; field: keyof CustomerDetails; value: string }
  // `idempotencyKey` is used only if this review has none yet (OD12).
  | { type: "SUBMIT_DETAILS"; idempotencyKey: string }
  | { type: "EDIT_DETAILS" }
  | { type: "PLACE_ORDER" }
  | { type: "ORDER_PLACED"; order: OrderResponse }
  // `idempotencyKey`, when given, replaces the current one — after
  // IDEMPOTENCY_KEY_REUSED, when the old key can never succeed again.
  | { type: "ORDER_FAILED"; error: unknown; idempotencyKey?: string }
  | {
      type: "RETURN_TO_DETAILS";
      field: keyof CustomerDetails;
      message: string;
    };

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
      return {
        ...state,
        step: "review",
        errors: {},
        submitAttempted: true,
        idempotencyKey: state.idempotencyKey ?? action.idempotencyKey,
      };
    }
    case "EDIT_DETAILS":
      if (state.step !== "review") {
        return state;
      }
      // Edited details are a different order request: reusing the key would
      // be rejected (409 IDEMPOTENCY_KEY_REUSED), so it is dropped here and
      // a fresh one issued on the next SUBMIT_DETAILS (OD12).
      return { ...state, step: "details", idempotencyKey: null, submitError: null };
    case "PLACE_ORDER":
      // Only "review" may start a submission — this, plus "submitting"
      // rejecting a second PLACE_ORDER below, is what makes a second
      // activation of "Place order" a no-op rather than a second order
      // (AC13).
      if (state.step !== "review") {
        return state;
      }
      return { ...state, step: "submitting", submitError: null };
    case "ORDER_PLACED":
      if (state.step !== "submitting") {
        return state;
      }
      return { ...state, step: "confirmed", order: action.order };
    case "ORDER_FAILED":
      if (state.step !== "submitting") {
        return state;
      }
      return {
        ...state,
        step: "review",
        submitError: action.error,
        idempotencyKey: action.idempotencyKey ?? state.idempotencyKey,
      };
    case "RETURN_TO_DETAILS":
      if (state.step !== "submitting") {
        return state;
      }
      return {
        ...state,
        step: "details",
        errors: { [action.field]: action.message },
        submitAttempted: true,
        idempotencyKey: null,
        submitError: null,
      };
    default:
      return state;
  }
}
