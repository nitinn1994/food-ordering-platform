import { describe, expect, it } from "vitest";
import { checkoutReducer } from "./checkoutReducer";
import { initialCheckoutState } from "./types";
import type { CustomerDetails, SimulatedOrder } from "./types";

const VALID_DETAILS: CustomerDetails = {
  fullName: "Ada Lovelace",
  phone: "5551234567",
  email: "",
};

function fillValidDetails() {
  let state = initialCheckoutState;
  for (const [field, value] of Object.entries(VALID_DETAILS)) {
    state = checkoutReducer(state, {
      type: "SET_FIELD",
      field: field as keyof CustomerDetails,
      value,
    });
  }
  return state;
}

describe("checkoutReducer — SET_FIELD", () => {
  it("updates a single field without touching the others", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "SET_FIELD",
      field: "fullName",
      value: "Ada",
    });
    expect(state.details).toEqual({ fullName: "Ada", phone: "", email: "" });
  });

  it("does not validate before a submit has been attempted", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "SET_FIELD",
      field: "fullName",
      value: "",
    });
    expect(state.errors).toEqual({});
  });

  it("re-validates per keystroke once a submit has failed (AC10)", () => {
    const afterFailedSubmit = checkoutReducer(initialCheckoutState, {
      type: "SUBMIT_DETAILS",
    });
    expect(afterFailedSubmit.errors.fullName).toBeDefined();

    const afterFix = checkoutReducer(afterFailedSubmit, {
      type: "SET_FIELD",
      field: "fullName",
      value: "Ada",
    });
    expect(afterFix.errors.fullName).toBeUndefined();
    // phone is still blank and still invalid
    expect(afterFix.errors.phone).toBeDefined();
  });
});

describe("checkoutReducer — SUBMIT_DETAILS", () => {
  it("stays on details and records errors when invalid", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "SUBMIT_DETAILS",
    });
    expect(state.step).toBe("details");
    expect(state.submitAttempted).toBe(true);
    expect(Object.keys(state.errors).length).toBeGreaterThan(0);
  });

  it("advances to review when valid", () => {
    const filled = fillValidDetails();
    const state = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    expect(state.step).toBe("review");
    expect(state.errors).toEqual({});
  });

  it("is a no-op from any step other than details", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    const state = checkoutReducer(inReview, { type: "SUBMIT_DETAILS" });
    expect(state).toBe(inReview);
  });
});

describe("checkoutReducer — EDIT_DETAILS", () => {
  it("returns from review to details without clearing values", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    const state = checkoutReducer(inReview, { type: "EDIT_DETAILS" });
    expect(state.step).toBe("details");
    expect(state.details).toEqual(VALID_DETAILS);
  });

  it("is a no-op from details", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "EDIT_DETAILS",
    });
    expect(state).toBe(initialCheckoutState);
  });
});

describe("checkoutReducer — PLACE_ORDER", () => {
  it("moves from review to submitting", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    const state = checkoutReducer(inReview, { type: "PLACE_ORDER" });
    expect(state.step).toBe("submitting");
  });

  it("is a no-op from details — cannot skip review", () => {
    const filled = fillValidDetails();
    const state = checkoutReducer(filled, { type: "PLACE_ORDER" });
    expect(state.step).toBe("details");
  });

  it("is a no-op from submitting — a second activation cannot start a second submission (AC13)", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    const submitting = checkoutReducer(inReview, { type: "PLACE_ORDER" });
    const state = checkoutReducer(submitting, { type: "PLACE_ORDER" });
    expect(state).toBe(submitting);
  });
});

describe("checkoutReducer — ORDER_PLACED", () => {
  const order: SimulatedOrder = {
    orderId: "ORD-ABC123",
    placedAt: 0,
    customer: VALID_DETAILS,
    lines: [],
    subtotalCents: 0,
    totalCents: 0,
  };

  it("moves from submitting to confirmed and sets the order exactly once", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS" });
    const submitting = checkoutReducer(inReview, { type: "PLACE_ORDER" });
    const state = checkoutReducer(submitting, {
      type: "ORDER_PLACED",
      order,
    });
    expect(state.step).toBe("confirmed");
    expect(state.order).toBe(order);
  });

  it("is a no-op from any step other than submitting", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "ORDER_PLACED",
      order,
    });
    expect(state).toBe(initialCheckoutState);
  });
});
