import { describe, expect, it } from "vitest";
import { checkoutReducer } from "./checkoutReducer";
import { initialCheckoutState } from "./types";
import type { CustomerDetails } from "./types";
import { orderResponse } from "../../test/order";

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
      idempotencyKey: "key-1",
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
      idempotencyKey: "key-1",
    });
    expect(state.step).toBe("details");
    expect(state.submitAttempted).toBe(true);
    expect(Object.keys(state.errors).length).toBeGreaterThan(0);
  });

  it("advances to review when valid", () => {
    const filled = fillValidDetails();
    const state = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
    expect(state.step).toBe("review");
    expect(state.errors).toEqual({});
  });

  it("is a no-op from any step other than details", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
    const state = checkoutReducer(inReview, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
    expect(state).toBe(inReview);
  });
});

describe("checkoutReducer — EDIT_DETAILS", () => {
  it("returns from review to details without clearing values", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
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
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
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
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
    const submitting = checkoutReducer(inReview, { type: "PLACE_ORDER" });
    const state = checkoutReducer(submitting, { type: "PLACE_ORDER" });
    expect(state).toBe(submitting);
  });
});

describe("checkoutReducer — ORDER_PLACED", () => {
  const order = orderResponse();

  it("moves from submitting to confirmed and sets the order exactly once", () => {
    const filled = fillValidDetails();
    const inReview = checkoutReducer(filled, { type: "SUBMIT_DETAILS", idempotencyKey: "key-1" });
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

function submitting() {
  const inReview = checkoutReducer(fillValidDetails(), {
    type: "SUBMIT_DETAILS",
    idempotencyKey: "key-1",
  });
  return checkoutReducer(inReview, { type: "PLACE_ORDER" });
}

describe("checkoutReducer — idempotency key lifecycle (Phase 11 AC12)", () => {
  it("has no key until the details are submitted", () => {
    expect(initialCheckoutState.idempotencyKey).toBeNull();
    const invalid = checkoutReducer(initialCheckoutState, {
      type: "SUBMIT_DETAILS",
      idempotencyKey: "key-1",
    });
    expect(invalid.idempotencyKey).toBeNull();
  });

  it("takes the offered key on details → review", () => {
    const inReview = checkoutReducer(fillValidDetails(), {
      type: "SUBMIT_DETAILS",
      idempotencyKey: "key-1",
    });
    expect(inReview.idempotencyKey).toBe("key-1");
  });

  it("keeps the same key through placing and a failed placement", () => {
    const failed = checkoutReducer(submitting(), {
      type: "ORDER_FAILED",
      error: new Error("network"),
    });
    expect(failed.idempotencyKey).toBe("key-1");
    const again = checkoutReducer(failed, { type: "PLACE_ORDER" });
    expect(again.idempotencyKey).toBe("key-1");
  });

  it("drops the key when the details are edited, and takes a fresh one on the next review", () => {
    const inReview = checkoutReducer(fillValidDetails(), {
      type: "SUBMIT_DETAILS",
      idempotencyKey: "key-1",
    });
    const editing = checkoutReducer(inReview, { type: "EDIT_DETAILS" });
    expect(editing.idempotencyKey).toBeNull();
    const reviewed = checkoutReducer(editing, {
      type: "SUBMIT_DETAILS",
      idempotencyKey: "key-2",
    });
    expect(reviewed.idempotencyKey).toBe("key-2");
  });

  it("replaces the key when ORDER_FAILED carries a new one", () => {
    const failed = checkoutReducer(submitting(), {
      type: "ORDER_FAILED",
      error: new Error("reused"),
      idempotencyKey: "key-2",
    });
    expect(failed.idempotencyKey).toBe("key-2");
  });
});

describe("checkoutReducer — ORDER_FAILED (Phase 11 AC13)", () => {
  it("returns from submitting to review with the error", () => {
    const error = new Error("boom");
    const state = checkoutReducer(submitting(), { type: "ORDER_FAILED", error });
    expect(state.step).toBe("review");
    expect(state.submitError).toBe(error);
  });

  it("clears the error when the order is placed again", () => {
    const failed = checkoutReducer(submitting(), {
      type: "ORDER_FAILED",
      error: new Error("boom"),
    });
    expect(checkoutReducer(failed, { type: "PLACE_ORDER" }).submitError).toBeNull();
  });

  it("is a no-op from any step other than submitting", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "ORDER_FAILED",
      error: new Error("boom"),
    });
    expect(state).toBe(initialCheckoutState);
  });
});

describe("checkoutReducer — RETURN_TO_DETAILS (Phase 11 AC13)", () => {
  it("returns to details showing the rejected field, keeping values and dropping the key", () => {
    const state = checkoutReducer(submitting(), {
      type: "RETURN_TO_DETAILS",
      field: "phone",
      message: "Enter a valid phone number.",
    });
    expect(state.step).toBe("details");
    expect(state.errors).toEqual({ phone: "Enter a valid phone number." });
    expect(state.details).toEqual(VALID_DETAILS);
    expect(state.idempotencyKey).toBeNull();
    expect(state.submitAttempted).toBe(true);
  });

  it("is a no-op from any step other than submitting", () => {
    const state = checkoutReducer(initialCheckoutState, {
      type: "RETURN_TO_DETAILS",
      field: "phone",
      message: "x",
    });
    expect(state).toBe(initialCheckoutState);
  });
});
