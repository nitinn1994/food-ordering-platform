import { describe, expect, it } from "vitest";
import { nudgeIdSchema, nudgesResponseSchema } from "@contracts/api-contracts";
import { toNudgesResponse } from "../nudges.mapper";
import { evaluateNudges } from "./nudge.engine";
import { DESSERT_MIN_SUBTOTAL_CENTS, NUDGE_RULES } from "./nudge.rules";
import type { NudgeContext, NudgeMenuItem, NudgeSurface } from "./nudge.types";

// docs/features/mcdelivery-redesign/requirements.md AC-N1–AC-N3, AC-N5
// (copy), at the engine level: pure, so every case is a plain context.

function item(
  id: string,
  categoryId: string,
  extra: Partial<NudgeMenuItem> = {},
): NudgeMenuItem {
  return {
    id,
    categoryId,
    name: id.replace(/-/g, " "),
    priceCents: 10000,
    available: true,
    featured: [],
    ...extra,
  };
}

const MENU: readonly NudgeMenuItem[] = [
  item("egg-muffin", "breakfast"),
  item("veg-burger", "burgers-wraps"),
  item("chicken-burger", "burgers-wraps", { featured: ["popular"] }),
  item("peri-fries", "fries-sides"),
  item("fries", "fries-sides", { featured: ["popular"], imageUrl: "/menu/fries.svg" }),
  item("veg-meal", "meals"),
  item("cola", "beverages"),
  item("mango-smoothie", "beverages", { available: false }),
  item("cone", "sweets"),
  item("brownie", "sweets", { featured: ["new-launch"] }),
];

// 15:00 in Asia/Kolkata — outside the breakfast window.
const AFTERNOON = new Date("2026-10-01T09:30:00Z");
// 08:00 in Asia/Kolkata.
const MORNING = new Date("2026-10-01T02:30:00Z");

function context(
  cart: readonly string[],
  overrides: Partial<NudgeContext> & { surface?: NudgeSurface } = {},
): NudgeContext {
  return {
    surface: "cart",
    menu: MENU,
    cartItemIds: new Set(cart),
    cartSubtotalCents: cart.length * 10000,
    now: AFTERNOON,
    ...overrides,
  };
}

function only(nudgeContext: NudgeContext) {
  const nudges = evaluateNudges(nudgeContext);
  expect(nudges.length).toBeLessThanOrEqual(1);
  return nudges[0];
}

describe("evaluateNudges — cart surfaces", () => {
  it.each(["cart", "post-add", "voice"] as const)(
    "returns nothing for an empty cart on %s (AC-N1)",
    (surface) => {
      expect(evaluateNudges(context([], { surface, now: MORNING }))).toEqual([]);
    },
  );

  it("suggests a side for a main with no side, popular first (AC-N1)", () => {
    expect(only(context(["veg-burger"]))).toEqual({
      id: "rule:complete-meal-side:fries",
      kind: "complete-meal",
      surface: "cart",
      itemId: "fries",
      itemName: "fries",
      headline: "Add fries to complete your meal",
      priceCents: 10000,
      imageUrl: "/menu/fries.svg",
    });
  });

  it("suggests a drink once there is a main and a side, skipping unavailable drinks", () => {
    expect(only(context(["veg-burger", "fries"]))?.itemId).toBe("cola");
  });

  it("suggests a dessert after a full meal above the threshold, and not below it", () => {
    const full = ["veg-burger", "fries", "cola"];
    expect(only(context(full))?.itemId).toBe("cone");
    expect(
      evaluateNudges(context(full, { cartSubtotalCents: DESSERT_MIN_SUBTOTAL_CENTS - 1 })),
    ).toEqual([]);
  });

  it("treats a meal item as a main, a side and a drink", () => {
    // No side or drink is suggested; above the threshold, a dessert is.
    const meal = context(["veg-meal"], { cartSubtotalCents: DESSERT_MIN_SUBTOTAL_CENTS });
    expect(only(meal)).toMatchObject({ id: "rule:complete-meal-dessert:cone", itemId: "cone" });
    expect(evaluateNudges(context(["veg-meal"], { cartSubtotalCents: 100 }))).toEqual([]);
  });

  it("does not suggest a dessert when the cart already has one", () => {
    expect(evaluateNudges(context(["veg-burger", "fries", "cola", "cone"]))).toEqual([]);
  });

  it("never suggests an item already in the cart (AC-N3)", () => {
    // Viewing a main pairs a side; the popular side is already in the cart.
    const nudge = only(
      context(["fries"], { surface: "item-detail", focusItemId: "veg-burger" }),
    );
    expect(nudge?.itemId).toBe("peri-fries");
  });

  it("never suggests an unavailable item, and returns nothing when no candidate is eligible (AC-N2)", () => {
    const menu = MENU.map((menuItem) =>
      menuItem.categoryId === "fries-sides" ? { ...menuItem, available: false } : menuItem,
    );
    expect(only(context(["veg-burger"], { menu }))?.itemId).toBe("cola");
  });

  it("never suggests the item that was just added (post-add focus)", () => {
    const nudge = only(context(["veg-burger"], { surface: "post-add", focusItemId: "fries" }));
    expect(nudge?.itemId).toBe("peri-fries");
    expect(nudge?.surface).toBe("post-add");
  });

  it("uses the price in this request's menu, not a stored one (AC-N2)", () => {
    const menu = MENU.map((menuItem) =>
      menuItem.id === "fries" ? { ...menuItem, priceCents: 12345 } : menuItem,
    );
    expect(only(context(["veg-burger"], { menu }))?.priceCents).toBe(12345);
  });

  it("suggests breakfast in the morning (Asia/Kolkata) when nothing else applies", () => {
    const nudge = only(context(["cone"], { now: MORNING }));
    expect(nudge).toMatchObject({ kind: "time-of-day", itemId: "egg-muffin" });
    expect(evaluateNudges(context(["cone"], { now: AFTERNOON }))).toEqual([]);
  });

  it("returns at most one nudge even when several rules apply (AC-N3)", () => {
    expect(evaluateNudges(context(["veg-burger"], { now: MORNING }))).toHaveLength(1);
  });
});

describe("evaluateNudges — item-detail", () => {
  it("pairs a viewed main with a side", () => {
    const nudge = only(context([], { surface: "item-detail", focusItemId: "veg-burger" }));
    expect(nudge).toMatchObject({ kind: "pairing", itemId: "fries", headline: "Pairs well with fries" });
  });

  it("pairs a viewed drink with a dessert, never the viewed item itself", () => {
    expect(only(context([], { surface: "item-detail", focusItemId: "cola" }))?.itemId).toBe("cone");
    expect(only(context([], { surface: "item-detail", focusItemId: "cone" }))?.itemId).toBe("cola");
  });

  it("spotlights a new launch on an empty cart when the viewed item has no pairing", () => {
    const nudge = only(context([], { surface: "item-detail", focusItemId: "unknown-item" }));
    expect(nudge).toMatchObject({ kind: "new-launch", itemId: "brownie" });
    expect(
      evaluateNudges(context(["cola"], { surface: "item-detail", focusItemId: "unknown-item" })),
    ).toEqual([]);
  });

  it("does not run the cart rules on item-detail", () => {
    const nudge = only(context(["veg-burger"], { surface: "item-detail", focusItemId: "cone" }));
    expect(nudge?.kind).toBe("pairing");
  });
});

describe("evaluateNudges — contract and copy", () => {
  it("produces ids and a response the contract accepts", () => {
    const nudges = [
      ...evaluateNudges(context(["veg-burger"])),
      ...evaluateNudges(context([], { surface: "item-detail", focusItemId: "veg-burger" })),
    ];
    for (const nudge of nudges) {
      expect(nudgeIdSchema.safeParse(nudge.id).success).toBe(true);
      expect(nudgesResponseSchema.safeParse(toNudgesResponse([nudge])).success).toBe(true);
    }
  });

  // AC-N5: no urgency, scarcity, social proof or implied discount.
  const MANIPULATIVE = /hurry|only \d|left|limited|last chance|selling fast|%|\boff\b|deal|others|everyone|don't miss|now!/i;

  it.each(NUDGE_RULES.map((rule) => [rule.id, rule] as const))(
    "rule %s writes plain copy",
    (_id, rule) => {
      const headline = rule.headline(item("paneer-crunch-burger", "burgers-wraps"));
      expect(headline).not.toMatch(MANIPULATIVE);
      expect(headline.length).toBeLessThanOrEqual(120);
    },
  );
});
