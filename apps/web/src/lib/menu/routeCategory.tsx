"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useUi } from "../state/uiStore";

// /menu/[categoryId] (docs/features/mcdelivery-parity/plan.md, Phase 3)
// opens with that category selected. The selection itself stays in
// uiStore, as before, so the rail, ShowMenuCategory and the chips keep
// working in place on this route too. uiStore lives in the root layout and
// cannot be seeded per route, so this provider selects the route's
// category once mounted, and until then — on the server, in the first
// client render, and in the first render after moving to another
// category's page — useSelectedCategory() answers with the route's id, so
// the page never shows the wrong menu first and then jumps.
//
// Leaving the route hands the selection back: the home page shows the
// whole menu, not the category last visited (review finding 1).
type RouteCategory = { categoryId: string; synced: boolean };

const RouteCategoryContext = createContext<RouteCategory | null>(null);

export function RouteCategoryProvider({
  categoryId,
  children,
}: {
  categoryId: string;
  children: ReactNode;
}) {
  const { selectCategory } = useUi();
  // selectCategory is a new function on every uiStore change; the effect
  // must run once per route category, not on each of those.
  const selectRef = useRef(selectCategory);
  selectRef.current = selectCategory;
  // Which route category the store has been handed — not a plain flag, so
  // a move from one category's page to another's is unsynced again until
  // its effect runs (review finding: one stale frame).
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  useEffect(() => {
    // Both updates land in the same render, so the store and syncedFor
    // agree from the first re-render on.
    selectRef.current(categoryId);
    setSyncedFor(categoryId);
    return () => {
      selectRef.current(null);
    };
  }, [categoryId]);

  return (
    <RouteCategoryContext.Provider value={{ categoryId, synced: syncedFor === categoryId }}>
      {children}
    </RouteCategoryContext.Provider>
  );
}

// The category the menu shows: uiStore's selection, except before a
// category route has handed its id to the store.
export function useSelectedCategory(): string | null {
  const { selectedCategory } = useUi();
  const route = useContext(RouteCategoryContext);
  if (route !== null && !route.synced) {
    return route.categoryId;
  }
  return selectedCategory;
}
