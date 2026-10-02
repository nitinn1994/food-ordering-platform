import type { MenuItemId } from "@contracts/common";
import { covers, roleOf, type MealRole } from "./nudge.roles";
import type { NudgeContext, NudgeKind, NudgeMenuItem, NudgeSurface } from "./nudge.types";

// The nudge rules (docs/features/mcdelivery-redesign/plan.md, "Nudge
// pattern architecture"). Each rule decides *whether* it applies and
// *which items* it would suggest; nudge.engine.ts applies eligibility,
// the guardrails and ranking to every rule alike, so no rule can skip them.
//
// Copy rules (requirements.md AC-N5): a headline names the item and says
// why, plainly. No countdowns, no "only N left", no "people are buying",
// no implied discount. nudge.rules.test.ts checks every headline.

export interface NudgeRule {
  readonly id: string;
  readonly kind: NudgeKind;
  // Lower runs first; the first rule with an eligible item wins.
  readonly priority: number;
  readonly surfaces: readonly NudgeSurface[];
  readonly applies: (context: NudgeContext) => boolean;
  readonly suggest: (context: NudgeContext) => readonly NudgeMenuItem[];
  readonly headline: (item: NudgeMenuItem) => string;
}

// The cart-driven surfaces. item-detail has its own rules (pairing,
// new-launch), keyed on the item being looked at.
const CART_SURFACES: readonly NudgeSurface[] = ["cart", "post-add", "voice"];

// The morning window for the breakfast rule, in the restaurant's time
// zone, not the server's.
const BREAKFAST_TIME_ZONE = "Asia/Kolkata";
const BREAKFAST_START_HOUR = 6;
const BREAKFAST_END_HOUR = 11;

// The dessert rule only suggests a dessert after a real meal, not after a
// single cup of tea.
export const DESSERT_MIN_SUBTOTAL_CENTS = 19900;

function cartRoles(context: NudgeContext): Set<MealRole> {
  const roles = new Set<MealRole>();
  for (const item of context.menu) {
    if (context.cartItemIds.has(item.id)) {
      const role = roleOf(item);
      if (role !== undefined) roles.add(role);
    }
  }
  return roles;
}

function has(roles: ReadonlySet<MealRole>, wanted: "main" | "side" | "drink"): boolean {
  return [...roles].some((role) => covers(role, wanted));
}

function withRole(context: NudgeContext, role: MealRole): NudgeMenuItem[] {
  return context.menu.filter((item) => roleOf(item) === role);
}

function focusItem(context: NudgeContext): NudgeMenuItem | undefined {
  return context.focusItemId === undefined
    ? undefined
    : context.menu.find((item) => item.id === context.focusItemId);
}

export function breakfastHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: BREAKFAST_TIME_ZONE,
    }).format(now),
  );
}

// What naturally goes with an item that is being looked at.
const PAIRS_WITH: Readonly<Partial<Record<MealRole, MealRole>>> = {
  main: "side",
  breakfast: "drink",
  side: "drink",
  meal: "dessert",
  drink: "dessert",
  dessert: "drink",
};

export const NUDGE_RULES: readonly NudgeRule[] = [
  {
    id: "complete-meal-side",
    kind: "complete-meal",
    priority: 10,
    surfaces: CART_SURFACES,
    applies: (context) => {
      const roles = cartRoles(context);
      return has(roles, "main") && !has(roles, "side");
    },
    suggest: (context) => withRole(context, "side"),
    headline: (item) => `Add ${item.name} to complete your meal`,
  },
  {
    id: "complete-meal-drink",
    kind: "complete-meal",
    priority: 20,
    surfaces: CART_SURFACES,
    applies: (context) => {
      const roles = cartRoles(context);
      return (has(roles, "main") || has(roles, "side")) && !has(roles, "drink");
    },
    suggest: (context) => withRole(context, "drink"),
    headline: (item) => `Add a ${item.name} to go with it?`,
  },
  {
    id: "complete-meal-dessert",
    kind: "complete-meal",
    priority: 30,
    surfaces: CART_SURFACES,
    applies: (context) => {
      const roles = cartRoles(context);
      return (
        has(roles, "main") &&
        !roles.has("dessert") &&
        context.cartSubtotalCents >= DESSERT_MIN_SUBTOTAL_CENTS
      );
    },
    suggest: (context) => withRole(context, "dessert"),
    headline: (item) => `Finish with ${item.name}?`,
  },
  {
    id: "breakfast-morning",
    kind: "time-of-day",
    priority: 40,
    surfaces: CART_SURFACES,
    applies: (context) => {
      const hour = breakfastHour(context.now);
      return (
        context.cartItemIds.size > 0 &&
        hour >= BREAKFAST_START_HOUR &&
        hour < BREAKFAST_END_HOUR &&
        !cartRoles(context).has("breakfast")
      );
    },
    suggest: (context) => withRole(context, "breakfast"),
    headline: (item) => `Breakfast is being served: ${item.name}`,
  },
  {
    id: "pairs-with",
    kind: "pairing",
    priority: 10,
    surfaces: ["item-detail"],
    applies: (context) => focusItem(context) !== undefined,
    suggest: (context) => {
      const focus = focusItem(context);
      const role = focus === undefined ? undefined : roleOf(focus);
      const partner = role === undefined ? undefined : PAIRS_WITH[role];
      return partner === undefined ? [] : withRole(context, partner);
    },
    headline: (item) => `Pairs well with ${item.name}`,
  },
  {
    id: "new-launch-spotlight",
    kind: "new-launch",
    priority: 20,
    surfaces: ["item-detail"],
    applies: (context) => context.cartItemIds.size === 0,
    suggest: (context) => context.menu.filter((item) => item.featured.includes("new-launch")),
    headline: (item) => `New on the menu: ${item.name}`,
  },
];

export function nudgeId(ruleId: string, itemId: MenuItemId): string {
  return `rule:${ruleId}:${itemId}`;
}
