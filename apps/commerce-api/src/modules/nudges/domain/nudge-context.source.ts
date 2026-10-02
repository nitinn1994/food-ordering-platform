import type { MenuItemId } from "@contracts/common";
import type { NudgeContext, NudgeSurface } from "./nudge.types";

// The port NudgesService loads its context through — the caller's own
// server-side cart and the live menu. Implemented in infrastructure/ over
// CartService and MenuService, so this module never reads the database
// itself and never writes anything.
export abstract class NudgeContextSource {
  abstract load(request: {
    readonly surface: NudgeSurface;
    readonly focusItemId?: MenuItemId;
    readonly now: Date;
  }): Promise<NudgeContext>;
}
