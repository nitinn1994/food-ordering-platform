import type { Kysely } from "kysely";
import { assertMenuInvariants } from "../modules/menu/domain/menu.invariants";
import type { MenuCategory } from "../modules/menu/domain/menu.types";
import { MENU_SEED } from "../modules/menu/infrastructure/menu.seed";
import type { DatabaseSchema } from "./database.schema";

// Loads the menu's reference data (docs/features/phase-10-database-
// persistence/plan.md §11, OD5): the same MENU_SEED the in-memory adapter
// serves, so the database starts from exactly the menu every existing test
// asserts. Used by `pnpm --filter commerce-api db:seed` (cli/seed.ts) and
// by the DB test suite.
//
// - Idempotent: an upsert by id, so running it again restores every seeded
//   value (including a price or availability changed by hand) and adds no
//   duplicate.
// - Never deletes: a row that is not in the seed is left alone.
// - All or nothing: one transaction.
// - Display order is written as `position`, from the array index.
//
// The seed is checked against the domain invariants first, so a bad seed
// writes nothing. Known limit: reordering an existing seed would briefly
// collide with the (category_id, position) and position unique constraints,
// which are not deferrable; no reorder exists, and one would need its own
// migration or a two-step seed.
export async function seedMenu(
  db: Kysely<DatabaseSchema>,
  categories: readonly MenuCategory[] = MENU_SEED,
): Promise<void> {
  assertMenuInvariants(categories);

  await db.transaction().execute(async (trx) => {
    for (const [position, category] of categories.entries()) {
      await trx
        .insertInto("menu_categories")
        .values({ id: category.id, name: category.name, position })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({ name: category.name, position }),
        )
        .execute();
    }

    for (const category of categories) {
      for (const [position, item] of category.items.entries()) {
        const row = {
          category_id: item.categoryId,
          position,
          name: item.name,
          description: item.description,
          long_description: item.longDescription,
          price_cents: item.priceCents,
          available: item.available,
          dietary_tags: [...item.dietaryTags],
          allergens: [...item.allergens],
          calories: item.calories,
        };
        await trx
          .insertInto("menu_items")
          .values({ id: item.id, ...row })
          .onConflict((conflict) => conflict.column("id").doUpdateSet(row))
          .execute();
      }
    }
  });
}
