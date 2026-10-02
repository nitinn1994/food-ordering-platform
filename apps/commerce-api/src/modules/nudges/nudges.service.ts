import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import type { NudgesResponse } from "@contracts/api-contracts";
import { NudgeContextSource } from "./domain/nudge-context.source";
import { evaluateNudges } from "./domain/nudge.engine";
import type { NudgeSurface } from "./domain/nudge.types";
import { toNudgesResponse } from "./nudges.mapper";

// GET /v1/nudges (docs/features/mcdelivery-redesign/plan.md, Phase 3).
// Computes; never writes. A nudge is accepted only by the customer's own
// POST /v1/cart/items (requirements.md AC-N6).
@Injectable()
export class NudgesService {
  constructor(private readonly contextSource: NudgeContextSource) {}

  async getNudges(
    surface: NudgeSurface,
    focusItemId?: MenuItemId,
    now: Date = new Date(),
  ): Promise<NudgesResponse> {
    const context = await this.contextSource.load({
      surface,
      ...(focusItemId !== undefined && { focusItemId }),
      now,
    });
    return toNudgesResponse(evaluateNudges(context));
  }
}
