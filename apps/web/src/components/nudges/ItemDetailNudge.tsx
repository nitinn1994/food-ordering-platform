"use client";

import { useUi } from "../../lib/state/uiStore";
import { useNudge } from "../../lib/nudges/useNudge";
import { NudgeCard } from "./NudgeCard";

// The item-detail surface: what pairs with the item that is open
// (docs/features/mcdelivery-redesign/plan.md, Phase 4). Rendered inside
// ItemDetailPanel's slot, so it appears and goes with the panel.
export function ItemDetailNudge() {
  const { detailItemId } = useUi();
  const { nudge, close } = useNudge("item-detail", detailItemId, detailItemId ?? undefined);

  return nudge === null ? null : (
    <NudgeCard nudge={nudge} label="Pairs well with this item" onClose={close} variant="row" />
  );
}
