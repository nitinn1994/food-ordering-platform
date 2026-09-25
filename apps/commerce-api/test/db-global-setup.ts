import { sql } from "kysely";
import { migrate } from "../src/database/migrator";
import { createTestDatabase } from "./support/test-database";

// Runs once before the DB suite (vitest.db.config.ts;
// docs/features/phase-10-database-persistence/plan.md §17). It fails the
// whole run, rather than letting any test skip, when the database cannot be
// reached (AC16), then rebuilds the test database's schema from nothing by
// running every migration — so the suite always tests the migrations as
// written, never a hand-altered schema.
export default async function setup(): Promise<void> {
  const db = createTestDatabase();
  try {
    try {
      await sql`select 1`.execute(db);
    } catch {
      throw new Error(
        "The DB test suite needs the local Postgres test database, and it is not reachable. " +
          "Start it with `pnpm --filter commerce-api db:up` (Docker must be running), " +
          "or set TEST_DATABASE_URL to a reachable database whose name ends in \"_test\".",
      );
    }
    await sql`drop schema if exists public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    await migrate(db, "latest");
  } finally {
    await db.destroy();
  }
}
