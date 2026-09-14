# Test Plan — Phase 2: Frontend Menu Browsing

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --------------------- | ------------------- | ---- |
| AC1 (Phase 1 regression) | Re-run Phase 1's full test suite + manual browser journeys after the 2.2 props refactor | automated + manual |
| AC2 — ARIA fix | `CategoryFilter` RTL test asserts no `role="tablist"`, buttons expose `aria-pressed` | automated |
| AC3 — accessible remove name | `CartLine` RTL test queries by accessible name including the item name | automated |
| AC4 — CSS/DOM selector fix | Manual read of `page.module.css`/`page.tsx` after fix; visual check at 390/800/1280px | manual |
| AC5 — turbo race fix | `rm -rf apps/web/.next && pnpm turbo run typecheck` run standalone, twice | manual |
| AC6 — single fixture-import point | `grep -rl "fixtures/menu" apps/web/src` returns only `menuSource.ts` | automated (script) |
| AC7 — loading state | `menuSource.test.ts` / component test forces a pending promise, asserts `loading.tsx` content renders first | automated |
| AC8 — error state | Component test forces `getMenu()` rejection, asserts `error.tsx` renders with retry, no crash | automated |
| AC9 — search + category AND | `filter.test.ts`: category only, query only, both combined, neither | automated |
| AC10 — no-results state | `MenuList.test.tsx` with a query matching nothing | automated |
| AC11 — detail panel on tap | `ItemDetailPanel.test.tsx` + `MenuItemCard` interaction test (RTL `user-event`) | automated |
| AC12 — ShowItemDetail / SearchMenu accepted | `commands.test.ts`, `dispatch.test.ts` | automated |
| AC13 — malformed payloads rejected | `commands.test.ts`, `dispatch.test.ts` — missing/wrong-typed fields | automated |
| AC14 — AddToCart still rejected | `commands.test.ts` regression case (same as Phase 1) | automated |
| AC15 — dispatch.ts still has no cartStore import | `dispatch.test.ts` regression case (same pattern as Phase 1 AC8) | automated |
| AC16 — component test coverage exists | Enumerate test files in the report | automated (inventory) |
| AC17 — docs updated | Manual read of both files against actual command/layout state | manual |
| AC18 — full validation clean | `pnpm turbo run typecheck lint test build` | automated |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| rejects `role="tablist"` regression, asserts button group semantics | AC2 | `apps/web/src/components/menu/CategoryFilter.test.tsx` |
| remove button accessible name includes item name | AC3 | `apps/web/src/components/cart/CartLine.test.tsx` |
| `getMenu()` resolves the fixture data | AC6 | `apps/web/src/lib/menu/menuSource.test.ts` |
| loading state renders before resolution | AC7 | `apps/web/src/lib/menu/menuSource.test.ts` or a page-level test |
| error state renders on rejection, no crash | AC8 | component test against `error.tsx`/an error-throwing fixture |
| filter: category only, query only, both, neither | AC9 | `apps/web/src/lib/menu/filter.test.ts` |
| no-results state distinct from empty-category | AC10 | `apps/web/src/components/menu/MenuList.test.tsx` |
| tapping a card opens detail panel with enriched fields | AC11 | `apps/web/src/components/menu/ItemDetailPanel.test.tsx` |
| `ShowItemDetail` / `SearchMenu` accept valid payloads | AC12 | `packages/contracts/ui-commands/src/commands.test.ts` |
| both reject malformed payloads, never throw | AC13 | `packages/contracts/ui-commands/src/commands.test.ts` |
| `AddToCart` still rejected (regression) | AC14 | `packages/contracts/ui-commands/src/commands.test.ts` |
| `dispatch.ts` import lines still exclude `cartStore` (regression) | AC15 | `apps/web/src/lib/commands/dispatch.test.ts` |
| `ShowItemDetail`/`SearchMenu` map to correct uiStore actions | AC12 | `apps/web/src/lib/commands/dispatch.test.ts` |

## Validation commands

All exist already from Phase 1; no new commands introduced.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| format | — | `NOT_CONFIGURED` (unchanged from Phase 1) |
| lint   | `pnpm turbo run lint` | PASS |
| types  | `pnpm turbo run typecheck` | PASS |
| test   | `pnpm turbo run test` | PASS |
| build  | `pnpm turbo run build` | PASS |

Targeted per sub-phase; full run before the phase's final review.

## Manual checks

1. `pnpm --filter web dev`; confirm menu loads with a brief loading state
   visible (or confirm via test-forced timing if no real delay is added).
2. Type a search query; confirm results narrow; confirm combining with a
   category filter narrows further (AND).
3. Search for something with no matches; confirm the no-results state, not
   a blank list.
4. Tap a menu item; confirm the detail panel opens with dietary
   tags/allergens/calories/long description.
5. Via chat: trigger `ShowItemDetail` and `SearchMenu`; confirm both have a
   visible effect (the Phase 1 HIGH-finding standard — no command that
   claims an effect without one).
6. Via chat: trigger the adversarial malformed/unknown-command phrases;
   confirm rejection + logging still work for the full command set (3 old +
   2 new).
7. Resize to 390 / 800 / 1280px; confirm no overflow, confirm the
   `.layout` fix produces the intended two-column behaviour at 800px+.
8. `rm -rf apps/web/.next && pnpm turbo run typecheck` — confirm it passes
   standalone (the race fix).

## Not covered

- No end-to-end browser automation framework (still Playwright-shaped gap
  from Phase 1) — manual checks via Chrome DevTools MCP stand in.
- No automated accessibility scanner (axe/Lighthouse) — AC2/AC3 are verified
  by targeted RTL queries for the specific defects found, not a general
  audit.
- No color-contrast measurement.
- No cross-browser testing — Chromium only.
- No test proves a real AI model would produce `ShowItemDetail`/`SearchMenu`
  output matching the schema — `simulate.ts` remains a hardcoded stand-in.
