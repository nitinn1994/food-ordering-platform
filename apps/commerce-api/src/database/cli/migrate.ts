// `pnpm --filter commerce-api db:migrate` (to latest) and
// `db:migrate:down` (revert the most recent)
// (docs/features/phase-10-database-persistence/plan.md §10, §16). Reads the
// same validated configuration as the API (DATABASE_URL from .env), and
// never prints the connection string.
//
// Since Phase 18 it is also built to dist/migrate.js, which a production
// image runs once before the API starts (`pnpm start:migrate`). Production
// migrations are forward-only (plan.md §11): "down" refuses to run with
// NODE_ENV=production — rollback means redeploying the previous release
// against a backward-compatible schema, never dropping tables.
import { EnvValidationError, parseEnv } from "../../config/env.schema";
import { createDatabase } from "../database-client";
import { migrate } from "../migrator";

async function main(): Promise<void> {
  const direction = process.argv[2] === "down" ? "down" : "latest";

  let config;
  try {
    config = parseEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  if (direction === "down" && config.NODE_ENV === "production") {
    console.error("Migrations are forward-only in production; refusing to run down.");
    process.exit(1);
  }

  const db = createDatabase(config);
  try {
    const { results = [] } = await migrate(db, direction);
    if (results.length === 0) {
      console.log(
        direction === "latest" ? "Already up to date." : "Nothing to revert.",
      );
    }
    for (const result of results) {
      console.log(`${result.status}: ${result.direction} ${result.migrationName}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

void main();
