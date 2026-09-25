import { describe, expect, it } from "vitest";
import { agentIntentRequestSchema } from "./envelope";
import { parseIntentRequest } from "./parse";

const VALID_META = {
  contractVersion: 1,
  correlationId: "turn_7f3a",
  idempotencyKey: "01HQ8ZK9",
  issuedAt: "2026-09-19T10:04:09.000Z",
} as const;

describe("agentIntentRequestSchema (AC6)", () => {
  it("accepts a well-formed request", () => {
    const result = agentIntentRequestSchema.safeParse({
      ...VALID_META,
      intent: { type: "AddItemToCart", itemId: "tiramisu", quantity: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognised contractVersion", () => {
    const result = agentIntentRequestSchema.safeParse({
      ...VALID_META,
      contractVersion: 2,
      intent: { type: "AddItemToCart", itemId: "tiramisu", quantity: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing idempotencyKey", () => {
    const withoutIdempotencyKey: Record<string, unknown> = { ...VALID_META };
    delete withoutIdempotencyKey.idempotencyKey;
    const result = agentIntentRequestSchema.safeParse({
      ...withoutIdempotencyKey,
      intent: { type: "AddItemToCart", itemId: "tiramisu", quantity: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on the envelope", () => {
    const result = agentIntentRequestSchema.safeParse({
      ...VALID_META,
      intent: { type: "AddItemToCart", itemId: "tiramisu", quantity: 1 },
      cartId: "cart-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed intent inside an otherwise valid envelope", () => {
    // Unlike the UI command batch, there is exactly one intent per request —
    // no partial acceptance to preserve (plan.md §5.3).
    const result = agentIntentRequestSchema.safeParse({
      ...VALID_META,
      intent: { type: "AddItemToCart", itemId: "tiramisu" },
    });
    expect(result.success).toBe(false);
  });
});

describe("parseIntentRequest (AC6)", () => {
  it("accepts a well-formed request", () => {
    const result = parseIntentRequest({
      ...VALID_META,
      intent: { type: "RemoveItemFromCart", itemId: "tiramisu" },
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects the whole request when the envelope is malformed", () => {
    const result = parseIntentRequest({
      intent: { type: "RemoveItemFromCart", itemId: "tiramisu" },
    });
    expect(result.accepted).toBe(false);
  });

  it("never throws on arbitrary input", () => {
    for (const input of [null, undefined, 42, "string", [], {}]) {
      expect(() => parseIntentRequest(input)).not.toThrow();
    }
  });
});
