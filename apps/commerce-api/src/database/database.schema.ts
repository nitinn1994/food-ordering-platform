// Kysely's view of the tables migrations/0001_initial_schema.ts creates —
// row shapes only, hand-written (docs/features/phase-10-database-persistence/
// plan.md §4, OD2). These are storage types, not domain types: each
// Postgres*Repository maps between them and its own module's domain model,
// and nothing outside src/database/ and modules/*/infrastructure/ imports
// this file (ESLint enforces the domain side of that, plan.md §27).
//
// Drift from the migration is caught by migrations.db.test.ts (the actual
// schema) and by each repository's round-trip tests (every column).
//
// Column types as `pg` returns them: integer / smallint → number,
// timestamptz → Date, text[] → string[], uuid → lowercase string.

export interface MenuCategoriesTable {
  id: string;
  name: string;
  position: number;
}

export interface MenuItemsTable {
  id: string;
  category_id: string;
  position: number;
  name: string;
  description: string;
  long_description: string;
  price_cents: number;
  available: boolean;
  dietary_tags: string[];
  allergens: string[];
  calories: number;
}

export interface CartsTable {
  owner_id: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CartLinesTable {
  owner_id: string;
  item_id: string;
  position: number;
  quantity: number;
}

export interface OrdersTable {
  id: string;
  owner_id: string;
  idempotency_key: string;
  status: "placed";
  item_count: number;
  subtotal_cents: number;
  total_cents: number;
  customer_full_name: string;
  customer_phone: string;
  // NULL ⇔ the domain's email is absent — never "" (plan.md §8).
  customer_email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderLinesTable {
  order_id: string;
  position: number;
  item_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_subtotal_cents: number;
}

export interface DatabaseSchema {
  menu_categories: MenuCategoriesTable;
  menu_items: MenuItemsTable;
  carts: CartsTable;
  cart_lines: CartLinesTable;
  orders: OrdersTable;
  order_lines: OrderLinesTable;
}
