# Requirements — Phase 2: Frontend Menu Browsing

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-14 (in conversation)
**Risk:** MEDIUM
**Path:** Standard

## Problem

The approved Phase 1 MVP (`docs/product/food-ordering-frontend-mvp.md`) is
fully delivered — all six of its in-scope capabilities shipped and passed
review. Two things are missing before more frontend work should land on top
of it: an async seam between components and their data (every menu component
currently imports the fixture directly, which `commerce-api` would have to
rewrite piece by piece), and the six follow-up items recorded at Phase 1's
final review. The requested deeper browsing experience (search, item detail)
also does not exist in any approved document and needs to be recorded before
it is built.

## Goal

A menu-browsing frontend with real loading/error/empty/no-results states,
search combined with category filtering, an item detail view reachable by
both touch and agent command, and a codebase where exactly one module knows
how menu data is fetched.

## In scope

- Phase 1 follow-ups: `CategoryFilter` ARIA mismatch, `CartLine` missing
  accessible name, `page.module.css`/`page.tsx` CSS-DOM selector mismatch,
  `CartLine.tsx` split import, `turbo.json` typecheck/build race.
- Component test infrastructure: jsdom + React Testing Library.
- Async menu source (`getMenu()`) as the single fixture-import point.
- Loading (`loading.tsx`) and error (`error.tsx`) states, App Router native.
- Menu components refactored to take data via props, not fixture imports.
- Search/filter within the existing single-restaurant menu.
- Inline (non-modal) item detail panel.
- Richer, **display-only** fixture fields (dietary tags, allergens, calories,
  longer description) and more items.
- Two new UI commands: `ShowItemDetail`, `SearchMenu`.
- Documentation updates: `food-ordering-frontend-mvp.md`,
  `getting-started.md`, new ADRs in `architecture-decisions.md`.

## Out of scope

- **Restaurant discovery or any `Restaurant` entity.** Explicit human
  decision, 2026-09-14 — stays single-restaurant. Not deferred, declined.
- **Modifiers, variants, combos, or any price-affecting cart-line structure.**
  Would deepen the authority-model violation `food-ordering-frontend-mvp.md`
  §7 already flags as temporary; making it bigger right before
  `commerce-api` arrives is backwards.
- Routing / deep-linkable item URLs — detail view is an inline panel.
- Python AI, voice (any form), NestJS, database, authentication, payments,
  real cart persistence, real order creation, production infrastructure,
  backend integration — unchanged from Phase 1's exclusions.
- Zod → JSON Schema → Pydantic codegen (ADR-0003) for the two new commands —
  still no Python consumer.

## Acceptance criteria

- [x] AC1: All Phase 1 acceptance criteria (AC1–AC10) still pass after the
      props refactor (regression).
- [x] AC2: `CategoryFilter` no longer combines `role="tablist"` with
      `aria-pressed`.
- [x] AC3: Each `CartLine` remove button has an accessible name that
      identifies which item it removes.
- [x] AC4: `.layout`'s CSS selector in `page.module.css` matches every
      element it is meant to size.
- [x] AC5: `pnpm turbo run typecheck` passes reliably from a clean `.next`
      directory (the sub-phase 1.4 race is resolved).
- [x] AC6: `apps/web/src/lib/menu/menuSource.ts` is the only module in
      `apps/web` that imports `lib/fixtures/menu.ts`.
- [x] AC7: A loading state renders before menu data resolves.
- [x] AC8: A rejected `getMenu()` renders `error.tsx` with a retry affordance
      and does not crash the component tree.
- [x] AC9: Typing in search narrows the visible items; an active category
      filter and a search query combine with AND semantics.
- [x] AC10: A search with zero matches shows a no-results state, distinct
      from an empty-category state.
- [x] AC11: Tapping a menu item card opens the detail panel showing that
      item's enriched fields (dietary tags, allergens, calories, long
      description).
- [x] AC12: A valid `ShowItemDetail` command opens the detail panel for the
      named item; a valid `SearchMenu` command sets the search query.
- [x] AC13: A malformed `ShowItemDetail` or `SearchMenu` payload is rejected
      and logged, and changes no UI state.
- [x] AC14: `AddToCart` is still rejected by `packages/contracts/ui-commands`
      (boundary regression).
- [x] AC15: `dispatch.ts` still has no import referencing `cartStore`
      (boundary regression, same test pattern as Phase 1 AC8).
- [x] AC16: Component tests exist covering the loading state, the
      no-results state, and detail-panel rendering.
- [x] AC17: `food-ordering-frontend-mvp.md` reflects the expanded scope, and
      `getting-started.md` lists real, verified commands with no stale rows.
- [x] AC18: `pnpm turbo run typecheck lint test build` all exit 0.

AC13, AC14, and AC15 are the boundary-regression criteria — worth failing the
phase over, same standard Phase 1 set for AC4/AC5/AC8.

## Decisions taken at approval

| # | Decision | Effect |
| - | -------- | ------ |
| A | No restaurant entity — single-restaurant scope stands | Rejected, not deferred; recorded so it isn't re-proposed without a fresh decision |
| B | Phase 1 follow-ups fold into Phase 2 (sub-phase 2.1) rather than a separate cleanup phase | Sub-phase 2.1 is follow-ups + test infra + docs before any new feature code |
| C | Async seam (`getMenu()`) is in scope, not deferred | Chosen specifically so `commerce-api` integration later touches one module, not every menu component |

## Open questions

- Whether `getMenu()` should simulate latency by default (a `setTimeout`) so
  the loading state is exercised in normal manual testing, or stay
  synchronous-under-the-hood so tests run fast. Leaning toward no artificial
  delay by default, with the loading state proven by test-forced async
  timing rather than a real delay — to be confirmed in sub-phase 2.2.
- Whether `@testing-library/react` has full React 19 support at the version
  pnpm resolves. Unverified assumption, to be confirmed at the start of
  sub-phase 2.1 before other 2.1 work proceeds.
