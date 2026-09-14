import { describe, expect, it } from "vitest";
import { getMenu, findMenuItemIn } from "./menuSource";
import { MENU } from "../fixtures/menu";

describe("getMenu — AC6, AC7", () => {
  it("resolves the fixture menu data", async () => {
    const categories = await getMenu();
    expect(categories).toEqual(MENU);
  });

  it("returns a genuine Promise rather than a synchronously-resolved value", () => {
    // The seam's whole purpose is its async shape — this is what lets
    // loading.tsx have something to show. A test-only assertion, since the
    // real proof is Next.js's own Suspense wiring around page.tsx.
    const result = getMenu();
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("findMenuItemIn", () => {
  it("finds an item across categories", () => {
    expect(findMenuItemIn(MENU, "tiramisu")?.name).toBe("Tiramisu");
  });

  it("returns undefined for an unknown itemId", () => {
    expect(findMenuItemIn(MENU, "does-not-exist")).toBeUndefined();
  });

  it("returns undefined when categories is empty", () => {
    expect(findMenuItemIn([], "tiramisu")).toBeUndefined();
  });
});
