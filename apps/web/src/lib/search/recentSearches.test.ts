import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addRecentSearch,
  clearRecentSearches,
  MAX_RECENT_SEARCHES,
  readRecentSearches,
  RECENT_SEARCHES_KEY,
} from "./recentSearches";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// mcdelivery-parity AC8.
describe("recent searches", () => {
  it("keeps the most recent first, without duplicates, capped", () => {
    for (const query of ["fries", "burger", "Fries", "tea", "wrap", "cone", "coffee"]) {
      addRecentSearch(query);
    }

    const recent = readRecentSearches();
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recent).toEqual(["coffee", "cone", "wrap", "tea", "Fries"]);
  });

  it("ignores blank queries", () => {
    addRecentSearch("   ");
    expect(readRecentSearches()).toEqual([]);
  });

  it("clears", () => {
    addRecentSearch("fries");
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });

  it("ignores anything else stored under its key", () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, '{"not":"a list"}');
    expect(readRecentSearches()).toEqual([]);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, "not json");
    expect(readRecentSearches()).toEqual([]);
  });

  it("treats storage that throws as empty, and does not throw itself", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readRecentSearches()).toEqual([]);
    expect(() => addRecentSearch("fries")).not.toThrow();
    expect(() => clearRecentSearches()).not.toThrow();
  });
});
