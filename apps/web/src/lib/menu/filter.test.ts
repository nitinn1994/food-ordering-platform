import { describe, expect, it } from "vitest";
import { filterMenu } from "./filter";
import { MENU } from "../../test/fixtures/menu";

describe("filterMenu — AC9 (category + query, AND semantics)", () => {
  it("returns everything with no category and no query", () => {
    const result = filterMenu(MENU, { categoryId: null, query: "" });
    expect(result).toEqual(MENU);
  });

  it("narrows to one category when only categoryId is set", () => {
    const result = filterMenu(MENU, { categoryId: "desserts", query: "" });
    expect(result.map((c) => c.id)).toEqual(["desserts"]);
    const [desserts] = result;
    expect(desserts).toBeDefined();
    expect(desserts?.items).toHaveLength(2);
  });

  it("narrows items by query across all categories when only query is set", () => {
    // "bread" matches only Garlic Bread, in Starters.
    const result = filterMenu(MENU, { categoryId: null, query: "bread" });
    expect(result.map((c) => c.id)).toEqual(["starters"]);
    const [starters] = result;
    expect(starters).toBeDefined();
    expect(starters?.items.map((i) => i.id)).toEqual(["garlic-bread"]);
  });

  it("matches against description text, not just name", () => {
    // "mascarpone" only appears in Tiramisu's description.
    const result = filterMenu(MENU, { categoryId: null, query: "mascarpone" });
    expect(result.flatMap((c) => c.items.map((i) => i.id))).toEqual([
      "tiramisu",
    ]);
  });

  it("combines category and query with AND — query narrows within the category only", () => {
    // "pizza" only exists in Mains, so filtering to Desserts + "pizza" must
    // return nothing, even though "pizza" matches something in a different
    // category.
    const result = filterMenu(MENU, { categoryId: "desserts", query: "pizza" });
    expect(result).toEqual([]);
  });

  it("is case-insensitive", () => {
    const result = filterMenu(MENU, { categoryId: null, query: "TIRAMISU" });
    expect(result.flatMap((c) => c.items.map((i) => i.id))).toEqual([
      "tiramisu",
    ]);
  });

  it("ignores leading/trailing whitespace in the query", () => {
    const result = filterMenu(MENU, { categoryId: null, query: "  tiramisu  " });
    expect(result.flatMap((c) => c.items.map((i) => i.id))).toEqual([
      "tiramisu",
    ]);
  });
});

describe("filterMenu — AC10 (no-results)", () => {
  it("returns an empty array when nothing matches the query", () => {
    const result = filterMenu(MENU, { categoryId: null, query: "sushi" });
    expect(result).toEqual([]);
  });

  it("drops categories left with zero items after filtering, rather than returning empty categories", () => {
    const result = filterMenu(MENU, { categoryId: null, query: "sushi" });
    expect(result.every((c) => c.items.length > 0)).toBe(true);
    expect(result).toHaveLength(0);
  });
});
