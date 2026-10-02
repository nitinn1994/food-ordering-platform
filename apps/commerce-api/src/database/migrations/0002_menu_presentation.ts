import { type Kysely, sql } from "kysely";

// Menu presentation columns for the McDelivery-style UI
// (docs/features/mcdelivery-redesign/plan.md, Phase 2). Additive only:
// every new column is nullable or has a default, so existing rows stay
// valid and `down` restores 0001's schema exactly.
//
// The checks mirror @contracts/api-contracts' menu.ts: a same-origin image
// path, a positive weight, and the fixed badge / feature sets. The domain
// and the contract validate first; these keep hand-written SQL honest.

// Written against Kysely<any>, like 0001: a migration describes the schema
// as it was at this point in history.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = Kysely<any>;

const IMAGE_PATH_CHECK = sql`image_url ~ '^(/[a-z0-9][a-z0-9-]*)+\\.(svg|png|jpe?g|webp)$'`;

export async function up(db: AnyDatabase): Promise<void> {
  await db.schema
    .alterTable("menu_categories")
    .addColumn("image_url", "text")
    .execute();
  await db.schema
    .alterTable("menu_categories")
    .addCheckConstraint("menu_categories_image_url_check", IMAGE_PATH_CHECK)
    .execute();

  await db.schema
    .alterTable("menu_items")
    .addColumn("image_url", "text")
    .addColumn("weight_grams", "integer")
    .addColumn("badge", "text")
    .addColumn("featured", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .execute();
  await db.schema
    .alterTable("menu_items")
    .addCheckConstraint("menu_items_image_url_check", IMAGE_PATH_CHECK)
    .execute();
  await db.schema
    .alterTable("menu_items")
    .addCheckConstraint(
      "menu_items_weight_grams_check",
      sql`weight_grams >= 1 AND weight_grams <= 5000`,
    )
    .execute();
  await db.schema
    .alterTable("menu_items")
    .addCheckConstraint(
      "menu_items_badge_check",
      sql`badge IN ('new', 'bestseller', 'value')`,
    )
    .execute();
  await db.schema
    .alterTable("menu_items")
    .addCheckConstraint(
      "menu_items_featured_check",
      sql`featured <@ ARRAY['popular', 'deal', 'new-launch']::text[]`,
    )
    .execute();
}

export async function down(db: AnyDatabase): Promise<void> {
  await db.schema
    .alterTable("menu_items")
    .dropColumn("image_url")
    .dropColumn("weight_grams")
    .dropColumn("badge")
    .dropColumn("featured")
    .execute();
  await db.schema.alterTable("menu_categories").dropColumn("image_url").execute();
}
