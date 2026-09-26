import {
  parseCommand,
  type BatchParseResult,
  type UiCommand,
} from "@contracts/ui-commands";
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
    case "ShowItemDetail":
      return { type: "SHOW_ITEM_DETAIL", itemId: command.itemId };
    case "SearchMenu":
      return { type: "SET_SEARCH_QUERY", query: command.query };
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

// A turn's batch (Phase 15 plan.md §15, §16), already judged by parseBatch
// inside parseAgentTurnResponse, turned into one DispatchResult per command,
// in the order the agent issued them. Applying them — and in what order
// relative to refreshing the cart — is the caller's job. Never throws.
//
//   - null (the turn carried no commands): nothing.
//   - a rejected envelope: one rejected log entry, no UI action at all.
//   - an accepted envelope: each command accepted or rejected on its own, so
//     a malformed command drops alone and its siblings still apply.
export function dispatchBatch(batch: BatchParseResult | null): DispatchResult[] {
  if (batch === null) {
    return [];
  }
  const receivedAt = Date.now();

  if (!batch.accepted) {
    return [
      {
        entry: {
          status: "rejected",
          reason: batch.reason,
          received: batch.received,
          receivedAt,
        },
        uiAction: null,
      },
    ];
  }

  return batch.results.map((result): DispatchResult =>
    result.status === "accepted"
      ? {
          entry: { status: "accepted", command: result.command, receivedAt },
          uiAction: commandToUiAction(result.command),
        }
      : {
          entry: {
            status: "rejected",
            reason: result.reason,
            received: result.received,
            receivedAt,
          },
          uiAction: null,
        },
  );
}
