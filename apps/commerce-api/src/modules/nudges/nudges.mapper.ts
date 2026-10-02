import type { Nudge as NudgeResponseItem, NudgesResponse } from "@contracts/api-contracts";
import type { Nudge } from "./domain/nudge.types";

// Domain → wire. Typed against the contract, so a drift in the surface or
// kind sets fails to compile here.
function toNudgeResponseItem(nudge: Nudge): NudgeResponseItem {
  return {
    id: nudge.id,
    kind: nudge.kind,
    surface: nudge.surface,
    itemId: nudge.itemId,
    itemName: nudge.itemName,
    headline: nudge.headline,
    priceCents: nudge.priceCents,
    ...(nudge.imageUrl !== undefined && { imageUrl: nudge.imageUrl }),
  };
}

export function toNudgesResponse(nudges: readonly Nudge[]): NudgesResponse {
  return { nudges: nudges.map(toNudgeResponseItem) };
}
