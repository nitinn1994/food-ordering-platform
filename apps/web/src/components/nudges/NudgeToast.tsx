"use client";

import { useEffect, useRef, useState } from "react";
import type { Nudge } from "@contracts/api-contracts";
import { useCart, type PendingCartOp } from "../../lib/state/cartStore";
import { useUi } from "../../lib/state/uiStore";
import { getNudges } from "../../lib/nudges/nudgeSource";
import { useNudgeSession } from "../../lib/nudges/NudgeProvider";
import { NudgeCard } from "./NudgeCard";
import styles from "./NudgeToast.module.css";

// The two moments a suggestion appears on its own
// (docs/features/mcdelivery-redesign/plan.md, Phase 4):
//
// 1. post-add: right after the customer's own "Add to cart" succeeds.
// 2. ShowNudge: the assistant offered a suggestion. The command carries only
//    an id; this asks commerce-api for its current voice suggestion and
//    shows it only if the id matches — otherwise the command is ignored and
//    logged (requirements.md AC-V1). What the assistant said and what the
//    screen shows are therefore always commerce-api's same nudge.
//
// It stays until the customer chooses: no timer hides it. Only on the menu
// page (app/page.tsx), so never on checkout (AC-N3).
export function NudgeToast() {
  const { cart, pending, addItem } = useCart();
  const { requestedNudge, logCommand } = useUi();
  const session = useNudgeSession();
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const previousPending = useRef<PendingCartOp | null>(null);
  const [addedItem, setAddedItem] = useState<{ itemId: string; sequence: number } | null>(null);

  // Read through refs, so the effects below never re-run because of them:
  // useUi()'s functions are new on every uiStore change, and re-running the
  // ShowNudge effect on each one looped (review-report-phases-3-5.md #1).
  const logCommandRef = useRef(logCommand);
  logCommandRef.current = logCommand;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;
  // The nudge on screen now, for the spoken handle's "is this still it?".
  const shownRef = useRef<Nudge | null>(null);
  shownRef.current = nudge;
  // The last ShowNudge request handled. Starting at the current one means a
  // request made on another page (the header mic works everywhere) is not
  // replayed here later, out of context; each later one is handled once.
  const handledSequence = useRef(requestedNudge?.sequence ?? 0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A spoken "yes" must never act on a toast that is gone (#2).
      session.setSpokenNudge(null);
    };
  }, [session]);

  function show(next: Nudge, spoken: boolean) {
    // Whatever was offered out loud before is no longer what is on screen.
    session.setSpokenNudge(null);
    setNudge(next);
    shownRef.current = next;
    if (!spoken) return;
    const stillShown = () => shownRef.current?.id === next.id;
    session.setSpokenNudge({
      itemName: next.itemName,
      accept: () => {
        if (!stillShown()) return "gone";
        // The same guard as the Add button: one cart change at a time (#3).
        if (pendingRef.current !== null) return "busy";
        addItemRef.current(next.itemId);
        closeToast(next);
        return "done";
      },
      dismiss: () => {
        if (!stillShown()) return "gone";
        closeToast(next);
        return "done";
      },
    });
  }

  // A finished add of an item now in the confirmed cart is a successful add.
  useEffect(() => {
    const was = previousPending.current;
    previousPending.current = pending;
    if (
      was?.op === "add" &&
      pending === null &&
      cart?.items.some((line) => line.itemId === was.itemId)
    ) {
      setAddedItem((previous) => ({ itemId: was.itemId, sequence: (previous?.sequence ?? 0) + 1 }));
    }
  }, [pending, cart]);

  useEffect(() => {
    if (addedItem === null) return;
    let cancelled = false;
    getNudges("post-add", addedItem.itemId).then(
      ([first]) => {
        if (!cancelled && first !== undefined && session.offer(first)) show(first, false);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // show() reads refs only.
  }, [addedItem, session]);

  useEffect(() => {
    if (requestedNudge === null || requestedNudge.sequence <= handledSequence.current) return;
    const { nudgeId, sequence } = requestedNudge;
    handledSequence.current = sequence;
    // Not cancelled on cleanup: the request is handled once, and a newer
    // request (or unmounting) makes this result stale instead.
    const current = () => mounted.current && handledSequence.current === sequence;
    const ignore = (reason: string) =>
      logCommandRef.current({
        status: "rejected",
        reason,
        received: { type: "ShowNudge", nudgeId },
        receivedAt: Date.now(),
      });
    getNudges("voice").then(
      (nudges) => {
        if (!current()) return;
        const offered = nudges.find((candidate) => candidate.id === nudgeId);
        if (offered === undefined) {
          ignore("ShowNudge ignored: commerce-api offers no nudge with this id.");
        } else if (session.offer(offered, { spoken: true })) {
          show(offered, true);
        }
      },
      () => {
        if (current()) ignore("ShowNudge ignored: the suggestion could not be loaded.");
      },
    );
  }, [requestedNudge, session]);

  function closeToast(closing: Nudge) {
    session.close(closing.itemId);
    session.setSpokenNudge(null);
    setNudge((shown) => (shown?.id === closing.id ? null : shown));
    if (shownRef.current?.id === closing.id) shownRef.current = null;
  }

  return (
    <div className={styles.region} aria-live="polite">
      {nudge !== null && (
        <NudgeCard
          nudge={nudge}
          label="Suggestion"
          variant="toast"
          onClose={() => closeToast(nudge)}
        />
      )}
    </div>
  );
}
