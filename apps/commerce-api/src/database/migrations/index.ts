import type { Migration } from "kysely/migration";
import * as initialSchema from "./0001_initial_schema";

// Every migration, in order, listed explicitly rather than discovered on
// disk (docs/features/phase-10-database-persistence/plan.md §10, OD7): the
// set is deterministic, reviewable in one place, and needs no filesystem
// access at runtime. Kysely runs them in key order, so each key is its
// file's name — `NNNN_snake_description`, zero-padded.
//
// Adding a migration: create the next `NNNN_*.ts` with `up` and `down`, and
// add one line here. Never edit or reorder an existing entry.
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  "0001_initial_schema": initialSchema,
};
