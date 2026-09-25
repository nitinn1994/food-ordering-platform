import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  resetDatabase,
} from "../../../../test/support/test-database";
import { testConfig } from "../../../config/test-config";
import { DatabaseClient, createDatabase } from "../../../database/database-client";
import type { DatabaseSchema } from "../../../database/database.schema";
import { seedMenu } from "../../../database/menu-seed";
import { DatabaseUnavailableError } from "../../../database/persistence.errors";
import { InMemoryMenuRepository } from "./in-memory-menu.repository";
import { MENU_SEED } from "./menu.seed";
import { PostgresMenuRepository } from "./postgres-menu.repository";

// PostgresMenuRepository against the real database
// (docs/features/phase-10-database-persistence/plan.md §6, §19): it must
// return exactly what InMemoryMenuRepository returns for the same seed, so
// binding it changes no Menu, Cart or Order behaviour (AC4 at repository
// level).

describe("PostgresMenuRepository", () => {
  let db: Kysely<DatabaseSchema>;
  let client: DatabaseClient;
  let repository: PostgresMenuRepository;

  beforeAll(() => {
    db = createTestDatabase();
    client = new DatabaseClient(db);
    repository = new PostgresMenuRepository(client);
  });

  afterAll(async () => {
    await client.onApplicationShutdown();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await seedMenu(db);
  });

  it("lists exactly the seed, in display order — the same as the in-memory adapter", async () => {
    const categories = await repository.listCategories();
    expect(categories).toEqual(MENU_SEED);
    expect(categories).toEqual(await new InMemoryMenuRepository().listCategories());
  });

  it("finds an item by id, identical to the in-memory adapter's", async () => {
    for (const item of MENU_SEED.flatMap((category) => category.items)) {
      expect(await repository.findItemById(item.id)).toEqual(item);
    }
    expect(await repository.findItemById("tiramisu")).toEqual(
      await new InMemoryMenuRepository().findItemById("tiramisu"),
    );
  });

  it("returns undefined for an unknown item id, rather than throwing", async () => {
    await expect(repository.findItemById("does-not-exist")).resolves.toBeUndefined();
  });

  it("returns frozen data — mutating a category or item throws", async () => {
    const categories = await repository.listCategories();
    const [firstCategory] = categories;
    const [firstItem] = firstCategory!.items;
    expect(() => {
      (categories as unknown as { push: (value: unknown) => void }).push({});
    }).toThrow();
    expect(() => {
      (firstCategory as { name: string }).name = "Mutated";
    }).toThrow();
    expect(() => {
      (firstItem as { priceCents: number }).priceCents = 0;
    }).toThrow();
    const found = await repository.findItemById("tiramisu");
    expect(() => {
      (found as { priceCents: number }).priceCents = 0;
    }).toThrow();
  });

  it("reads the database on every call — a changed row is visible at once (no cache)", async () => {
    expect((await repository.findItemById("tiramisu"))?.priceCents).toBe(750);
    await db
      .updateTable("menu_items")
      .set({ price_cents: 800, available: false })
      .where("id", "=", "tiramisu")
      .execute();
    const changed = await repository.findItemById("tiramisu");
    expect(changed).toMatchObject({ priceCents: 800, available: false });
    const listed = (await repository.listCategories())
      .flatMap((category) => category.items)
      .find((item) => item.id === "tiramisu");
    expect(listed).toMatchObject({ priceCents: 800, available: false });
  });

  it("no longer finds an item deleted from the table", async () => {
    await db.deleteFrom("menu_items").where("id", "=", "tiramisu").execute();
    await expect(repository.findItemById("tiramisu")).resolves.toBeUndefined();
  });

  it("lists a category that has no items with an empty item list", async () => {
    await db.deleteFrom("menu_items").where("category_id", "=", "desserts").execute();
    const desserts = (await repository.listCategories()).find(
      (category) => category.id === "desserts",
    );
    expect(desserts).toEqual({ id: "desserts", name: "Desserts", items: [] });
  });

  it("lists nothing when the menu is empty", async () => {
    await resetDatabase(db);
    await expect(repository.listCategories()).resolves.toEqual([]);
  });

  it("maps an unreachable database to DatabaseUnavailableError (503)", async () => {
    const unreachable = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x_test" })),
    );
    const offline = new PostgresMenuRepository(unreachable);
    try {
      await expect(offline.listCategories()).rejects.toBeInstanceOf(DatabaseUnavailableError);
      await expect(offline.findItemById("tiramisu")).rejects.toBeInstanceOf(
        DatabaseUnavailableError,
      );
    } finally {
      await unreachable.onApplicationShutdown();
    }
  });
});
