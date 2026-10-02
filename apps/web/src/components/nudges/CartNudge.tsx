"use client";

import { useCart } from "../../lib/state/cartStore";
import { useNudge } from "../../lib/nudges/useNudge";
import { NudgeCard } from "./NudgeCard";

// The cart surface (docs/features/mcdelivery-redesign/plan.md, Phase 4):
// asks again only when commerce-api's confirmed cart changes — never on a
// timer, and never for an empty or loading cart (requirements.md AC-N1).
export function CartNudge() {
  const { cart, status } = useCart();
  const trigger =
    status === "ready" && cart !== null && cart.items.length > 0
      ? cart.items.map((line) => `${line.itemId}:${line.quantity}`).join(",")
      : null;
  const { nudge, close } = useNudge("cart", trigger);

  return nudge === null ? null : (
    <NudgeCard nudge={nudge} label="Suggestion for your cart" onClose={close} />
  );
}
