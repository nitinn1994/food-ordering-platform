# Review Report — mcdelivery-redesign (Phases 1–2)

**Reviewed:** `requirements.md`, `plan.md` (including the Phase 2 scope
change, option A) and `test-plan.md`, then the whole uncommitted diff: 65
tracked files (+1794 / −218) and every untracked source, test and SVG. It
was reviewed twice: by the implementer, and independently by the
read-only `implementation-reviewer` agent. The findings were merged, and
each one kept here was re-checked against the code. Contrast ratios are
computed from the token values. Validation evidence comes from the
2026-09-30 `/validate` run.
**Path:** Full. Phases 3–5 are not implemented and not reviewed.

## Verdict

Sound. There is no BLOCKER or HIGH finding. The contract, migration, seed,
repository mapping and image-path guards are correct and tested. Four
MEDIUM findings should be fixed or explicitly deferred before a PR: one
failed contrast pair, focus and content hidden under the fixed mobile
chrome, UI commands that can target items the chips have hidden, and a
production runbook that the seed change makes wrong. The pre-existing
`pnpm audit` failure (brace-expansion, dev-only) still blocks CI's audit
job, independent of this work.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM | `apps/web/src/components/home/HeroBanner.module.css:19` (`.eyebrow`) | The eyebrow "HOT, FRESH AND FAST" is yellow `#ffbc0b` on red `#da0005`, **3.13:1**, at 0.85rem bold. That is small text, so it needs 4.5:1. **AC-U8 fails** for this element. Every other text pair used passes: muted on white 5.17, muted on cream 4.82, chips 6.11, Add button 8.39, white on red 5.27. | Use `--color-on-brand` (white, 5.27:1) for the eyebrow, or put it on a darker pill. Add the pair to a contrast test (see #10). |
| 2 | MEDIUM | `apps/web/src/app/page.module.css` (`padding-bottom: 96px`), `components/cart/CartPanel.module.css` (fixed bar, `flex-wrap`), `components/menu/ItemDetailPanel.module.css` (`bottom: 76px`, `max-height: 55vh`) | On narrow screens a sticky header, a sticky rail and a fixed cart bar surround the content, and there is no `scroll-padding` anywhere in `apps/web/src`. A keyboard user can tab to a card's button that sits under the header, rail or bar (WCAG 2.4.11). The bar wraps when its text is long (errors, large text size) and then grows past the literal 76px the detail sheet assumes, so the two overlap. On a short or landscape viewport, an open sheet covers most of the list. | Add one `--cart-bar-height` token and use it for the bar, the sheet's `bottom` and the page's bottom padding. Add `scroll-padding-top` / `scroll-padding-bottom` on `html` to cover the sticky and fixed chrome. Cap the sheet, e.g. `max-height: min(55vh, 100vh - header - bar)`. Verify in a browser at 375×667 and in landscape (jsdom cannot). |
| 3 | MEDIUM | `apps/web/src/components/menu/MenuList.tsx` (local `diet` / `feature` state) with `lib/commands/dispatch.ts` (`ShowMenuCategory`, `HighlightItem`) | The Veg / Non-Veg and Popular / Deals / New Launch chips are local state that UI commands cannot see. With "Veg" pressed, an AI "show me the …" or `HighlightItem` of a non-veg item can end up on an empty grid, or highlight a card that isn't rendered. The customer sees "No items match these filters." or nothing. This does not break the backend-authority rule (it's presentation only), but a UI command stops having a visible effect. | Pick one: clear both chips when `ShowMenuCategory`, `HighlightItem` or `SearchMenu` is dispatched (move the chip state into `uiStore` and reset it in those reducers), or keep the chips and show a "filters are hiding N items — clear" hint. Record the choice. Phase 4's `ShowNudge` will have the same problem. |
| 4 | MEDIUM | `docs/operations/production-runbook.md:150-154`, `docs/operations/production-readiness-checklist.md:28` | Both docs say `dist/seed.js --allow-production` "loads the in-code menu" and that re-running it "restores the seeded items". Since Phase 2 it loads `DEMO_MENU_SEED`. On a database already seeded with the old menu, the category positions collide, and the seed rolls back with a raw unique-violation code (`cli/seed.ts` prints only the code). The work made these docs wrong, and `scope-control.md` counts updating them as in scope. | Update both docs: it now loads the demo menu, a previously seeded database must be migrated but its old menu rows removed first, and the error you see if not. Optionally, in `cli/seed.ts`, map `23505` on `menu_categories_position_key` to a readable message that names this cause. |
| 5 | MEDIUM | `packages/contracts/api-contracts/src/menu.ts` (`z.strictObject`), `apps/ai-service/ai_service/contracts/api_contracts.py` (`extra="forbid"`) | Adding the fields is additive for this monorepo, which updates everything together. But any web or ai-service build older than this contract rejects the **whole** `/v1/menu` once commerce-api sends `imageUrl` / `badge` / `featured`. That happens as soon as the demo seed is loaded. A deploy that updates commerce-api first breaks menu loading in the older consumers. | No code change. Note in the PR and runbook that contracts, ai-service and web deploy before (or with) commerce-api. |
| 6 | LOW | `apps/ai-service/tests/test_commerce_client.py:129` | The round-trip assertion now uses `exclude_unset=True`. That's justified (absent optional fields must stay absent), but the test can no longer catch a model that silently drops an optional field the server did send. `test_generated_contracts.py` validates such an item, but nothing sends one through the client. | Add a client round-trip case whose menu item carries every presentation field. |
| 7 | LOW | `apps/web/src/components/home/HeroBanner.tsx` (`aria-label="Featured"`), `components/menu/MenuList.tsx` (`role="group" aria-label="Featured"`) | A region and a group share the accessible name "Featured", so a screen-reader user hears the same label for the promo banner and the chip filters. | Rename the group to "Featured filters" (or the hero to "Promotion"). |
| 8 | LOW | `packages/contracts/api-contracts/src/menu.ts` (`featured`), `0002_menu_presentation.ts` (`menu_items_featured_check`) | `featured` does not have to be unique: `["popular","popular"]` passes zod, the `<@` check and pydantic. It's harmless in the UI but looser than needed. | Add a `.refine` for uniqueness in the contract; the DB check can stay. |
| 9 | LOW | `docs/development/getting-started.md` ("Test (all packages)" row), `docs/api/contracts.md` | The per-package test counts still show the Phase 16 numbers. `/validate` measured api-contracts 126, commerce-api 379, web 568 and the DB suite 118. `contracts.md` does not mention the new optional menu fields (`commerce-api.md` does). | Update both. The plan put the ADRs and the broader doc pass in Phase 5, but these two rows are stale now. |
| 10 | LOW | `apps/web/src/app/globals.test.ts` | AC-U8 (contrast) is checked only by hand. Finding #1 would have been caught by a small test over the token values. | Add a unit test computing WCAG ratios for the text / background token pairs the components use. |
| 11 | LOW | `apps/web/src/components/nav/SiteNav.tsx` | The header has five focusable `aria-disabled` placeholders before the main content. That's correct for OQ2 (a), but it's five dead tab stops, and there's no skip link. | Add a "Skip to menu" link (Phase 5 touches the header anyway). |
| 12 | NOTE | `requirements.md` AC-U4 | AC-U4 says the rail "scrolls to that section and marks it active (`aria-current`)". The implementation keeps the existing filter semantics and `aria-pressed`, which is reported, deliberate, and required by the Phase 2 AC2 tests and `ShowMenuCategory`. The criterion as written is not met. | Amend AC-U4 to what was built, or schedule the scroll-spy change and its UI-command implications. |
| 13 | NOTE | `apps/commerce-api/src/database/cli/seed.ts` | The production seed path now loads the 30-item demo menu instead of the 6-item one. That follows from option A, but it is a production data change as well as a local one. | Confirm this is what you want before any production seed. It ties to #4. |
| 14 | NOTE | `MenuItemCard.tsx` (`aria-label="Add to cart"`) | Every card's button has the same name. This is pre-existing and not introduced here. WCAG 2.5.3 is met (the visible "Add" is the start of the name). | Out of scope. "Add Paneer Crunch Burger to cart" would be better later, but it changes many existing tests. |
| 15 | NOTE | — | Verified correct and not a finding: see the list below this table. | — |

**Verified correct (both reviewers):**
- **Migration `0002`:**
  - Additive only.
  - `down` restores 0001's schema; Postgres drops the column checks together with the columns.
  - The `IMAGE_PATH_CHECK` regex matches the zod and pydantic regexes exactly and rejects `..`, `//`, schemes and uppercase.
  - Tested up, down and up again.
- **Seed upsert:** the insert and `doUpdateSet` use the same row builder, so a re-seed writes the new columns and clears stale values.
- **Repository and mapper:** NULL and `{}` become absent fields, never `null`, and the in-memory adapter, the mapper and the contract agree. The `as` casts are backed by the DB checks.
- **`imageUrl` is guarded at four points:** the contract, the DB check, web's `menuResponseSchema` parse (`menuSource.ts`), and the CSP `img-src 'self' data:` (`security/headers.ts:30`). `<img alt="">` cannot run SVG script.
- **Filters:** they compose, are null-safe, and drop emptied categories. Chips the menu cannot fill are hidden.
- **AC-U6:** no McDonald's name, font, logo or photo is in `apps/`. Only two code comments mention the reference site by name ("McDelivery-style UI").

## Acceptance criteria status (Phases 1–2)

| AC | Status | Evidence / gap |
| -- | ------ | -------------- |
| AC-U1 tokens | Met | `globals.test.ts`: token presence, and no brand hex in any CSS module |
| AC-U2 layout | Partly verified | Desktop 1366px was seen in a browser. At 375px only "no horizontal scroll" was measured, on whatever page was open. See #2. |
| AC-U3 card anatomy | Met | `MenuItemCard.test.tsx` (marker, badge, image or fallback, price, Add, allergens, weight / kcal) |
| AC-U4 rail + chips | Partly met | The chips are met. The rail's scroll + `aria-current` is not (#12). |
| AC-U5 INR | Met | `money.test.ts`, plus the cart / checkout / confirmation tests assert ₹ |
| AC-U6 no brand assets | Met | The grep above |
| AC-U7 no regressions | Met | The full web suite passes; changed tests are listed in the implementation reports |
| AC-U8 contrast / focus | **Not met** | #1 (3.13:1). Focus obscuring #2. No Lighthouse or keyboard pass was run. |
| AC-M1 migration | Met | DB suite: up, down to 0002 only, none, and up again |
| AC-M2 seed + API | Met (DB suite) | `seedMenu(db, DEMO_MENU_SEED)` round-trip. The `db:seed` CLI has not been run end to end on a fresh database. |
| AC-M3 ai-service models | Met | Regenerated; `pytest` 790 passed |
| AC-M4 optional fields | Met | Contract, mapper and card-fallback tests |
| AC-R1 (full checks) | Not met, because of a pre-existing issue | Everything passes except `pnpm audit --audit-level=high` (brace-expansion, lockfile unchanged) |

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `apps/web/src/app/globals.css`, `globals.test.ts`, `page.tsx`, `page.module.css`, `cart/` + `checkout/page.module.css`, `layout.tsx` | Phase 1: tokens, shell | yes |
| `apps/web/src/app/error.tsx`, `loading.tsx` (headings) | Phase 1: branding consistency (reported) | yes, as a small judgement call |
| `apps/web/src/components/nav/*`, `home/*`, `brand/*`, `lib/brand.ts` | Phase 1: header, hero, band, placeholder brand | yes |
| `apps/web/src/components/menu/*`, `lib/menu/diet.ts(+test)` | Phase 1: rail, card, list, Veg chips, search | yes |
| `apps/web/src/components/cart/*`, `checkout/*.module.css`, `chat/`, `voice/`, `dev/` `*.module.css` | Phase 1: restyle to tokens | yes |
| `apps/web/src/lib/money.ts(+test)`, `$`→`₹` in 8 test files | Phase 1: OQ3, INR | yes |
| `apps/web/src/lib/menu/featured.ts(+test)`, `public/menu/*.svg`, Phase 2 edits to card, rail and list | Phase 2: presentation fields in the web | yes |
| `packages/contracts/api-contracts/src/{menu,index}.ts`, `menu.test.ts`, `schema/menu.v1.json` | Phase 2: contract | yes |
| `apps/commerce-api/src/database/{database.schema,menu-seed}.ts`, `migrations/{index,0002_menu_presentation}.ts`, `cli/seed.ts` | Phase 2: migration, seed | yes |
| `apps/commerce-api/src/modules/menu/{domain/menu.types,menu.mapper,infrastructure/postgres-menu.repository}.ts` | Phase 2: mapping | yes |
| `apps/commerce-api/src/modules/menu/infrastructure/demo-menu.seed.ts(+test)` | Phase 2: scope change, option A | yes (approved) |
| commerce-api `*.db.test.ts` edits, `menu.mapper.test.ts` | Phase 2: tests for the new schema | yes |
| `apps/ai-service/ai_service/contracts/api_contracts.py` (generated), `tests/test_commerce_client.py`, `tests/test_generated_contracts.py` | Phase 2: regenerated models | yes |
| `docs/api/commerce-api.md`, `docs/development/getting-started.md` | Docs the work made wrong | yes |
| `docs/features/mcdelivery-redesign/*` | Plan documents | yes |

Nothing is unattributable. The `MenuSearch` placeholder text ("Search
here") and the `metadata.description` wording are cosmetic Phase 1
branding.

## Not reviewed

- **Mobile layout in a real browser.** The 375px home page and landscape
  were not exercised (#2). jsdom cannot test fixed or sticky overlap or
  focus obscuring.
- **Keyboard walk-through and screen-reader pass.** Not done, and no
  Lighthouse accessibility audit was run (test-plan manual step 7).
- **Demo menu in the running app.** The local database still holds the
  old menu, and switching needs the one-time reset that destroys local
  carts and orders, which has not been approved. The `db:seed` CLI on a
  fresh database has not been run.
- **Web proxy traversal live probe** (test-plan manual step 8). Not re-run.
  Phases 1–2 did not touch `middleware.ts` or `next.config.ts`.
- **Phases 3–5.** Not implemented, and pending your re-confirmation (OQ8).
- **Specialised reviews** flagged by the plan (security, data/migration,
  accessibility). This review covered them only as far as the checklist
  goes. A dedicated human or agent review has not been performed.

## Fixes applied (2026-09-30, after review)

The human approved fixing findings 1–4 ("yes go ahead"). For #3 the
implementer chose the "clear the chips" option, which was not specified.
Findings 5–14 are unchanged: #5 is handled only by the runbook note below,
and the rest are deferred or noted.

| # | Outcome | What changed | Verified by |
| - | ------- | ------------ | ----------- |
| 1 | Fixed | `HeroBanner.module.css` eyebrow uses `--color-on-brand` (5.27:1). `globals.test.ts` now computes WCAG ratios for 8 token text pairs, and fails if brand-yellow text returns to the red hero. | `pnpm --filter web test` |
| 2 | Fixed | One `--cart-bar-height` token drives the bar's `min-height` and the page's bottom padding. `html` has `scroll-padding-top` (header) and, on narrow screens, `scroll-padding-bottom` (bar). The rail is no longer sticky on narrow screens. The detail sheet is anchored under the header, capped at `min(55vh, 100dvh − header − bar − gap)`, and scrolls inside itself. | Browser (Chrome DevTools, commerce-api + web dev): at 375×667 none of 22 focusable main controls is under the header or bar after focus, and the sheet (80–343px) is clear of the bar (603px). At 667×375 landscape the sheet (80–286px) is clear of the bar (311px), scrolls internally, and there is no horizontal scroll. |
| 3 | Fixed (option chosen: clear the chips) | The chip state moved from `MenuList` local state into `uiStore` (`dietFilter`, `featureFilter`). `commandToUiAction` marks `ShowMenuCategory`, `HighlightItem` and `SearchMenu` actions `clearMenuFilters: true`, and the reducer then clears both chips. The customer's own category taps and typing keep them. 4 `dispatch.test.ts` assertions gained the flag. New `lib/state/uiStore.test.ts`. | `pnpm --filter web test` |
| 4 | Fixed | `production-runbook.md` and `production-readiness-checklist.md` now describe the demo seed, the never-deletes collision and how to clear it, and the deploy order (all services, then seed; this also covers #5). `cli/seed.ts` maps `23505` on `menu_categories_position_key` to a readable message. | `pnpm --filter commerce-api db:seed` against the dev database, which still has the old menu, printed "Seeding failed: an earlier menu's categories already hold these positions … Nothing was written." Row counts before and after: 3 categories, 6 items. |

Checks after the fixes: `TURBO_FORCE=true pnpm turbo run typecheck lint
test --filter=web --filter=commerce-api` passed (12/12 tasks; web 583,
commerce-api 379), and `pnpm --filter commerce-api test:db` passed (118).
This was a targeted run of the two touched packages, not a full
`/validate`.

Remaining gaps are unchanged: no Lighthouse or screen-reader pass, and the
demo menu is not shown in the running app because the local reset has not
been approved.
