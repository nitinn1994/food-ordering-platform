import {
  nudgesResponseSchema,
  type Nudge,
  type NudgeSurface,
} from "@contracts/api-contracts";
import { request, type RequestDeps } from "../api/client";

// The one place apps/web reads nudges: commerce-api's GET /v1/nudges,
// through the same-origin proxy (docs/features/mcdelivery-redesign/plan.md,
// Phase 4). A nudge's item, price and copy always come from here — never
// from the AI (a ShowNudge command carries only an id).
//
// A GET that changes nothing, so it may retry like GET /v1/menu.
export async function getNudges(
  surface: NudgeSurface,
  itemId?: string,
  deps?: RequestDeps,
): Promise<readonly Nudge[]> {
  const query = new URLSearchParams({ surface });
  if (itemId !== undefined) {
    query.set("itemId", itemId);
  }
  const response = await request(
    {
      method: "GET",
      path: `/v1/nudges?${query.toString()}`,
      schema: nudgesResponseSchema,
      retry: true,
    },
    deps,
  );
  return response.nudges;
}
