import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// The DB test suite: `pnpm --filter commerce-api test:db`
// (docs/features/phase-10-database-persistence/plan.md §17, OD10). Runs
// only *.db.test.ts, against the Compose Postgres's `commerce_test`
// database (TEST_DATABASE_URL). Same SWC transform as vitest.config.ts.
//
// - globalSetup fails the whole run, with the command that fixes it, when
//   the database is unreachable — this suite never skips (AC16) — then
//   resets the schema and migrates.
// - Files run one at a time: they share one database, and each test
//   truncates it (test/support/test-database.ts).
// - passWithNoTests is off: a run that finds no DB tests is a mistake, not
//   a pass.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts", "test/**/*.db.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./test/db-global-setup.ts"],
    fileParallelism: false,
    passWithNoTests: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
