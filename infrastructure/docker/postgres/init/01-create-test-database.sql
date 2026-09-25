-- The database the DB test suite (pnpm --filter commerce-api test:db) runs
-- against — separate from the `commerce` development database, so tests
-- never truncate a developer's data (plan.md §17). The test setup also
-- refuses any database whose name does not end in "_test".
--
-- Runs only when the Compose volume is first initialised.
CREATE DATABASE commerce_test;
