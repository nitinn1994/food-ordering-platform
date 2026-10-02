import { describe, expect, it } from "vitest";
import { menuResponseSchema } from "@contracts/api-contracts";
import { assertMenuInvariants } from "../domain/menu.invariants";
import { toMenuResponse } from "../menu.mapper";
import { DEMO_MENU_SEED } from "./demo-menu.seed";
import { MENU_SEED } from "./menu.seed";

// The demo menu `db:seed` loads (docs/features/mcdelivery-redesign/plan.md
// Phase 2): valid for the domain and, once mapped, for the published
// contract — so a bad seed fails here, not at a customer's GET /v1/menu.
describe("DEMO_MENU_SEED", () => {
  const items = DEMO_MENU_SEED.flatMap((category) => category.items);

  it("satisfies the menu invariants", () => {
    expect(() => assertMenuInvariants(DEMO_MENU_SEED)).not.toThrow();
  });

  it("maps to a response the menu contract accepts", () => {
    const result = menuResponseSchema.safeParse(toMenuResponse(DEMO_MENU_SEED));
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it("has about 8 categories and 30 items, each category with an image", () => {
    expect(DEMO_MENU_SEED).toHaveLength(8);
    expect(items.length).toBeGreaterThanOrEqual(28);
    expect(DEMO_MENU_SEED.every((category) => category.imageUrl !== undefined)).toBe(true);
  });

  it("gives every chip (popular, deal, new-launch) something to show", () => {
    for (const feature of ["popular", "deal", "new-launch"] as const) {
      expect(items.some((item) => item.featured?.includes(feature))).toBe(true);
    }
  });

  // Upserts are by id: a shared id would silently turn a test-menu row into
  // a demo row (or back) on the next seed.
  it("shares no category or item id with the test menu", () => {
    const testIds = new Set([
      ...MENU_SEED.map((category) => category.id),
      ...MENU_SEED.flatMap((category) => category.items.map((item) => item.id)),
    ]);
    const demoIds = [...DEMO_MENU_SEED.map((category) => category.id), ...items.map((item) => item.id)];
    expect(demoIds.filter((id) => testIds.has(id))).toEqual([]);
  });
});
