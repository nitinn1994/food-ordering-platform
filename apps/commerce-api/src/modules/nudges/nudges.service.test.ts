import { describe, expect, it } from "vitest";
import { NudgeContextSource } from "./domain/nudge-context.source";
import type { NudgeContext, NudgeSurface } from "./domain/nudge.types";
import { NudgesService } from "./nudges.service";

// A fake port: NudgesService depends on NudgeContextSource, not on
// CartService or MenuService.
class FakeContextSource extends NudgeContextSource {
  requests: unknown[] = [];

  constructor(private readonly cart: readonly string[]) {
    super();
  }

  async load(request: { surface: NudgeSurface; focusItemId?: string; now: Date }): Promise<NudgeContext> {
    this.requests.push(request);
    return {
      ...request,
      menu: [
        { id: "veg-burger", categoryId: "burgers-wraps", name: "Veg Burger", priceCents: 6900, available: true, featured: [] },
        { id: "fries", categoryId: "fries-sides", name: "Fries", priceCents: 10900, available: true, featured: [] },
      ],
      cartItemIds: new Set(this.cart),
      cartSubtotalCents: 6900,
    };
  }
}

describe("NudgesService", () => {
  it("loads the context for the surface and focus item, and maps the result to the wire shape", async () => {
    const source = new FakeContextSource(["veg-burger"]);
    const now = new Date("2026-10-01T09:30:00Z");

    const response = await new NudgesService(source).getNudges("post-add", "veg-burger", now);

    expect(source.requests).toEqual([{ surface: "post-add", focusItemId: "veg-burger", now }]);
    expect(response).toEqual({
      nudges: [
        {
          id: "rule:complete-meal-side:fries",
          kind: "complete-meal",
          surface: "post-add",
          itemId: "fries",
          itemName: "Fries",
          headline: "Add Fries to complete your meal",
          priceCents: 10900,
        },
      ],
    });
  });

  it("omits the focus item when none is given", async () => {
    const source = new FakeContextSource([]);
    await new NudgesService(source).getNudges("cart");
    expect(source.requests[0]).not.toHaveProperty("focusItemId");
  });
});
