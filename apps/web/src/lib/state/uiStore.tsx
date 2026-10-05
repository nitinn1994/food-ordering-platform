"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { UiCommand } from "@contracts/ui-commands";

// The menu's Veg / Non-Veg chip filter (docs/features/mcdelivery-redesign/
// plan.md, Phases 1–2). Presentation only, never commerce state. The
// Popular / Deals / New Launch chips had a filter here too until they became
// links to /tag/[feature] (mcdelivery-parity Phase 3; review finding 4).
export type DietFilter = "veg" | "non-veg" | null;

// Durable UI state — unlike cartStore, this is meant to survive into the
// real system. See docs/features/phase-1-web-foundation/plan.md §6.

export type CommandLogEntry =
  | { status: "accepted"; command: UiCommand; receivedAt: number }
  | {
      status: "rejected";
      reason: string;
      received: unknown;
      receivedAt: number;
    };

const COMMAND_LOG_LIMIT = 20;

export type UiState = {
  selectedCategory: string | null;
  highlightedItemId: string | null;
  cartPanelOpen: boolean;
  searchQuery: string;
  detailItemId: string | null;
  dietFilter: DietFilter;
  // The last ShowNudge (mcdelivery-redesign Phase 4). Only a request: the
  // nudge itself is fetched from commerce-api and shown only if commerce-api
  // offers one with this id (NudgeToast). `sequence` makes a repeat of the
  // same id a new request.
  requestedNudge: { nudgeId: string; sequence: number } | null;
  commandLog: CommandLogEntry[];
};

// A UI command that points the customer at menu items must be able to show
// them: the actions a command produces carry `clearMenuFilters`, and the
// reducer then drops the chip filters that could hide those items
// (review-report.md finding 3). The same actions from the customer's own
// taps and typing keep the chips.
type FromCommand = { clearMenuFilters?: true };

export type UiAction =
  | ({ type: "SELECT_CATEGORY"; categoryId: string | null } & FromCommand)
  | ({ type: "HIGHLIGHT_ITEM"; itemId: string | null } & FromCommand)
  | { type: "SET_CART_PANEL_OPEN"; open: boolean }
  | ({ type: "SET_SEARCH_QUERY"; query: string } & FromCommand)
  | { type: "SET_DIET_FILTER"; diet: DietFilter }
  | { type: "SHOW_NUDGE"; nudgeId: string }
  | { type: "SHOW_ITEM_DETAIL"; itemId: string | null }
  | { type: "LOG_COMMAND"; entry: CommandLogEntry };

export const initialUiState: UiState = {
  selectedCategory: null,
  highlightedItemId: null,
  cartPanelOpen: false,
  searchQuery: "",
  detailItemId: null,
  dietFilter: null,
  requestedNudge: null,
  commandLog: [],
};

function withoutMenuFilters(state: UiState, action: FromCommand): UiState {
  return action.clearMenuFilters
    ? { ...state, dietFilter: null }
    : state;
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "SELECT_CATEGORY":
      return { ...withoutMenuFilters(state, action), selectedCategory: action.categoryId };
    case "HIGHLIGHT_ITEM":
      return { ...withoutMenuFilters(state, action), highlightedItemId: action.itemId };
    case "SET_CART_PANEL_OPEN":
      return { ...state, cartPanelOpen: action.open };
    case "SET_SEARCH_QUERY":
      return { ...withoutMenuFilters(state, action), searchQuery: action.query };
    case "SET_DIET_FILTER":
      return { ...state, dietFilter: action.diet };
    case "SHOW_NUDGE":
      return {
        ...state,
        requestedNudge: {
          nudgeId: action.nudgeId,
          sequence: (state.requestedNudge?.sequence ?? 0) + 1,
        },
      };
    case "SHOW_ITEM_DETAIL":
      return { ...state, detailItemId: action.itemId };
    case "LOG_COMMAND":
      return {
        ...state,
        commandLog: [action.entry, ...state.commandLog].slice(
          0,
          COMMAND_LOG_LIMIT,
        ),
      };
    default:
      return state;
  }
}

type UiContextValue = UiState & {
  selectCategory: (categoryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  showItemDetail: (itemId: string | null) => void;
  setDietFilter: (diet: DietFilter) => void;
  applyUiAction: (action: UiAction) => void;
  logCommand: (entry: CommandLogEntry) => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialUiState);

  const value = useMemo<UiContextValue>(
    () => ({
      ...state,
      selectCategory: (categoryId: string | null) =>
        dispatch({ type: "SELECT_CATEGORY", categoryId }),
      setSearchQuery: (query: string) =>
        dispatch({ type: "SET_SEARCH_QUERY", query }),
      showItemDetail: (itemId: string | null) =>
        dispatch({ type: "SHOW_ITEM_DETAIL", itemId }),
      setDietFilter: (diet: DietFilter) => dispatch({ type: "SET_DIET_FILTER", diet }),
      applyUiAction: (action: UiAction) => dispatch(action),
      logCommand: (entry: CommandLogEntry) =>
        dispatch({ type: "LOG_COMMAND", entry }),
    }),
    [state],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const context = useContext(UiContext);
  if (!context) {
    throw new Error("useUi must be used within a UiProvider");
  }
  return context;
}
