import type { Kysely } from "kysely";
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from "kysely/migration";
import { MIGRATIONS } from "./migrations";

// Migrations run only when asked — `pnpm --filter commerce-api db:migrate`
// or the DB test setup — never at API boot
// (docs/features/phase-10-database-persistence/plan.md §10, OD7). Kysely
// records what has run in its own `kysely_migration` table and takes a lock
// in `kysely_migration_lock`, so two concurrent runs cannot interleave.
//
// `Kysely<any>`, matching Kysely's own MigratorProps: migrations are
// schema-agnostic by design (see migrations/0001_initial_schema.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => ({ ...MIGRATIONS }) },
  });
}

export type MigrationDirection = "latest" | "down" | "none";

// Thrown when Kysely reports a failed run. Kysely has already rolled back
// the failing migration (each runs in a transaction on Postgres).
export class MigrationFailedError extends Error {
  constructor(
    public readonly resultSet: MigrationResultSet,
    reason: string,
  ) {
    super(`Migration failed: ${reason}`);
    this.name = "MigrationFailedError";
  }
}

// "latest" applies everything pending; "down" reverts the most recent one;
// "none" reverts everything (tests only — plan.md §17, AC2).
export async function migrate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  direction: MigrationDirection,
): Promise<MigrationResultSet> {
  const migrator = createMigrator(db);
  const resultSet =
    direction === "latest"
      ? await migrator.migrateToLatest()
      : direction === "down"
        ? await migrator.migrateDown()
        : await migrator.migrateTo(NO_MIGRATIONS);

  if (resultSet.error !== undefined) {
    const failed = resultSet.results?.find((result) => result.status === "Error");
    const reason =
      resultSet.error instanceof Error ? resultSet.error.message : String(resultSet.error);
    throw new MigrationFailedError(
      resultSet,
      failed === undefined ? reason : `${failed.migrationName}: ${reason}`,
    );
  }
  return resultSet;
}
