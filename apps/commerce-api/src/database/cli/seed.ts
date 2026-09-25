// `pnpm --filter commerce-api db:seed` — loads the menu seed into the
// database DATABASE_URL names (.env). Development only
// (docs/features/phase-10-database-persistence/plan.md §11): it refuses to
// run with NODE_ENV=production, and never prints the connection string.
// Run `db:migrate` first.
import { EnvValidationError, parseEnv } from "../../config/env.schema";
import { createDatabase } from "../database-client";
import { seedMenu } from "../menu-seed";
import { describeDriverError } from "../persistence.errors";

async function main(): Promise<void> {
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

  if (config.NODE_ENV === "production") {
    console.error("db:seed is for development and test databases only; refusing to run.");
    process.exit(1);
  }

  const db = createDatabase(config);
  try {
    await seedMenu(db);
    const [categories, items] = await Promise.all([
      db.selectFrom("menu_categories").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
      db.selectFrom("menu_items").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    ]);
    console.log(`Menu seeded: ${categories.n} categories, ${items.n} items in the database.`);
  } catch (error) {
    // Only the code — a driver error's message or detail could quote row
    // values (persistence.errors.ts).
    const { code } = describeDriverError(error);
    console.error(
      error instanceof Error && code === undefined
        ? `Seeding failed: ${error.message}`
        : `Seeding failed (code ${code ?? "unknown"}). Has \`db:migrate\` been run?`,
    );
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

void main();
