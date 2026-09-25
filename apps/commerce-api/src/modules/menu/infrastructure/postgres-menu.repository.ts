import { Injectable } from "@nestjs/common";
import type { MenuItemId } from "@contracts/common";
import { deepFreeze } from "../../../common/immutability/deep-freeze";
import { DatabaseClient } from "../../../database/database-client";
import type { MenuItemsTable } from "../../../database/database.schema";
import { toPersistenceError } from "../../../database/persistence.errors";
import { MenuRepository } from "../domain/menu.repository";
import type { MenuCategory, MenuItem } from "../domain/menu.types";

// The runtime MenuRepository: the menu_categories and menu_items tables
// (docs/features/phase-10-database-persistence/plan.md §6). Reads on every
// call, with no cache, so a menu change (db:seed, or SQL) reaches carts at
// once — the live-pricing rule ADR-0015 §2 already relies on. Display order
// is each row's `position`.
//
// Returns frozen objects, exactly like InMemoryMenuRepository, and maps
// every driver error through toPersistenceError, so nothing above this file
// ever sees a raw database error.
@Injectable()
export class PostgresMenuRepository extends MenuRepository {
  constructor(private readonly databaseClient: DatabaseClient) {
    super();
  }

  async listCategories(): Promise<readonly MenuCategory[]> {
    try {
      const db = this.databaseClient.executor();
      const categories = await db
        .selectFrom("menu_categories")
        .select(["id", "name"])
        .orderBy("position")
        .execute();
      const items = await db
        .selectFrom("menu_items")
        .innerJoin("menu_categories", "menu_categories.id", "menu_items.category_id")
        .selectAll("menu_items")
        .orderBy("menu_categories.position")
        .orderBy("menu_items.position")
        .execute();

      const itemsByCategory = new Map<string, MenuItem[]>();
      for (const row of items) {
        const bucket = itemsByCategory.get(row.category_id) ?? [];
        bucket.push(toMenuItem(row));
        itemsByCategory.set(row.category_id, bucket);
      }
      return deepFreeze(
        categories.map((category) => ({
          id: category.id,
          name: category.name,
          items: itemsByCategory.get(category.id) ?? [],
        })),
      );
    } catch (error) {
      throw toPersistenceError(error, "menu.listCategories");
    }
  }

  async findItemById(id: MenuItemId): Promise<MenuItem | undefined> {
    try {
      const row = await this.databaseClient
        .executor()
        .selectFrom("menu_items")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : deepFreeze(toMenuItem(row));
    } catch (error) {
      throw toPersistenceError(error, "menu.findItemById");
    }
  }
}

function toMenuItem(row: MenuItemsTable): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    longDescription: row.long_description,
    priceCents: row.price_cents,
    available: row.available,
    dietaryTags: row.dietary_tags,
    allergens: row.allergens,
    calories: row.calories,
  };
}
