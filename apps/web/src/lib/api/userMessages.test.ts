import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import {
  GENERIC_REJECTION_MESSAGE,
  SERVER_ERROR_MESSAGE,
  UNREACHABLE_MESSAGE,
  userMessageFor,
} from "./userMessages";

function http(status: number, code?: string): ApiError {
  return new ApiError({ kind: "http", status, code });
}

describe("userMessageFor — by kind", () => {
  it.each(["cart", "order", "agent"] as const)("network and timeout → unreachable (%s)", (context) => {
    expect(userMessageFor(new ApiError({ kind: "network" }), context)).toBe(UNREACHABLE_MESSAGE);
    expect(userMessageFor(new ApiError({ kind: "timeout" }), context)).toBe(UNREACHABLE_MESSAGE);
  });

  it("5xx, 503 and an invalid response → server error", () => {
    expect(userMessageFor(http(500, "INTERNAL_ERROR"), "cart")).toBe(SERVER_ERROR_MESSAGE);
    expect(userMessageFor(http(503, "SERVICE_UNAVAILABLE"), "order")).toBe(SERVER_ERROR_MESSAGE);
    expect(userMessageFor(new ApiError({ kind: "invalid-response", status: 200 }), "cart")).toBe(
      SERVER_ERROR_MESSAGE,
    );
  });

  it("anything that is not an ApiError → server error", () => {
    expect(userMessageFor(new Error("boom: internal detail"), "cart")).toBe(SERVER_ERROR_MESSAGE);
  });

  it("an unknown 4xx code → generic rejection", () => {
    expect(userMessageFor(http(418, "SOMETHING_NEW"), "cart")).toBe(GENERIC_REJECTION_MESSAGE);
    expect(userMessageFor(http(404, "ROUTE_NOT_FOUND"), "order")).toBe(GENERIC_REJECTION_MESSAGE);
  });
});

describe("userMessageFor — by code", () => {
  it.each([
    ["INVALID_PAYLOAD", 400, "That change couldn't be made."],
    ["MENU_ITEM_NOT_FOUND", 404, "That item is no longer on the menu."],
    ["MENU_ITEM_UNAVAILABLE", 422, "Sorry, that item is currently unavailable."],
    ["CART_ITEM_NOT_FOUND", 404, "That item is no longer in your cart."],
    ["CART_ITEM_QUANTITY_LIMIT_EXCEEDED", 422, "You've reached the maximum quantity for this item."],
    ["CART_CONFLICT", 409, "Your cart was updated. Please check it and try again."],
  ])("cart: %s", (code, status, expected) => {
    expect(userMessageFor(http(status, code), "cart")).toBe(expected);
  });

  it.each([
    ["INVALID_PAYLOAD", 400, "Please check your details and try again."],
    [
      "MENU_ITEM_UNAVAILABLE",
      422,
      "An item in your cart is no longer available. Please review your cart.",
    ],
    ["CART_CONFLICT", 409, "Your cart was updated. Please check it and try again."],
    ["CART_EMPTY", 422, "Your cart is empty."],
    ["IDEMPOTENCY_KEY_REUSED", 409, "Please review your details and place the order again."],
  ])("order: %s", (code, status, expected) => {
    expect(userMessageFor(http(status, code), "order")).toBe(expected);
  });
});

// Phase 15: a chat turn to ai-service.
describe("userMessageFor — agent", () => {
  it("AGENT_FAILED (500) → the server-error copy, never the backend message", () => {
    const message = userMessageFor(http(500, "AGENT_FAILED"), "agent");
    expect(message).toBe(SERVER_ERROR_MESSAGE);
  });

  it("a rejected message has its own copy", () => {
    expect(userMessageFor(http(400, "INVALID_PAYLOAD"), "agent")).toBe(
      "I couldn't read that message. Please try rephrasing it.",
    );
  });

  it("any other refusal → the generic copy", () => {
    expect(userMessageFor(http(413, "PAYLOAD_TOO_LARGE"), "agent")).toBe(
      GENERIC_REJECTION_MESSAGE,
    );
  });
});
