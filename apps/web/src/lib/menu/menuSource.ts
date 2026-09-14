import { MENU, type MenuCategory, type MenuItem } from "../fixtures/menu";

// TEMPORARY — the sole point in apps/web that reads menu data. Replaced by
// an HTTP call to commerce-api (docs/product/food-ordering-frontend-mvp.md
// §7). Every other module receives menu data as a parameter from whatever
// called getMenu(), rather than importing the fixture directly — see
// docs/features/phase-2-menu-browsing/requirements.md AC6.
//
// Type-only imports of MenuItem/MenuCategory elsewhere are fine and don't
// violate AC6 — they carry no runtime dependency on this fixture and are
// erased at compile time.
//
// No artificial delay by default: the point of this seam is its shape, not
// simulated latency. Real latency arrives with the real API.
export async function getMenu(): Promise<readonly MenuCategory[]> {
  return MENU;
}

// Looks up an item within already-resolved menu data — never touches the
// fixture itself. Callers (cartStore, CartLine) receive categories as a
// prop/parameter rather than importing the fixture.
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
