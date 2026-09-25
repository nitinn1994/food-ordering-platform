import { type Kysely, sql } from "kysely";
import type { AppConfig } from "../../src/config/env.schema";
import { testConfig } from "../../src/config/test-config";
import { createDatabase } from "../../src/database/database-client";
import type { DatabaseSchema } from "../../src/database/database.schema";

// Shared by the DB test suite only (*.db.test.ts, test/db-global-setup.ts;
// docs/features/phase-10-database-persistence/plan.md §17).

// The Compose database's test database, matching .env.example — a
// development-only value, used when TEST_DATABASE_URL is unset.
export const DEFAULT_TEST_DATABASE_URL =
  "postgres://commerce:commerce@127.0.0.1:5432/commerce_test";

// Every application table, children first. Kysely's own migration tables
// are deliberately not here: truncating them would make the schema look
// unmigrated.
export const APPLICATION_TABLES = [
  "order_lines",
  "orders",
  "cart_lines",
  "carts",
  "menu_items",
  "menu_categories",
] as const;

// Refuses any database whose name does not end in "_test", before a single
// query runs — this suite drops schemas and truncates tables, and must
// never be pointed at a developer's `commerce` database (plan.md Risk R5).
export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"] ?? DEFAULT_TEST_DATABASE_URL;
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run the DB test suite against database "${name}": its name must end in "_test".`,
    );
  }
  return url;
}

export function testDatabaseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return testConfig({ DATABASE_URL: testDatabaseUrl(), ...overrides });
}

export function createTestDatabase(): Kysely<DatabaseSchema> {
  return createDatabase(testDatabaseConfig());
}

// Empties every application table, checking once more — against the
// server's own answer this time — that this is a test database.
export async function resetDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(db);
  const name = rows[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to truncate database "${name}".`);
  }
  await sql`truncate table ${sql.join(
    APPLICATION_TABLES.map((table) => sql.table(table)),
  )} restart identity`.execute(db);
}
