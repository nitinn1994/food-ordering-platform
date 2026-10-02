import { describe, expect, it } from "vitest";
import { initialUiState, uiReducer, type UiState } from "./uiStore";

// review-report.md finding 3: a UI command's action clears the chip filters
// so what it points at is visible; the customer's own taps keep them.
const FILTERED: UiState = { ...initialUiState, dietFilter: "veg", featureFilter: "deal" };

describe("uiReducer — chip filters", () => {
  it("sets and clears the diet and feature filters", () => {
    const state = uiReducer(
      uiReducer(initialUiState, { type: "SET_DIET_FILTER", diet: "non-veg" }),
      { type: "SET_FEATURE_FILTER", feature: "popular" },
    );
    expect(state).toMatchObject({ dietFilter: "non-veg", featureFilter: "popular" });
    expect(uiReducer(state, { type: "SET_DIET_FILTER", diet: null }).dietFilter).toBeNull();
  });

  it.each([
    { type: "SELECT_CATEGORY", categoryId: "desserts", clearMenuFilters: true },
    { type: "HIGHLIGHT_ITEM", itemId: "tiramisu", clearMenuFilters: true },
    { type: "SET_SEARCH_QUERY", query: "cake", clearMenuFilters: true },
  ] as const)("clears both filters for a command's $type", (action) => {
    expect(uiReducer(FILTERED, action)).toMatchObject({ dietFilter: null, featureFilter: null });
  });

  it.each([
    { type: "SELECT_CATEGORY", categoryId: "desserts" },
    { type: "SET_SEARCH_QUERY", query: "cake" },
  ] as const)("keeps both filters for the customer's own $type", (action) => {
    expect(uiReducer(FILTERED, action)).toMatchObject({ dietFilter: "veg", featureFilter: "deal" });
  });
});

describe("uiReducer — ShowNudge requests (mcdelivery-redesign Phase 4)", () => {
  it("records the requested id, and makes a repeat of it a new request", () => {
    const first = uiReducer(initialUiState, { type: "SHOW_NUDGE", nudgeId: "rule:a:fries" });
    const second = uiReducer(first, { type: "SHOW_NUDGE", nudgeId: "rule:a:fries" });
    expect(first.requestedNudge).toEqual({ nudgeId: "rule:a:fries", sequence: 1 });
    expect(second.requestedNudge).toEqual({ nudgeId: "rule:a:fries", sequence: 2 });
  });
});
