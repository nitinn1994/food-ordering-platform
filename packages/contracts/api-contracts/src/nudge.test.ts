import { describe, expect, it } from "vitest";
import { nudgeSchema, nudgesQuerySchema, nudgesResponseSchema } from "./nudge";

// docs/features/mcdelivery-redesign/plan.md, Phase 3 (AC-N2–N4).
const VALID_NUDGE = {
  id: "rule:complete-meal-side:fries-medium",
  kind: "complete-meal",
  surface: "cart",
  itemId: "fries-medium",
  itemName: "Fries (Medium)",
  headline: "Add Fries (Medium) to complete your meal",
  priceCents: 10900,
  imageUrl: "/menu/fries.svg",
};

describe("nudgeSchema", () => {
  it("accepts a well-formed nudge, with or without an image", () => {
    expect(nudgeSchema.safeParse(VALID_NUDGE).success).toBe(true);
    expect(nudgeSchema.safeParse({ ...VALID_NUDGE, imageUrl: undefined }).success).toBe(true);
  });

  it.each([
    ["an unknown key", { ...VALID_NUDGE, urgency: "only 2 left" }],
    ["an id outside rule:<rule>:<item>", { ...VALID_NUDGE, id: "fries-medium" }],
    ["an unknown kind", { ...VALID_NUDGE, kind: "scarcity" }],
    ["an unknown surface", { ...VALID_NUDGE, surface: "checkout" }],
    ["a negative price", { ...VALID_NUDGE, priceCents: -1 }],
    ["an off-origin image", { ...VALID_NUDGE, imageUrl: "https://x.test/a.svg" }],
    ["an over-long headline", { ...VALID_NUDGE, headline: "a".repeat(121) }],
  ])("rejects %s", (_label, nudge) => {
    expect(nudgeSchema.safeParse(nudge).success).toBe(false);
  });
});

describe("nudgesQuerySchema", () => {
  it("accepts a surface with an optional item id", () => {
    expect(nudgesQuerySchema.safeParse({ surface: "cart" }).success).toBe(true);
    expect(
      nudgesQuerySchema.safeParse({ surface: "item-detail", itemId: "fries-medium" }).success,
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ surface: "checkout" }],
    [{ surface: "cart", itemId: "Bad_ID" }],
    [{ surface: "cart", extra: "1" }],
  ])("rejects %j", (query) => {
    expect(nudgesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("nudgesResponseSchema", () => {
  it("allows zero or one nudge, never more (AC-N3)", () => {
    expect(nudgesResponseSchema.safeParse({ nudges: [] }).success).toBe(true);
    expect(nudgesResponseSchema.safeParse({ nudges: [VALID_NUDGE] }).success).toBe(true);
    expect(nudgesResponseSchema.safeParse({ nudges: [VALID_NUDGE, VALID_NUDGE] }).success).toBe(
      false,
    );
  });
});
