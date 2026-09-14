# Phase 2: Frontend Menu Browsing — search, item detail, real loading/error states

## Problem

The approved Phase 1 MVP was fully delivered, but two things needed to happen
before more frontend work landed on top of it: every menu component imported
the fixture data directly, so `commerce-api` integration would later mean
rewriting each of them one at a time; and Phase 1's final review left six
follow-up items open (two accessibility defects, a CSS/DOM selector mismatch,
a split import, a flaky `turbo` typecheck/build race, and no component-test
infrastructure). Separately, the requested deeper browsing experience
(search, item detail) existed in no approved document and needed to be
recorded before being built — see `ADR-0009` for the explicit decision to
keep this single-restaurant rather than add restaurant discovery.

## Solution

Four sub-phases, each leaving the app working:

1. Close every Phase 1 follow-up and stand up jsdom + React Testing Library,
   before any new feature code exists to inherit the debt.
2. Introduce `getMenu()` as the single async seam between `apps/web` and the
   menu fixture, with real `loading.tsx`/`error.tsx` states, and refactor
   existing components to take menu data via props instead of importing the
   fixture directly.
3. Add search, combined with the existing category filter via AND semantics,
   with a no-results state that's distinguishable from a structurally empty
   category.
4. Add an inline (non-modal) item-detail panel reachable by touch and by two
   new UI commands (`ShowItemDetail`, `SearchMenu`), following the exact
   validated-command pattern Phase 1 established.

A `/review` pass afterward found three MEDIUM and two LOW findings (no
BLOCKER or HIGH); all five are fixed in this PR — see Known limitations for
the one NOTE-severity item deliberately left open.

## Implementation summary

- **2.1 — Foundation:** fixed `CategoryFilter`'s ARIA role mismatch, gave
  `CartLine`'s remove button an accessible name, fixed a CSS selector that
  only matched one of two flex columns, merged a split import, fixed a
  `turbo.json` task-ordering race, and added jsdom/RTL test infrastructure
  (which itself surfaced and fixed three environment bugs: a JSX transform
  mismatch, a `jsdom`-vs-`file://` URL conflict, and missing RTL cleanup).
- **2.2 — Async seam:** `menuSource.ts` (`getMenu()`) as the sole
  fixture-import point; `page.tsx` became an async Server Component;
  `loading.tsx`/`error.tsx` added and live-verified by temporarily forcing
  both a rejection and a delay; `CategoryFilter`/`MenuList`/`MenuItemCard`/
  `cartStore` refactored to receive menu data via props.
- **2.3 — Search and filtering:** `filter.ts` (pure, category+query, AND
  semantics), `MenuSearch.tsx`, `uiStore.searchQuery`, and a no-results state
  distinct from the empty-category state — both live-verified.
- **2.4 — Item detail + new commands:** fixture enriched with dietary tags,
  allergens, calories, and long descriptions; `ItemDetailPanel.tsx`;
  `ShowItemDetail`/`SearchMenu` schemas and their `dispatch.ts` mappings;
  live-verified via both touch and chat.
- **Post-review fixes:** `ChatInput`'s outcome-message lookup made
  compiler-exhaustive over every `UiAction` type (this exact bug class had
  already shipped twice); the item-detail button given a proper accessible
  name; a real click-through integration test added for the touch path.

## Changed files

| File | Change | Why |
| ---- | ------ | --- |
| `packages/contracts/ui-commands/src/commands.ts`, `commands.test.ts`, `index.ts` | modified | + `ShowItemDetail`, `SearchMenu` schemas and tests |
| `apps/web/src/lib/commands/dispatch.ts`, `dispatch.test.ts` | modified | Map both new commands to `uiStore` actions |
| `apps/web/src/lib/commands/simulate.ts` | modified | Trigger phrases for both new commands |
| `apps/web/src/components/chat/ChatInput.tsx` | modified | Outcome-message cases for both new commands; made exhaustive post-review |
| `apps/web/src/lib/state/uiStore.tsx` | modified | + `searchQuery`, `detailItemId`, their actions |
| `apps/web/src/lib/fixtures/menu.ts` | modified | + `longDescription`, `dietaryTags`, `allergens`, `calories` (display-only) |
| `apps/web/src/lib/menu/menuSource.ts`, `menuSource.test.ts` | new | `getMenu()` — the sole fixture-import point |
| `apps/web/src/lib/menu/filter.ts`, `filter.test.ts` | new | Pure category+query filter, AND semantics |
| `apps/web/src/app/page.tsx` | modified | Async Server Component; fetches via `getMenu()`, passes props down |
| `apps/web/src/app/loading.tsx`, `loading.test.tsx` | new | Suspense fallback |
| `apps/web/src/app/error.tsx`, `error.test.tsx` | new | Error boundary with retry |
| `apps/web/src/app/page.module.css` | modified | Fixed `.layout` selector to match both flex columns |
| `apps/web/src/components/menu/CategoryFilter.tsx`, `.test.tsx` | modified/new | Props instead of fixture import; dropped invalid `role="tablist"` |
| `apps/web/src/components/menu/MenuList.tsx`, `.test.tsx` | modified/new | Props + `filter.ts`; no-results / empty-category states; click-through integration test |
| `apps/web/src/components/menu/MenuItemCard.tsx`, `.module.css` | modified | Tap-to-open detail panel; accessible name for the details button |
| `apps/web/src/components/menu/MenuSearch.tsx`, `.module.css`, `.test.tsx` | new | Search input bound to `uiStore.searchQuery` |
| `apps/web/src/components/menu/ItemDetailPanel.tsx`, `.module.css`, `.test.tsx` | new | Inline, non-modal item detail view |
| `apps/web/src/components/cart/CartLine.tsx`, `.test.tsx` | modified/new | Accessible remove-button name; merged split import; price lookup now via props, not the fixture |
| `apps/web/src/lib/state/cartStore.tsx`, `cartStore.test.ts` | modified | Takes resolved menu data via props instead of importing the fixture |
| `apps/web/vitest.config.ts`, `vitest.setup.ts` | modified/new | jsdom environment, RTL cleanup, JSX transform fix |
| `apps/web/package.json` | modified | + jsdom, `@testing-library/{react,jest-dom,user-event}` (dev only) |
| `turbo.json` | modified | `typecheck` now depends on the same package's own `build` |
| `docs/product/food-ordering-frontend-mvp.md` | modified | §9: expanded scope, no-restaurant decision |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0008 (Vitest, formally accepted), ADR-0009 (no restaurant) |
| `docs/development/getting-started.md` | modified | Real, verified commands and counts |
| `docs/features/phase-2-menu-browsing/{requirements,plan,test-plan}.md` | new | This phase's planning documents |

## Validation — executed

| Check | Command | Status | Evidence |
| ----- | ------- | ------ | -------- |
| Type check | `pnpm turbo run typecheck` (from a clean `apps/web/.next`) | PASS | Exit 0, run standalone twice to confirm the fixed `turbo.json` race |
| Lint | `pnpm turbo run lint` | PASS | Exit 0 |
| Test | `pnpm turbo run test` | PASS | 70/70 — 16 contracts + 54 web |
| Build | `pnpm turbo run build` | PASS | Exit 0; `/` statically prerendered |
| Live: Phase 1 regression | manual, Chrome DevTools MCP | PASS | Cart add, accessible remove name, `ShowMenuCategory` via chat all confirmed post-refactor |
| Live: search + category AND | manual, Chrome DevTools MCP | PASS | Desserts+"pizza" → correctly empty; Desserts+"espresso" → correctly narrows to Tiramisu |
| Live: error state | manual, Chrome DevTools MCP | PASS | `getMenu()` temporarily forced to throw; real error + working retry rendered, then reverted |
| Live: loading delay is real | `curl` timing | PASS | 8.03s response matched an artificial 8s delay, confirming the await genuinely blocks |
| Live: item detail (touch + both new commands) | manual, Chrome DevTools MCP | PASS | Tap-to-open, `ShowItemDetail`, and `SearchMenu` all confirmed with correct assistant text post-fix |
| Live: accessible name fix | manual, Chrome DevTools MCP | PASS | Every card now announces as "View details for {name}" |
| AC6 fixture-import boundary | `grep` over `apps/web/src` | PASS | Only `menuSource.ts` has a value import; all others are `import type` |

## Validation — not executed

| Check | Status | Why |
| ----- | ------ | --- |
| Format | `NOT_CONFIGURED` | No formatter declared in this repository (decided at Phase 1 planning) |
| End-to-end / cross-browser | `NOT_APPLICABLE` | No e2e framework in this repository; all live checks are manual, Chromium-only, via Chrome DevTools MCP |
| Automated accessibility scan | `SKIPPED` | No scanner (axe/Lighthouse) configured; a11y findings came from manual accessibility-tree review instead |
| Screenshot of `loading.tsx` mid-render | `SKIPPED` | Tool limitation — the available navigation calls wait for full page-load completion before returning control, so there is no window to screenshot the pending state; verified instead via component test + response-timing proof |

## Acceptance criteria

All 18 from `docs/features/phase-2-menu-browsing/requirements.md`:

- [x] AC1 — Phase 1 ACs still pass — verified by the 70-test suite (includes all Phase 1 suites) plus live regression checks
- [x] AC2 — `CategoryFilter` no longer uses `role="tablist"` — unit-tested and live-verified
- [x] AC3 — `CartLine` remove button has an accessible name — unit-tested and live-verified
- [x] AC4 — `.layout` selector matches both elements it sizes — confirmed by reading current `page.tsx`/`page.module.css`
- [x] AC5 — typecheck passes reliably from a clean `.next` — verified twice standalone
- [x] AC6 — `menuSource.ts` is the sole fixture-import point — `grep`-verified
- [x] AC7 — loading state renders before resolution — component-tested + timing-proven
- [x] AC8 — error state renders with retry, no crash — live-verified
- [x] AC9 — search + category combine with AND — 9 unit tests + live-verified
- [x] AC10 — no-results distinct from empty-category — both branches unit-tested, one live-verified
- [x] AC11 — tap opens detail panel with enriched fields — live-verified + real click-through integration test
- [x] AC12 — both new commands work via chat — unit-tested + live-verified
- [x] AC13 — malformed payloads rejected, logged, no state change — unit-tested at schema and dispatch level
- [x] AC14 — `AddToCart` still rejected — regression-tested
- [x] AC15 — `dispatch.ts` still has no `cartStore` import — regression-tested
- [x] AC16 — component tests cover loading, no-results, detail-panel — present, isolated and integrated
- [x] AC17 — docs reflect expanded scope with verified commands — updated
- [x] AC18 — full validation set exits 0 — confirmed

## Known limitations

- `.main`'s `max-width: 960px` leaves 928px of content width, but two
  `.column` elements at `flex-basis: 480px` plus the 32px gap need 992px —
  the two-column desktop layout can never actually appear at any viewport
  width, even though the CSS selector itself is now structurally correct
  (flagged in sub-phase 2.1, deliberately left open per explicit instruction
  during `/review`).
- `loading.tsx`'s live rendering during the pending window was never
  captured by screenshot — see Validation, not executed.
- All live verification is Chromium-only, via Chrome DevTools MCP; no
  cross-browser coverage exists anywhere in this project yet.
- No automated accessibility scanner; the two a11y findings this phase fixed
  were caught by manual accessibility-tree review, which may not be
  exhaustive.

## Follow-up work

- `FOLLOW-UP (not done): apps/web/src/app/page.module.css — fix the .main/.column arithmetic mismatch so the two-column layout can actually render — LOW`
- `FOLLOW-UP (not done): apps/web/src/components/menu/MenuItemCard.tsx — no test for keyboard-only tab order between the two sibling buttons — LOW`
- `FOLLOW-UP (not done): apps/web/src/components/menu/{ItemDetailPanel,MenuSearch}.tsx — untested at narrow/mobile viewport widths — LOW`
- `FOLLOW-UP (not done): repository-wide — no e2e/cross-browser test framework (e.g. Playwright) exists; all live verification this phase and Phase 1 was manual — MEDIUM`

## Risks

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Props refactor (2.2) regresses passing Phase 1 behaviour | Materialized, caught | Phase 1's AC set re-run as regression criteria; live-verified post-refactor |
| Async seam masks real async bugs `commerce-api` will surface later | Low, accepted | No artificial delay by default — the seam's *shape* is the point |
| New commands widen the eventual Zod→Pydantic codegen surface (ADR-0003) | Low | Both kept in the JSON-Schema-expressible Zod subset |
| Fixture enrichment quietly pre-commits the menu API shape | Medium, accepted | Display-only fields only; explicitly recorded as an input to `commerce-api` design, not a contract |
| Chat outcome-message bug class recurring on the next new command | Materialized once more, now closed | Switch replaced with a `Record<UiAction["type"], string>` — a missing case is now a compile error |

## Deployment considerations

None. No database, no environment variables, no feature flags, no
infrastructure changes — this phase is entirely `apps/web` frontend code
against local fixture data, with no backend to deploy alongside it.
