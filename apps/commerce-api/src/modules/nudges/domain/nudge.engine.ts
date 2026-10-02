import { NUDGE_RULES, nudgeId, type NudgeRule } from "./nudge.rules";
import type { Nudge, NudgeContext, NudgeMenuItem } from "./nudge.types";

// trigger → candidates → eligibility → guardrails → rank → deliver
// (docs/features/mcdelivery-redesign/plan.md, "Nudge pattern
// architecture"). Pure: the same context always gives the same answer.

// requirements.md AC-N3.
const MAX_NUDGES = 1;

// AC-N2, AC-N3: only an item the customer can actually order, that is not
// already in the cart, and is not the item they are looking at or just
// added.
function isEligible(item: NudgeMenuItem, context: NudgeContext): boolean {
  return (
    item.available && !context.cartItemIds.has(item.id) && item.id !== context.focusItemId
  );
}

// Popular items first, then menu order (the order `suggest` returns them in,
// which follows the menu).
function rank(items: readonly NudgeMenuItem[]): NudgeMenuItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(b.item.featured.includes("popular")) - Number(a.item.featured.includes("popular")) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

export function evaluateNudges(
  context: NudgeContext,
  rules: readonly NudgeRule[] = NUDGE_RULES,
): Nudge[] {
  const ordered = rules
    .filter((rule) => rule.surfaces.includes(context.surface))
    .sort((a, b) => a.priority - b.priority);

  const nudges: Nudge[] = [];
  for (const rule of ordered) {
    if (nudges.length >= MAX_NUDGES) break;
    if (!rule.applies(context)) continue;
    const [item] = rank(rule.suggest(context).filter((candidate) => isEligible(candidate, context)));
    if (item === undefined) continue;
    nudges.push({
      id: nudgeId(rule.id, item.id),
      kind: rule.kind,
      surface: context.surface,
      itemId: item.id,
      itemName: item.name,
      headline: rule.headline(item),
      // The live menu price, from this request's menu (AC-N2).
      priceCents: item.priceCents,
      ...(item.imageUrl !== undefined && { imageUrl: item.imageUrl }),
    });
  }
  return nudges;
}
