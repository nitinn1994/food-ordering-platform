import {
  menuResponseSchema,
  type MenuCategory,
  type MenuItem,
} from "@contracts/api-contracts";
import { request, type RequestDeps } from "../api/client";

// The sole point in apps/web that reads menu data — now from commerce-api's
// GET /v1/menu (docs/features/phase-11-web-commerce-integration/plan.md §3).
// Every other module still receives menu data as a parameter from whatever
// called getMenu(), rather than fetching it itself — see
// docs/features/phase-2-menu-browsing/requirements.md AC6.
//
// Awaited by async Server Components, so on the server this calls
// COMMERCE_API_URL directly. The client's `cache: "no-store"` makes every
// route that awaits this render per request, so `next build` never needs a
// running API and a menu change shows on the next load (plan.md §9, OD4).
// A failure rejects, and the route's error boundary (app/error.tsx) takes
// over.
export async function getMenu(
  deps?: RequestDeps,
): Promise<readonly MenuCategory[]> {
  const menu = await request(
    { method: "GET", path: "/v1/menu", schema: menuResponseSchema, retry: true },
    deps,
  );
  return menu.categories;
}

// Looks up an item within already-resolved menu data — never fetches.
// Callers receive categories as a prop/parameter.
export function findMenuItemIn(
  categories: readonly MenuCategory[],
  itemId: string,
): MenuItem | undefined {
  for (const category of categories) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) {
      return item;
    }
  }
  return undefined;
}
