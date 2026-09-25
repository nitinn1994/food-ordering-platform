import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import { assertMenuInvariants } from "../domain/menu.invariants";
import { MenuRepository } from "../domain/menu.repository";
import type { MenuCategory, MenuItem } from "../domain/menu.types";
import { MENU_SEED } from "./menu.seed";

// Recursively freezes a cloned value so a caller mutating what this
// repository returns throws in strict mode, rather than silently corrupting
// shared in-memory state (requirements.md AC7).
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const element of value) {
      deepFreeze(element);
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

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
