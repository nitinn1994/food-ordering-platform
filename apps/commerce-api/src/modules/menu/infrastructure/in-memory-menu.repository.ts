import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { assertMenuInvariants } from "../domain/menu.invariants";
import { MenuRepository } from "../domain/menu.repository";
import type { MenuCategory, MenuItem } from "../domain/menu.types";
import { MENU_SEED } from "./menu.seed";

// The only adapter of MenuRepository so far. Only this file (and its own
// seed) touches storage — everything above it (MenuService, the domain
// layer) depends on the abstract MenuRepository, never on this class or on
// menu.seed.ts directly (requirements.md AC5).
@Injectable()
export class InMemoryMenuRepository extends MenuRepository {
  private readonly categories: readonly MenuCategory[];

  constructor() {
    super();
    // A clone, not the seed module's own array: freezing MENU_SEED itself
    // would make the seed unusable if this class is ever constructed twice
    // (e.g. once per test). Invariants are checked here, at construction —
    // a bad seed fails the boot, not a request (requirements.md AC6).
    const categories = structuredClone(MENU_SEED);
    assertMenuInvariants(categories);
    this.categories = deepFreeze(categories);
  }

  async listCategories(): Promise<readonly MenuCategory[]> {
    return this.categories;
  }

  async findItemById(id: MenuItemId): Promise<MenuItem | undefined> {
    for (const category of this.categories) {
      const item = category.items.find((candidate) => candidate.id === id);
      if (item) {
        return item;
      }
    }
    return undefined;
  }
}
