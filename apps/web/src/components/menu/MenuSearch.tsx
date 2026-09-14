"use client";

import { useUi } from "../../lib/state/uiStore";
import styles from "./MenuSearch.module.css";

export function MenuSearch() {
  const { searchQuery, setSearchQuery } = useUi();

  return (
    <div className={styles.search}>
      <label htmlFor="menu-search" className={styles.label}>
        Search menu
      </label>
      <div className={styles.row}>
        <input
          id="menu-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search for an item…"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
