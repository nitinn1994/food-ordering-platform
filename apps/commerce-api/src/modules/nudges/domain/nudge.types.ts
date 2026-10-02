import type { MenuItemId, PriceCents } from "@contracts/common";

// The Nudges domain's own types — separate from @contracts/api-contracts's
// wire shapes, like cart.types.ts and order.types.ts. nudges.mapper.ts fails
// to compile if the surface and kind sets drift from the contract.
// (docs/features/mcdelivery-redesign/plan.md, Phase 3.)

export type NudgeSurface = "cart" | "post-add" | "item-detail" | "voice";
export type NudgeKind = "complete-meal" | "pairing" | "time-of-day" | "new-launch";

// What a rule may know about one menu item.
export interface NudgeMenuItem {
  readonly id: MenuItemId;
  readonly categoryId: string;
  readonly name: string;
  readonly priceCents: PriceCents;
  readonly available: boolean;
  readonly featured: readonly string[];
  readonly imageUrl?: string;
}

// Everything a rule is evaluated against. Built per request from the
// server-side cart and the live menu — never from the client or the
// conversation (CLAUDE.md, "Conversation vs. State").
export interface NudgeContext {
  readonly surface: NudgeSurface;
  // The item being looked at (item-detail) or just added (post-add).
  readonly focusItemId?: MenuItemId;
  // In menu order.
  readonly menu: readonly NudgeMenuItem[];
  readonly cartItemIds: ReadonlySet<MenuItemId>;
  readonly cartSubtotalCents: PriceCents;
  readonly now: Date;
}

export interface Nudge {
  readonly id: string;
  readonly kind: NudgeKind;
  readonly surface: NudgeSurface;
  readonly itemId: MenuItemId;
  readonly itemName: string;
  readonly headline: string;
  readonly priceCents: PriceCents;
  readonly imageUrl?: string;
}
