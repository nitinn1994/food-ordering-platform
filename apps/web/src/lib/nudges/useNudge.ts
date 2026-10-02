"use client";

import { useEffect, useState } from "react";
import type { Nudge, NudgeSurface } from "@contracts/api-contracts";
import { getNudges } from "./nudgeSource";
import { useNudgeSession } from "./NudgeProvider";

// Fetches one surface's nudge whenever `trigger` changes, and keeps it only
// if the session guardrails allow it. `trigger === null` means "nothing to
// ask about" (an empty or loading cart, no item open). A failed fetch shows
// nothing: a suggestion is an extra, never an error the customer must see.
export function useNudge(
  surface: NudgeSurface,
  trigger: string | null,
  itemId?: string,
): { nudge: Nudge | null; close: () => void } {
  const session = useNudgeSession();
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    if (trigger === null) {
      setNudge(null);
      return;
    }
    let cancelled = false;
    getNudges(surface, itemId).then(
      ([first]) => {
        if (!cancelled) setNudge(first !== undefined && session.offer(first) ? first : null);
      },
      () => {
        if (!cancelled) setNudge(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [surface, trigger, itemId, session]);

  return {
    nudge,
    // Closes the item for the session and hides it here. The provider's
    // value is stable, so hiding is this surface's own state.
    close: () => {
      if (nudge !== null) session.close(nudge.itemId);
      setNudge(null);
    },
  };
}
