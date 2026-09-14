"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { UiCommand } from "@contracts/ui-commands";

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
  commandLog: CommandLogEntry[];
};

export type UiAction =
  | { type: "SELECT_CATEGORY"; categoryId: string | null }
  | { type: "HIGHLIGHT_ITEM"; itemId: string | null }
  | { type: "SET_CART_PANEL_OPEN"; open: boolean }
  | { type: "LOG_COMMAND"; entry: CommandLogEntry };

export const initialUiState: UiState = {
  selectedCategory: null,
  highlightedItemId: null,
  cartPanelOpen: false,
  commandLog: [],
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "SELECT_CATEGORY":
      return { ...state, selectedCategory: action.categoryId };
    case "HIGHLIGHT_ITEM":
      return { ...state, highlightedItemId: action.itemId };
    case "SET_CART_PANEL_OPEN":
      return { ...state, cartPanelOpen: action.open };
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
