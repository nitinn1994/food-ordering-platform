import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, resetDatabase } from "../../test/support/test-database";
import { MenuInvariantViolationError } from "../modules/menu/domain/menu.invariants";
import type { MenuCategory } from "../modules/menu/domain/menu.types";
import { MENU_SEED } from "../modules/menu/infrastructure/menu.seed";
import type { DatabaseSchema } from "./database.schema";
import { seedMenu } from "./menu-seed";

// AC3 (docs/features/phase-10-database-persistence/requirements.md): the
// seed loads exactly MENU_SEED, and running it again changes nothing.

describe("seedMenu (AC3)", () => {
  let db: Kysely<DatabaseSchema>;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function categoryRows() {
    return db.selectFrom("menu_categories").selectAll().orderBy("position").execute();
  }

  async function itemRows() {
    return db
      .selectFrom("menu_items")
      .selectAll()
      .orderBy("category_id")
      .orderBy("position")
      .execute();
  }

  // What MENU_SEED should become, row for row — written from the seed, so
  // this also proves the column mapping.
  function expectedItemRows() {
    return MENU_SEED.flatMap((category) =>
      category.items.map((item, position) => ({
        id: item.id,
        category_id: category.id,
        position,
        name: item.name,
        description: item.description,
        long_description: item.longDescription,
        price_cents: item.priceCents,
        available: item.available,
        dietary_tags: [...item.dietaryTags],
        allergens: [...item.allergens],
        calories: item.calories,
      })),
    ).sort((a, b) => a.category_id.localeCompare(b.category_id) || a.position - b.position);
  }

  it("loads the 3 categories in display order", async () => {
    await seedMenu(db);
    expect(await categoryRows()).toEqual([
      { id: "starters", name: "Starters", position: 0 },
      { id: "mains", name: "Mains", position: 1 },
      { id: "desserts", name: "Desserts", position: 2 },
    ]);
  });

  it("loads exactly the 6 seed items, with gelato unavailable", async () => {
    await seedMenu(db);
    const items = await itemRows();
    expect(items).toEqual(expectedItemRows());
    expect(items).toHaveLength(6);
    expect(items.filter((item) => !item.available).map((item) => item.id)).toEqual(["gelato"]);
  });

  it("is idempotent: a second run leaves the same rows and no duplicates", async () => {
    await seedMenu(db);
    const first = { categories: await categoryRows(), items: await itemRows() };
    await seedMenu(db);
    expect({ categories: await categoryRows(), items: await itemRows() }).toEqual(first);
  });

  it("restores a seeded value changed by hand", async () => {
    await seedMenu(db);
    await db
      .updateTable("menu_items")
      .set({ price_cents: 1, available: false, name: "Changed" })
      .where("id", "=", "tiramisu")
      .execute();
    await seedMenu(db);
    expect(await itemRows()).toEqual(expectedItemRows());
  });

  it("never deletes a row that is not in the seed", async () => {
    await seedMenu(db);
    await db
      .insertInto("menu_items")
      .values({
        id: "specials-board",
        category_id: "mains",
        position: 99,
        name: "Specials",
        description: "d",
        long_description: "ld",
        price_cents: 100,
        available: true,
        dietary_tags: [],
        allergens: [],
        calories: 1,
      })
      .execute();
    await seedMenu(db);
    expect(
      await db.selectFrom("menu_items").select("id").where("id", "=", "specials-board").execute(),
    ).toEqual([{ id: "specials-board" }]);
  });

  it("writes nothing when the seed breaks a domain invariant", async () => {
    const broken: MenuCategory[] = [
      MENU_SEED[0]!,
      { ...MENU_SEED[1]!, id: MENU_SEED[0]!.id },
    ];
    await expect(seedMenu(db, broken)).rejects.toBeInstanceOf(MenuInvariantViolationError);
    expect(await categoryRows()).toEqual([]);
  });

  it("writes nothing when a later write fails part-way (one transaction)", async () => {
    // Valid by the domain invariants, but the second category's item breaks
    // the database's own price check — after the categories and the first
    // category's items have already been written in the same transaction.
    const broken: MenuCategory[] = [
      MENU_SEED[0]!,
      {
        ...MENU_SEED[1]!,
        items: [{ ...MENU_SEED[1]!.items[0]!, priceCents: -1 }],
      },
    ];
    await expect(seedMenu(db, broken)).rejects.toMatchObject({
      code: "23514",
      constraint: "menu_items_price_cents_check",
    });
    expect(await categoryRows()).toEqual([]);
    expect(await itemRows()).toEqual([]);
  });
});
