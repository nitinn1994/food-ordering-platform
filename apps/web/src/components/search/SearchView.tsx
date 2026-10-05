"use client";

import { useEffect, useId, useState } from "react";
import type { MenuCategory, MenuItem } from "@contracts/api-contracts";
import { filterMenu } from "../../lib/menu/filter";
import { featuredItems } from "../../lib/menu/featured";
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
} from "../../lib/search/recentSearches";
import { MenuItemCard } from "../menu/MenuItemCard";
import styles from "./SearchView.module.css";

const POPULAR_COUNT = 8;

// The reference's search page (docs/features/mcdelivery-parity/
// reference-inventory.md §14; AC8): a large search box that filters the
// menu as you type (name and description, the menu's own filterMenu),
// recent searches kept in this browser, and popular items when the box is
// empty. Results are the menu's own cards.
export function SearchView({ categories }: { categories: readonly MenuCategory[] }) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputId = useId();

  // localStorage only exists in the browser; read it after mounting so the
  // server and first client render agree.
  useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  const trimmed = query.trim();
  const results: MenuItem[] =
    trimmed === ""
      ? []
      : filterMenu(categories, { categoryId: null, query: trimmed }).flatMap(
          (category) => category.items,
        );
  const featured = featuredItems(categories, "popular");
  const popular = (featured.length > 0 ? featured : categories.flatMap((c) => c.items)).slice(
    0,
    POPULAR_COUNT,
  );

  return (
    <div className={styles.search}>
      <form
        role="search"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          setRecent(addRecentSearch(query));
        }}
      >
        <label htmlFor={inputId} className={styles.label}>
          Search the menu
        </label>
        <input
          id={inputId}
          type="search"
          className={styles.input}
          value={query}
          placeholder="Search for burgers, fries, coffee…"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      {trimmed === "" ? (
        <>
          {recent.length > 0 && (
            <section className={styles.block} aria-labelledby="recent-title">
              <div className={styles.blockHead}>
                <h2 id="recent-title">Recent searches</h2>
                <button
                  type="button"
                  className={styles.clear}
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                >
                  Clear all
                </button>
              </div>
              <ul className={styles.chips}>
                {recent.map((entry) => (
                  <li key={entry}>
                    <button type="button" className={styles.chip} onClick={() => setQuery(entry)}>
                      {entry}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={styles.block} aria-labelledby="popular-title">
            <h2 id="popular-title">Popular items</h2>
            <ul className={styles.grid}>
              {popular.map((item) => (
                <MenuItemCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section className={styles.block} aria-labelledby="results-title">
          <h2 id="results-title" aria-live="polite">
            {results.length === 0
              ? `No results for “${trimmed}”`
              : `${results.length} ${results.length === 1 ? "result" : "results"} for “${trimmed}”`}
          </h2>
          {results.length === 0 ? (
            <p>Try a shorter word, or browse the menu.</p>
          ) : (
            <ul className={styles.grid}>
              {results.map((item) => (
                <MenuItemCard key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
