import { parseCommand, type UiCommand } from "@contracts/ui-commands";
import type { UiAction, CommandLogEntry } from "../state/uiStore";

// Maps a validated UI command onto a uiStore action. Deliberately has no
// import of cartStore — see docs/architecture/system-architecture.md §4.4. A
// UI command must never be able to reach cart state; this file being
// structurally unable to import cartStore is what makes that true rather
// than merely asserted (AC8).
export function commandToUiAction(command: UiCommand): UiAction {
  switch (command.type) {
    case "ShowMenuCategory":
      return { type: "SELECT_CATEGORY", categoryId: command.categoryId };
    case "HighlightItem":
      return { type: "HIGHLIGHT_ITEM", itemId: command.itemId };
    case "OpenCartPanel":
      return { type: "SET_CART_PANEL_OPEN", open: command.open };
  }
}

export type DispatchResult = {
  entry: CommandLogEntry;
  uiAction: UiAction | null;
};

// Validates raw, untrusted input and turns it into at most one UI state
// change plus a log entry. Never throws — an invalid command is data to be
// logged, not an exception to be caught (AC4, AC5).
export function dispatchCommand(raw: unknown): DispatchResult {
  const result = parseCommand(raw);
  const receivedAt = Date.now();

  if (!result.accepted) {
    return {
      entry: {
        status: "rejected",
        reason: result.reason,
        received: result.received,
        receivedAt,
      },
      uiAction: null,
    };
  }

  return {
    entry: { status: "accepted", command: result.command, receivedAt },
    uiAction: commandToUiAction(result.command),
  };
}
