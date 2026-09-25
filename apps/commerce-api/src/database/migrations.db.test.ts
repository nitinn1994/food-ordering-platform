import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  APPLICATION_TABLES,
  createTestDatabase,
  resetDatabase,
} from "../../test/support/test-database";
import type { DatabaseSchema } from "./database.schema";
import { migrate } from "./migrator";

// AC1 and AC2 (docs/features/phase-10-database-persistence/requirements.md):
// the schema migration 0001 produces, asserted from the catalog itself
// rather than trusted from the migration's source, plus up → down → up.
// test/db-global-setup.ts has already migrated this database to latest.

type Column = readonly [name: string, udt: string, nullable: boolean, maxLength?: number];

const NOT_NULL = false;
const NULLABLE = true;

const EXPECTED_COLUMNS: Record<(typeof APPLICATION_TABLES)[number], readonly Column[]> = {
  menu_categories: [
    ["id", "varchar", NOT_NULL, 64],
    ["name", "text", NOT_NULL],
    ["position", "int4", NOT_NULL],
  ],
  menu_items: [
    ["id", "varchar", NOT_NULL, 64],
    ["category_id", "varchar", NOT_NULL, 64],
    ["position", "int4", NOT_NULL],
    ["name", "text", NOT_NULL],
    ["description", "text", NOT_NULL],
    ["long_description", "text", NOT_NULL],
    ["price_cents", "int4", NOT_NULL],
    ["available", "bool", NOT_NULL],
    ["dietary_tags", "_text", NOT_NULL],
    ["allergens", "_text", NOT_NULL],
    ["calories", "int4", NOT_NULL],
  ],
  carts: [
    ["owner_id", "varchar", NOT_NULL, 128],
    ["version", "int4", NOT_NULL],
    ["created_at", "timestamptz", NOT_NULL],
    ["updated_at", "timestamptz", NOT_NULL],
  ],
  cart_lines: [
    ["owner_id", "varchar", NOT_NULL, 128],
    ["item_id", "varchar", NOT_NULL, 64],
    ["position", "int4", NOT_NULL],
    ["quantity", "int2", NOT_NULL],
  ],
  orders: [
    ["id", "uuid", NOT_NULL],
    ["owner_id", "varchar", NOT_NULL, 128],
    ["idempotency_key", "varchar", NOT_NULL, 128],
    ["status", "text", NOT_NULL],
    ["item_count", "int4", NOT_NULL],
    ["subtotal_cents", "int4", NOT_NULL],
    ["total_cents", "int4", NOT_NULL],
    ["customer_full_name", "varchar", NOT_NULL, 100],
    ["customer_phone", "varchar", NOT_NULL, 32],
    ["customer_email", "varchar", NULLABLE, 254],
    ["created_at", "timestamptz", NOT_NULL],
    ["updated_at", "timestamptz", NOT_NULL],
  ],
  order_lines: [
    ["order_id", "uuid", NOT_NULL],
    ["position", "int4", NOT_NULL],
    ["item_id", "varchar", NOT_NULL, 64],
    ["name", "varchar", NOT_NULL, 80],
    ["unit_price_cents", "int4", NOT_NULL],
    ["quantity", "int2", NOT_NULL],
    ["line_subtotal_cents", "int4", NOT_NULL],
  ],
};

// Primary keys and unique constraints, with their columns in order.
const EXPECTED_KEYS: Record<string, readonly string[]> = {
  menu_categories_pkey: ["id"],
  menu_categories_position_key: ["position"],
  menu_items_pkey: ["id"],
  menu_items_category_id_position_key: ["category_id", "position"],
  carts_pkey: ["owner_id"],
  cart_lines_pkey: ["owner_id", "item_id"],
  cart_lines_owner_id_position_key: ["owner_id", "position"],
  orders_pkey: ["id"],
  orders_owner_idempotency_key_key: ["owner_id", "idempotency_key"],
  order_lines_pkey: ["order_id", "position"],
  order_lines_order_id_item_id_key: ["order_id", "item_id"],
};

// Foreign keys: columns, target, and ON DELETE action. Note what is absent:
// nothing references menu_items (plan.md OD6).
const EXPECTED_FOREIGN_KEYS = {
  menu_items_category_id_fkey: {
    columns: ["category_id"],
    target: "menu_categories",
    onDelete: "restrict",
  },
  cart_lines_owner_id_fkey: { columns: ["owner_id"], target: "carts", onDelete: "cascade" },
  order_lines_order_id_fkey: { columns: ["order_id"], target: "orders", onDelete: "restrict" },
} as const;

const EXPECTED_CHECKS = [
  "menu_categories_position_check",
  "menu_items_position_check",
  "menu_items_price_cents_check",
  "menu_items_calories_check",
  "carts_version_check",
  "cart_lines_position_check",
  "cart_lines_quantity_check",
  "orders_status_check",
  "orders_item_count_check",
  "orders_subtotal_cents_check",
  "orders_total_cents_check",
  "orders_total_equals_subtotal_check",
  "order_lines_position_check",
  "order_lines_unit_price_cents_check",
  "order_lines_quantity_check",
  "order_lines_line_subtotal_cents_check",
];

const DELETE_ACTIONS: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
};

async function applicationTables(db: Kysely<DatabaseSchema>): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name not like 'kysely_%'
    order by table_name`.execute(db);
  return rows.map((row) => row.name);
}

async function columnsOf(db: Kysely<DatabaseSchema>, table: string): Promise<Column[]> {
  const { rows } = await sql<{
    name: string;
    udt: string;
    nullable: string;
    max_length: number | null;
  }>`
    select column_name as name, udt_name as udt, is_nullable as nullable,
           character_maximum_length as max_length
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position`.execute(db);
  return rows.map((row) =>
    row.max_length === null
      ? [row.name, row.udt, row.nullable === "YES"]
      : [row.name, row.udt, row.nullable === "YES", row.max_length],
  );
}

async function constraints(db: Kysely<DatabaseSchema>) {
  const { rows } = await sql<{
    name: string;
    type: string;
    columns: string[];
    target: string | null;
    on_delete: string;
  }>`
    select con.conname as name, con.contype as type,
           coalesce(
             (select array_agg(a.attname::text order by k.ord)
              from unnest(con.conkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
             '{}'::text[]) as columns,
           case when con.confrelid = 0 then null else con.confrelid::regclass::text end as target,
           con.confdeltype as on_delete
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname not like 'kysely_%'
      and con.contype in ('p', 'u', 'f', 'c')`.execute(db);
  return rows;
}

async function schemaSnapshot(db: Kysely<DatabaseSchema>) {
  const tables = await applicationTables(db);
  const columns = Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await columnsOf(db, table)])),
  );
  const cons = (await constraints(db)).sort((a, b) => a.name.localeCompare(b.name));
  return { tables, columns, constraints: cons };
}

describe("migration 0001_initial_schema (AC1)", () => {
  let db: Kysely<DatabaseSchema>;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    // Leave the database at latest for the files that run after this one.
    await migrate(db, "latest");
    await db.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it("creates exactly the six application tables", async () => {
    expect(await applicationTables(db)).toEqual([...APPLICATION_TABLES].sort());
  });

  it.each(APPLICATION_TABLES)("gives %s exactly the planned columns", async (table) => {
    expect(await columnsOf(db, table)).toEqual(EXPECTED_COLUMNS[table]);
  });

  it("defines exactly the planned primary keys and unique constraints", async () => {
    const keys = (await constraints(db)).filter((c) => c.type === "p" || c.type === "u");
    expect(Object.fromEntries(keys.map((c) => [c.name, c.columns]))).toEqual(EXPECTED_KEYS);
    for (const key of keys) {
      expect(key.type).toBe(key.name.endsWith("_pkey") ? "p" : "u");
    }
  });

  it("defines exactly the planned foreign keys, and none onto menu_items", async () => {
    const foreignKeys = (await constraints(db)).filter((c) => c.type === "f");
    expect(
      Object.fromEntries(
        foreignKeys.map((c) => [
          c.name,
          { columns: c.columns, target: c.target, onDelete: DELETE_ACTIONS[c.on_delete] },
        ]),
      ),
    ).toEqual(EXPECTED_FOREIGN_KEYS);
  });

  it("defines exactly the planned check constraints", async () => {
    const checks = (await constraints(db)).filter((c) => c.type === "c");
    expect(checks.map((c) => c.name).sort()).toEqual([...EXPECTED_CHECKS].sort());
  });

  it("adds no index beyond the ones its keys create (plan.md §22)", async () => {
    const { rows } = await sql<{ name: string }>`
      select indexname as name from pg_indexes
      where schemaname = 'public' and tablename not like 'kysely_%'`.execute(db);
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(EXPECTED_KEYS).sort());
  });

  it("defaults the menu item array columns to empty", async () => {
    await insertCategory(db);
    await sql`insert into menu_items
      (id, category_id, position, name, description, long_description, price_cents, available, calories)
      values ('plain', 'starters', 0, 'Plain', 'd', 'ld', 100, true, 10)`.execute(db);
    const row = await db
      .selectFrom("menu_items")
      .select(["dietary_tags", "allergens"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ dietary_tags: [], allergens: [] });
  });
});

// The same schema, proven by behaviour: each constraint rejects exactly the
// row it exists to reject, and reports its own name — which is what error
// mapping relies on (persistence.errors.ts).
describe("migration 0001_initial_schema — constraints in action (AC1)", () => {
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

  it("rejects negative positions, prices and calories on the menu", async () => {
    await expectViolation(
      insertCategory(db, { position: -1 }),
      "23514",
      "menu_categories_position_check",
    );
    await insertCategory(db);
    await expectViolation(insertItem(db, { position: -1 }), "23514", "menu_items_position_check");
    await expectViolation(
      insertItem(db, { price_cents: -1 }),
      "23514",
      "menu_items_price_cents_check",
    );
    await expectViolation(insertItem(db, { calories: -1 }), "23514", "menu_items_calories_check");
  });

  it("keeps category positions and item positions per category unique", async () => {
    await insertCategory(db);
    await expectViolation(
      insertCategory(db, { id: "mains" }),
      "23505",
      "menu_categories_position_key",
    );
    await insertItem(db);
    await expectViolation(
      insertItem(db, { id: "other" }),
      "23505",
      "menu_items_category_id_position_key",
    );
  });

  it("refuses to delete a category that still has items", async () => {
    await insertCategory(db);
    await insertItem(db);
    await expectViolation(
      db.deleteFrom("menu_categories").execute(),
      RESTRICT_VIOLATION,
      "menu_items_category_id_fkey",
    );
  });

  it("rejects a cart at version 0", async () => {
    await expectViolation(insertCart(db, { version: 0 }), "23514", "carts_version_check");
  });

  it("bounds cart line quantity to 1–99 and keeps one line per item and position", async () => {
    await insertCart(db);
    await expectViolation(insertCartLine(db, { quantity: 0 }), "23514", "cart_lines_quantity_check");
    await expectViolation(
      insertCartLine(db, { quantity: 100 }),
      "23514",
      "cart_lines_quantity_check",
    );
    await expectViolation(
      insertCartLine(db, { position: -1 }),
      "23514",
      "cart_lines_position_check",
    );
    await insertCartLine(db);
    await expectViolation(insertCartLine(db, { position: 1 }), "23505", "cart_lines_pkey");
    await expectViolation(
      insertCartLine(db, { item_id: "other" }),
      "23505",
      "cart_lines_owner_id_position_key",
    );
  });

  it("accepts a cart line for an item that is not on the menu (no FK — plan.md OD6)", async () => {
    await insertCart(db);
    await insertCartLine(db, { item_id: "not-on-the-menu" });
    expect(await db.selectFrom("cart_lines").select("item_id").execute()).toEqual([
      { item_id: "not-on-the-menu" },
    ]);
  });

  it("deletes a cart's lines with the cart", async () => {
    await insertCart(db);
    await insertCartLine(db);
    await db.deleteFrom("carts").execute();
    expect(await db.selectFrom("cart_lines").selectAll().execute()).toEqual([]);
  });

  it("allows only status 'placed', a positive item count, and total = subtotal", async () => {
    await expectViolation(insertOrder(db, { status: "shipped" }), "23514", "orders_status_check");
    await expectViolation(insertOrder(db, { item_count: 0 }), "23514", "orders_item_count_check");
    await expectViolation(
      insertOrder(db, { subtotal_cents: 1000, total_cents: 900 }),
      "23514",
      "orders_total_equals_subtotal_check",
    );
    // A negative amount necessarily breaks both of its own checks; either
    // may be the one Postgres reports.
    await expectViolation(
      insertOrder(db, { subtotal_cents: -1, total_cents: -1 }),
      "23514",
      ["orders_subtotal_cents_check", "orders_total_cents_check"],
    );
  });

  it("allows an absent email as NULL", async () => {
    await insertOrder(db, { customer_email: null });
    expect(await db.selectFrom("orders").select("customer_email").execute()).toEqual([
      { customer_email: null },
    ]);
  });

  it("keeps idempotency keys unique per owner, not globally", async () => {
    await insertOrder(db);
    await expectViolation(
      insertOrder(db, { id: ORDER_ID_2 }),
      "23505",
      "orders_owner_idempotency_key_key",
    );
    await insertOrder(db, { id: ORDER_ID_2, owner_id: "another-owner" });
    expect(await db.selectFrom("orders").select("id").execute()).toHaveLength(2);
  });

  it("checks order line amounts, quantity and uniqueness", async () => {
    await insertOrder(db);
    await expectViolation(
      // quantity 1, so the subtotal still equals unit × quantity and only
      // the unit-price check is broken.
      insertOrderLine(db, { unit_price_cents: -1, quantity: 1, line_subtotal_cents: -1 }),
      "23514",
      "order_lines_unit_price_cents_check",
    );
    await expectViolation(
      insertOrderLine(db, { quantity: 0, line_subtotal_cents: 0 }),
      "23514",
      "order_lines_quantity_check",
    );
    await expectViolation(
      insertOrderLine(db, { line_subtotal_cents: 999 }),
      "23514",
      "order_lines_line_subtotal_cents_check",
    );
    await expectViolation(
      insertOrderLine(db, { position: -1 }),
      "23514",
      "order_lines_position_check",
    );
    await insertOrderLine(db);
    await expectViolation(insertOrderLine(db, { item_id: "other" }), "23505", "order_lines_pkey");
    await expectViolation(
      insertOrderLine(db, { position: 1 }),
      "23505",
      "order_lines_order_id_item_id_key",
    );
  });

  it("refuses to delete an order that has lines", async () => {
    await insertOrder(db);
    await insertOrderLine(db);
    await expectViolation(
      db.deleteFrom("orders").execute(),
      RESTRICT_VIOLATION,
      "order_lines_order_id_fkey",
    );
  });
});

describe("migrations — reversibility and repeatability (AC2)", () => {
  let db: Kysely<DatabaseSchema>;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await migrate(db, "latest");
    await db.destroy();
  });

  it("is a no-op when already at latest", async () => {
    const { results } = await migrate(db, "latest");
    expect(results).toEqual([]);
  });

  it("reverts to no application tables, then reapplies the identical schema", async () => {
    const before = await schemaSnapshot(db);

    const down = await migrate(db, "none");
    expect(down.results?.map((r) => [r.migrationName, r.direction, r.status])).toEqual([
      ["0001_initial_schema", "Down", "Success"],
    ]);
    expect(await applicationTables(db)).toEqual([]);

    const up = await migrate(db, "latest");
    expect(up.results?.map((r) => [r.migrationName, r.direction, r.status])).toEqual([
      ["0001_initial_schema", "Up", "Success"],
    ]);
    expect(await schemaSnapshot(db)).toEqual(before);
  });

  it("reverts one step with 'down'", async () => {
    const { results } = await migrate(db, "down");
    expect(results?.map((r) => r.migrationName)).toEqual(["0001_initial_schema"]);
    expect(await applicationTables(db)).toEqual([]);
  });
});

// --- helpers ---------------------------------------------------------------

// ON DELETE RESTRICT raises restrict_violation (23001); a NO ACTION foreign
// key would raise foreign_key_violation (23503) instead — so this code also
// proves the delete action is the planned one.
const RESTRICT_VIOLATION = "23001";

const ORDER_ID = "00000000-0000-4000-8000-000000000001";
const ORDER_ID_2 = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-25T12:00:00.000Z");

async function expectViolation(
  operation: Promise<unknown>,
  code: string,
  constraint: string | readonly string[],
): Promise<void> {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, `expected ${String(constraint)} to be violated`).toBeDefined();
  expect((error as { code?: string }).code).toBe(code);
  const names = typeof constraint === "string" ? [constraint] : constraint;
  expect(names).toContain((error as { constraint?: string }).constraint);
}

function insertCategory(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<DatabaseSchema["menu_categories"]> = {},
) {
  return db
    .insertInto("menu_categories")
    .values({ id: "starters", name: "Starters", position: 0, ...overrides })
    .execute();
}

function insertItem(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<DatabaseSchema["menu_items"]> = {},
) {
  return db
    .insertInto("menu_items")
    .values({
      id: "garlic-bread",
      category_id: "starters",
      position: 0,
      name: "Garlic Bread",
      description: "d",
      long_description: "ld",
      price_cents: 595,
      available: true,
      dietary_tags: [],
      allergens: [],
      calories: 320,
      ...overrides,
    })
    .execute();
}

function insertCart(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<DatabaseSchema["carts"]> = {},
) {
  return db
    .insertInto("carts")
    .values({ owner_id: "owner", version: 1, created_at: NOW, updated_at: NOW, ...overrides })
    .execute();
}

function insertCartLine(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<DatabaseSchema["cart_lines"]> = {},
) {
  return db
    .insertInto("cart_lines")
    .values({ owner_id: "owner", item_id: "garlic-bread", position: 0, quantity: 1, ...overrides })
    .execute();
}

function insertOrder(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<Omit<DatabaseSchema["orders"], "status">> & { status?: string } = {},
) {
  return db
    .insertInto("orders")
    .values({
      id: ORDER_ID,
      owner_id: "owner",
      idempotency_key: "key-1",
      status: "placed",
      item_count: 2,
      subtotal_cents: 1190,
      total_cents: 1190,
      customer_full_name: "Ada Lovelace",
      customer_phone: "5551234",
      customer_email: "ada@example.com",
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    } as DatabaseSchema["orders"])
    .execute();
}

function insertOrderLine(
  db: Kysely<DatabaseSchema>,
  overrides: Partial<DatabaseSchema["order_lines"]> = {},
) {
  return db
    .insertInto("order_lines")
    .values({
      order_id: ORDER_ID,
      position: 0,
      item_id: "garlic-bread",
      name: "Garlic Bread",
      unit_price_cents: 595,
      quantity: 2,
      line_subtotal_cents: 1190,
      ...overrides,
    })
    .execute();
}
