// `pnpm --filter commerce-api db:migrate` (to latest) and
// `db:migrate:down` (revert the most recent) — development only
// (docs/features/phase-10-database-persistence/plan.md §10, §16). Reads the
// same validated configuration as the API (DATABASE_URL from .env), and
// never prints the connection string.
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
