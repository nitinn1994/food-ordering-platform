// `pnpm --filter commerce-api db:seed` — loads the demo menu
// (DEMO_MENU_SEED, docs/features/mcdelivery-redesign/plan.md Phase 2) into
// the database DATABASE_URL names (.env), and never prints the connection
// string. Run `db:migrate` first. MENU_SEED, the smaller menu the tests
// assert, is not what this loads; seedMenu() still defaults to it for the
// DB test suite.
//
// With NODE_ENV=production it refuses to run unless given
// --allow-production (docs/features/phase-10-database-persistence/plan.md
// §11; Phase 18 OD14): there is no other production menu-loading path yet
// (plan.md §22 D4), so an operator loads the menu with this one-shot, on
// purpose, from the built dist/seed.js. The seed is an upsert of the
// in-code menu: re-running it restores the seeded rows' names, prices and
// availability.
import { EnvValidationError, parseEnv } from "../../config/env.schema";
import { createDatabase } from "../database-client";
import { seedMenu } from "../menu-seed";
import { DEMO_MENU_SEED } from "../../modules/menu/infrastructure/demo-menu.seed";
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

  if (config.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    console.error(
      "db:seed would overwrite the production menu; refusing to run without --allow-production.",
    );
    process.exit(1);
  }

  const db = createDatabase(config);
  try {
    await seedMenu(db, DEMO_MENU_SEED);
    const [categories, items] = await Promise.all([
      db.selectFrom("menu_categories").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
      db.selectFrom("menu_items").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    ]);
    console.log(`Menu seeded: ${categories.n} categories, ${items.n} items in the database.`);
  } catch (error) {
    // Only the code — a driver error's message or detail could quote row
    // values (persistence.errors.ts).
    const { code, constraint } = describeDriverError(error);
    if (code === "23505" && constraint === "menu_categories_position_key") {
      // A menu from an earlier seed is in the way: the seed never deletes,
      // and the demo menu reuses category positions 0…n (review-report.md
      // finding 4; docs/operations/production-runbook.md).
      console.error(
        "Seeding failed: an earlier menu's categories already hold these positions, " +
          "and the seed never deletes. Nothing was written. Remove the old menu first " +
          "(docs/development/getting-started.md, docs/operations/production-runbook.md).",
      );
      process.exitCode = 1;
      return;
    }
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
