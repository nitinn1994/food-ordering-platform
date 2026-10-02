"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Nudge } from "@contracts/api-contracts";
import {
  closeItem,
  decideOffer,
  loadNudgeSession,
  saveNudgeSession,
  type NudgeSessionState,
} from "./nudgeSession";

// Holds the session guardrails (nudgeSession.ts) for every nudge surface,
// so the cap and "once per item" hold across the cart card, the item
// detail and the toast (docs/features/mcdelivery-redesign/plan.md, Phase 4).
// Decisions read and write a ref, synchronously, so two surfaces answering
// at the same moment cannot both claim the last slot. The context value is
// stable on purpose (a decision must not re-run every surface's fetch);
// each surface hides its own nudge when it closes it.

// The suggestion the assistant has just offered out loud, if any — what a
// spoken "yes" or "no" answers (AC-V4). Set by NudgeToast when it shows a
// ShowNudge; taken (and so cleared) by the voice shell on the next final
// utterance, whatever it is: the window is exactly one utterance.
// "done": acted on. "busy": a cart change is in flight, nothing was done,
// try again. "gone": that suggestion is no longer on screen; treat the
// utterance as an ordinary request.
export type SpokenNudgeResult = "done" | "busy" | "gone";

export type SpokenNudge = {
  itemName: string;
  accept: () => SpokenNudgeResult;
  dismiss: () => SpokenNudgeResult;
};

type NudgeSessionValue = {
  setSpokenNudge: (nudge: SpokenNudge | null) => void;
  takeSpokenNudge: () => SpokenNudge | null;
  // True if the nudge may be shown now; records the offer if so.
  offer: (nudge: Nudge, options?: { spoken?: boolean }) => boolean;
  // "No thanks" or "Add": never offer this item again this session.
  close: (itemId: string) => void;
  isClosed: (itemId: string) => boolean;
};

const NudgeSessionContext = createContext<NudgeSessionValue | null>(null);

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function NudgeProvider({ children }: { children: ReactNode }) {
  // Loaded lazily, on the first decision: decisions only happen in the
  // browser, after a fetch, so the server render never reads storage.
  const state = useRef<NudgeSessionState | null>(null);
  const spoken = useRef<SpokenNudge | null>(null);

  const current = useCallback((): NudgeSessionState => {
    state.current ??= loadNudgeSession(sessionStorageOrUndefined());
    return state.current;
  }, []);

  const commit = useCallback((next: NudgeSessionState) => {
    state.current = next;
    saveNudgeSession(sessionStorageOrUndefined(), next);
  }, []);

  const value = useMemo<NudgeSessionValue>(
    () => ({
      setSpokenNudge: (nudge) => {
        spoken.current = nudge;
      },
      takeSpokenNudge: () => {
        const taken = spoken.current;
        spoken.current = null;
        return taken;
      },
      offer: (nudge, options) => {
        const decision = decideOffer(current(), nudge, options);
        if (decision.next !== current()) commit(decision.next);
        return decision.show;
      },
      close: (itemId) => commit(closeItem(current(), itemId)),
      isClosed: (itemId) => current().closed.includes(itemId),
    }),
    [current, commit],
  );

  return <NudgeSessionContext.Provider value={value}>{children}</NudgeSessionContext.Provider>;
}

export function useNudgeSession(): NudgeSessionValue {
  const context = useContext(NudgeSessionContext);
  if (!context) {
    throw new Error("useNudgeSession must be used within a NudgeProvider");
  }
  return context;
}
