import { type Kysely, sql } from "kysely";

// The initial schema (docs/features/phase-10-database-persistence/plan.md
// §5). Never edit this file once merged — a schema change is a new
// migration (plan.md §10).
//
// Written against Kysely<any>, not DatabaseSchema: a migration must keep
// describing the schema as it was at this point in history, whatever the
// table types say later.
//
// Every constraint is named explicitly, so error mapping can recognise one
// by name (persistence.errors.ts's isUniqueViolation) and
// migrations.db.test.ts can assert the exact set. The bounds repeat the
// contracts' own (@contracts/common MAX_ID_LENGTH 64, MAX_QUANTITY 99,
// MAX_IDEMPOTENCY_KEY_LENGTH 128; api-contracts order name ≤ 80, fullName ≤
// 100, phone ≤ 32, email ≤ 254) as a second line of defence; the API
// validates all of them at the edge first.
//
// Deliberately absent (plan.md §5, finding 6, OD6): no foreign key from
// cart_lines.item_id or order_lines.item_id to menu_items. A cart line must
// outlive its item leaving the menu (Cart drops it from the priced view and
// Order refuses to place it — ADR-0015, ADR-0016); an order line is a
// historical snapshot.

// A migration is schema-agnostic by design (Kysely's documented pattern).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = Kysely<any>;

export async function up(db: AnyDatabase): Promise<void> {
  await db.schema
    .createTable("menu_categories")
    .addColumn("id", "varchar(64)", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("menu_categories_pkey", ["id"])
    .addUniqueConstraint("menu_categories_position_key", ["position"])
    .addCheckConstraint("menu_categories_position_check", sql`"position" >= 0`)
    .execute();

  await db.schema
    .createTable("menu_items")
    .addColumn("id", "varchar(64)", (col) => col.notNull())
    .addColumn("category_id", "varchar(64)", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("long_description", "text", (col) => col.notNull())
    .addColumn("price_cents", "integer", (col) => col.notNull())
    .addColumn("available", "boolean", (col) => col.notNull())
    .addColumn("dietary_tags", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("allergens", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("calories", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("menu_items_pkey", ["id"])
    .addForeignKeyConstraint(
      "menu_items_category_id_fkey",
      ["category_id"],
      "menu_categories",
      ["id"],
      (fk) => fk.onDelete("restrict"),
    )
    // Also the index the menu list query and the FK use.
    .addUniqueConstraint("menu_items_category_id_position_key", [
      "category_id",
      "position",
    ])
    .addCheckConstraint("menu_items_position_check", sql`"position" >= 0`)
    .addCheckConstraint("menu_items_price_cents_check", sql`price_cents >= 0`)
    .addCheckConstraint("menu_items_calories_check", sql`calories >= 0`)
    .execute();

  // One cart per owner (ADR-0015 §3): the owner id is the key.
  await db.schema
    .createTable("carts")
    .addColumn("owner_id", "varchar(128)", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("carts_pkey", ["owner_id"])
    .addCheckConstraint("carts_version_check", sql`version >= 1`)
    .execute();

  await db.schema
    .createTable("cart_lines")
    .addColumn("owner_id", "varchar(128)", (col) => col.notNull())
    .addColumn("item_id", "varchar(64)", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("quantity", "smallint", (col) => col.notNull())
    // One line per item (cart.invariants.ts).
    .addPrimaryKeyConstraint("cart_lines_pkey", ["owner_id", "item_id"])
    .addForeignKeyConstraint(
      "cart_lines_owner_id_fkey",
      ["owner_id"],
      "carts",
      ["owner_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addUniqueConstraint("cart_lines_owner_id_position_key", [
      "owner_id",
      "position",
    ])
    .addCheckConstraint("cart_lines_position_check", sql`"position" >= 0`)
    .addCheckConstraint(
      "cart_lines_quantity_check",
      sql`quantity >= 1 AND quantity <= 99`,
    )
    .execute();

  await db.schema
    .createTable("orders")
    .addColumn("id", "uuid", (col) => col.notNull())
    .addColumn("owner_id", "varchar(128)", (col) => col.notNull())
    .addColumn("idempotency_key", "varchar(128)", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("item_count", "integer", (col) => col.notNull())
    .addColumn("subtotal_cents", "integer", (col) => col.notNull())
    .addColumn("total_cents", "integer", (col) => col.notNull())
    .addColumn("customer_full_name", "varchar(100)", (col) => col.notNull())
    .addColumn("customer_phone", "varchar(32)", (col) => col.notNull())
    // NULL ⇔ no email was given; never "" (plan.md §8).
    .addColumn("customer_email", "varchar(254)")
    .addColumn("created_at", "timestamptz", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("orders_pkey", ["id"])
    // Idempotency is scoped per owner (ADR-0016 §4); also the index
    // findByIdempotencyKey uses.
    .addUniqueConstraint("orders_owner_idempotency_key_key", [
      "owner_id",
      "idempotency_key",
    ])
    .addCheckConstraint("orders_status_check", sql`status IN ('placed')`)
    .addCheckConstraint("orders_item_count_check", sql`item_count >= 1`)
    .addCheckConstraint("orders_subtotal_cents_check", sql`subtotal_cents >= 0`)
    .addCheckConstraint("orders_total_cents_check", sql`total_cents >= 0`)
    // No tax, fee, tip or discount (Phase 4 D5, ADR-0016 §1).
    .addCheckConstraint(
      "orders_total_equals_subtotal_check",
      sql`total_cents = subtotal_cents`,
    )
    .execute();

  await db.schema
    .createTable("order_lines")
    .addColumn("order_id", "uuid", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("item_id", "varchar(64)", (col) => col.notNull())
    .addColumn("name", "varchar(80)", (col) => col.notNull())
    .addColumn("unit_price_cents", "integer", (col) => col.notNull())
    .addColumn("quantity", "smallint", (col) => col.notNull())
    .addColumn("line_subtotal_cents", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("order_lines_pkey", ["order_id", "position"])
    // Orders are never deleted; RESTRICT makes an accidental delete fail
    // rather than silently taking its lines with it.
    .addForeignKeyConstraint(
      "order_lines_order_id_fkey",
      ["order_id"],
      "orders",
      ["id"],
      (fk) => fk.onDelete("restrict"),
    )
    .addUniqueConstraint("order_lines_order_id_item_id_key", [
      "order_id",
      "item_id",
    ])
    .addCheckConstraint("order_lines_position_check", sql`"position" >= 0`)
    .addCheckConstraint(
      "order_lines_unit_price_cents_check",
      sql`unit_price_cents >= 0`,
    )
    .addCheckConstraint(
      "order_lines_quantity_check",
      sql`quantity >= 1 AND quantity <= 99`,
    )
    .addCheckConstraint(
      "order_lines_line_subtotal_cents_check",
      sql`line_subtotal_cents = unit_price_cents * quantity`,
    )
    .execute();
}

// Reverse dependency order. Development and test only — a production
// rollback policy is deferred to the deployment phase (plan.md §10).
export async function down(db: AnyDatabase): Promise<void> {
  await db.schema.dropTable("order_lines").execute();
  await db.schema.dropTable("orders").execute();
  await db.schema.dropTable("cart_lines").execute();
  await db.schema.dropTable("carts").execute();
  await db.schema.dropTable("menu_items").execute();
  await db.schema.dropTable("menu_categories").execute();
}
