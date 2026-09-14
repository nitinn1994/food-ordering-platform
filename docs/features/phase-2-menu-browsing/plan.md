# Plan — Phase 2: Frontend Menu Browsing

**Approval Status:** APPROVED (nitin, 2026-09-14)

## Approach

Build outward from the foundation inward to the feature, same discipline as
Phase 1. Sub-phase 2.1 closes every debt Phase 1 left open — accessibility
findings, the CSS/DOM mismatch, the turbo race, and the missing test
infrastructure — before any new feature code exists to inherit them. 2.2
introduces the async seam and refactors existing components to consume it,
proven against the full existing Phase 1 acceptance-criteria set as a
regression check before anything new is layered on. 2.3 and 2.4 then add
search and detail view against a codebase that already has both the seam and
the test tooling to verify them properly — something Phase 1 structurally
could not do (no jsdom, no component rendering tests).

The two new commands (`ShowItemDetail`, `SearchMenu`) follow the exact
pattern `ShowMenuCategory`/`HighlightItem`/`OpenCartPanel` established:
Zod schema in `packages/contracts/ui-commands`, mapped to a `uiStore` action
in `dispatch.ts`, never touching `cartStore`.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `packages/contracts/ui-commands/src/commands.ts` | modified | + `ShowItemDetail`, `SearchMenu` schemas |
| `packages/contracts/ui-commands/src/commands.test.ts` | modified | Cover both; re-assert `AddToCart` still rejected |
| `apps/web/src/lib/commands/dispatch.ts` | modified | Map both to `uiStore` actions |
| `apps/web/src/lib/commands/dispatch.test.ts` | modified | Cover both; re-assert no `cartStore` import |
| `apps/web/src/lib/commands/simulate.ts` | modified | Trigger phrases for both |
| `apps/web/src/lib/state/uiStore.tsx` | modified | + `searchQuery`, `detailItemId` |
| `apps/web/src/lib/fixtures/menu.ts` | modified | + display-only fields, more items |
| `apps/web/src/lib/menu/menuSource.ts` | new | `getMenu()` — the only fixture import point |
| `apps/web/src/lib/menu/menuSource.test.ts` | new | |
| `apps/web/src/lib/menu/filter.ts` | new | Pure category+query filter, AND semantics |
| `apps/web/src/lib/menu/filter.test.ts` | new | |
| `apps/web/src/app/page.tsx` | modified | Async Server Component; fetches via `getMenu()`, passes props down |
| `apps/web/src/app/loading.tsx` | new | Suspense fallback |
| `apps/web/src/app/error.tsx` | new | Error boundary; closes Phase 1 NOTE |
| `apps/web/src/app/page.module.css` | modified | Fix `.layout > section` selector mismatch |
| `apps/web/src/components/menu/CategoryFilter.tsx` | modified | Props instead of fixture import; fix ARIA |
| `apps/web/src/components/menu/MenuList.tsx` | modified | Props instead of fixture import; applies `filter.ts` |
| `apps/web/src/components/menu/MenuItemCard.tsx` | modified | Tap opens detail panel |
| `apps/web/src/components/menu/MenuSearch.tsx` | new | + `.module.css` |
| `apps/web/src/components/menu/ItemDetailPanel.tsx` | new | + `.module.css` |
| `apps/web/src/components/menu/MenuList.test.tsx` | new | |
| `apps/web/src/components/menu/MenuSearch.test.tsx` | new | |
| `apps/web/src/components/menu/ItemDetailPanel.test.tsx` | new | |
| `apps/web/src/components/cart/CartLine.tsx` | modified | Accessible remove-button name; merge split import |
| `apps/web/src/components/chat/ChatInput.tsx` | modified | Not anticipated at planning time — `describeOutcome` needed cases for the two new commands, or their success would show a false failure message. Found and fixed during 2.4; added to this table retroactively per `/review`, 2026-09-14 |
| `apps/web/src/app/loading.test.tsx`, `apps/web/src/app/error.test.tsx` | new | Not individually listed at planning time, only implied by 2.2's "loading/error rendering" test item; added to this table retroactively per `/review`, 2026-09-14 |
| `apps/web/vitest.config.ts` | modified | jsdom environment, setup file |
| `apps/web/vitest.setup.ts` | new | RTL/jest-dom setup |
| `apps/web/package.json` | modified | + `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` (devDependencies) |
| `turbo.json` | modified | `typecheck` depends on the same package's own `build`, not just `^build` |
| `docs/product/food-ordering-frontend-mvp.md` | modified | Record expanded scope, the no-restaurant decision |
| `docs/development/getting-started.md` | modified | Real commands, updated layout |
| `docs/architecture/architecture-decisions.md` | modified | New ADRs (async seam, no-restaurant, detail-as-panel) |

## Phases

### Phase 2.1 — Foundation: follow-ups, test infrastructure, docs
- [ ] Verify `@testing-library/react` React 19 support (open question, requirements.md)
- [ ] Fix `CategoryFilter` ARIA (drop `role="tablist"`, keep `aria-pressed` button group)
- [ ] Fix `CartLine` remove-button accessible name
- [ ] Fix `page.module.css` `.layout > section` selector / `page.tsx` structure mismatch
- [ ] Merge `CartLine.tsx`'s split import
- [ ] Fix `turbo.json` typecheck/build race
- [ ] Add jsdom + RTL + jest-dom + user-event; `vitest.config.ts` + `vitest.setup.ts`
- [ ] One smoke test using RTL against an existing component, to prove the toolchain works before building on it
- [ ] Update `food-ordering-frontend-mvp.md` and `architecture-decisions.md` (no-restaurant ADR, scope note)
- **Done when:** all Phase 1 ACs re-pass (AC1 regression check), one RTL test runs green, full validation set exits 0.

### Phase 2.2 — Async seam + loading/error states
- [ ] `menuSource.ts` with `getMenu(): Promise<MenuCategory[]>`
- [ ] `page.tsx` becomes an async Server Component calling `getMenu()`
- [ ] `loading.tsx`, `error.tsx`
- [ ] Refactor `CategoryFilter`, `MenuList`, `MenuItemCard` to take menu data via props
- [ ] Tests: `menuSource.test.ts`, loading/error rendering
- **Done when:** AC6, AC7, AC8 hold; no component other than `menuSource.ts` imports the fixture (grep-verified); Phase 1 ACs still pass.

### Phase 2.3 — Search and filtering
- [ ] `filter.ts` — pure function, category + query, AND semantics
- [ ] `MenuSearch.tsx`; `uiStore.searchQuery`
- [ ] No-results state, distinct from empty-category state
- [ ] Tests: `filter.test.ts`, `MenuSearch.test.tsx`, `MenuList.test.tsx` (no-results)
- **Done when:** AC9, AC10 hold.

### Phase 2.4 — Item detail panel + new commands
- [ ] Enrich fixture: `longDescription`, `dietaryTags`, `allergens`, `calories`
- [ ] `ItemDetailPanel.tsx`; `uiStore.detailItemId`; tap-to-open on `MenuItemCard`
- [ ] `ShowItemDetail`, `SearchMenu` schemas in `packages/contracts/ui-commands`
- [ ] `dispatch.ts` mapping; `simulate.ts` trigger phrases
- [ ] `getting-started.md` final update
- [ ] Tests: `ItemDetailPanel.test.tsx`, contract tests for both new schemas, dispatch tests, AddToCart-still-rejected + no-cartStore-import regression tests
- **Done when:** AC11–AC15 hold; full validation set exits 0; live browser verification of both new commands (same method as Phase 1's HIGH-finding fix).

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ------------------ |
| Props refactor (2.2) regresses passing Phase 1 behaviour | High | Phase 1's full AC set re-run as regression criteria before 2.2 is considered done |
| Async seam is artificial, could mask real async bugs `commerce-api` will surface | Medium | No artificial delay by default — the *shape* of the seam is the point, not simulated latency; real latency arrives with the real API |
| New commands widen the eventual ADR-0003 codegen surface | Medium | Both kept in the JSON-Schema-expressible Zod subset — no refinements/transforms/branded types |
| jsdom + RTL are new dependencies | Low | devDependencies only; verified absent from the production build output |
| Detail panel accessibility | Medium | Deliberately non-modal (no focus trap / `aria-modal` surface to get wrong); RTL-tested for accessible names and roles |
| Fixture enrichment quietly pre-commits menu API shape | Medium | Display-only fields only; explicitly recorded as an input to `commerce-api` design, not a contract |
| Phase grows past 4 sub-phases | Medium | Modifiers/variants/restaurants held firmly out — if 2.3 or 2.4 reveal it needs splitting, stop and re-`/forge` |

## Assumptions

- `@testing-library/react` has adequate React 19 support at the version pnpm
  resolves — **unverified**, first check in sub-phase 2.1 before proceeding
  with the rest of that sub-phase.
- npm registry reachable for new devDependencies — verified true in Phase 1,
  assumed still true.
- Node v24.19.0 / pnpm 12.3.4 still installed — verified in Phase 1, not
  re-verified here unless install fails.

## Not doing

- Restaurant discovery or any `Restaurant` entity.
- Modifiers, variants, combos, or any price-affecting cart-line change.
- Routing / deep-linkable item detail URLs.
- Any backend, AI, voice, auth, payment, or infrastructure work.
- Zod → JSON Schema → Pydantic codegen for the two new commands.
- Committing, pushing, merging, or deploying.

## Specialised review needed?

Standard Path — informational only.

- security: no — no new input trust boundary beyond the existing validated
  UI-command allowlist, which both new commands go through identically.
- performance: no — fixture data, no queries, filtering is client-side over
  a small in-memory array.
- data / migration: no — no persistence.
