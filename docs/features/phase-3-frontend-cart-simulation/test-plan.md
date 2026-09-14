# Test Plan — Phase 3: Frontend Cart Simulation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --------------------- | ------------------- | ---- |
| AC1 — add new item creates line at qty 1 | `cartStore.test.ts` | automated |
| AC2 — re-add increments, no duplicate line | `cartStore.test.ts` | automated |
| AC3 — "+" increases by exactly 1 | `QuantityStepper.test.tsx` | automated |
| AC4 — "−" decreases by exactly 1, never below 1 | `cartStore.test.ts` (reducer floor) + `QuantityStepper.test.tsx` (control) | automated |
| AC5 — "−" disabled at quantity 1 | `QuantityStepper.test.tsx` | automated |
| AC6 — "+" disabled at 99; `ADD_ITEM` at 99 is a no-op | `cartStore.test.ts` (reducer) + `QuantityStepper.test.tsx` (control) | automated |
| AC7 — Remove deletes whole line regardless of quantity | `CartLine.test.tsx` | automated |
| AC8 — item count is sum of quantities | `pricing.test.ts` | automated |
| AC9 — line subtotal = priceCents × quantity | `pricing.test.ts` | automated |
| AC10 — cart subtotal = sum of line subtotals | `pricing.test.ts` | automated |
| AC11 — `/cart` renders every line with name, qty, subtotal, controls | `CartList.test.tsx` | automated |
| AC12 — empty state + link to menu, no totals/controls | `CartList.test.tsx` | automated |
| AC13 — state preserved across `/` → `/cart` → `/` | `cartStore.navigation.test.tsx` (provider survives a child swap) | automated (partial) + manual (real navigation, not yet performed) |
| AC14 — nav count updates on every mutation | `SiteNav.test.tsx` | automated |
| AC15 — quantity controls' accessible names include item name | `QuantityStepper.test.tsx` | automated |
| AC16 — cart changes announced in a polite live region | `CartAnnouncer.test.tsx` | automated |
| AC17 — full keyboard operability, tab order − → qty → + → Remove | component test (`user-event.tab()`) + manual | automated + manual |
| AC18 — usable at 375px, no horizontal overflow | manual | manual |
| AC19 — `/cart` has its own loading boundary, inherits root error boundary | manual + build output inspection | manual |
| AC20 — no `packages/contracts/` change; `dispatch.ts` still excludes `cartStore` | `grep` + diff review | automated (script) |
| AC21 — `menuSource.ts` remains the sole fixture importer | `grep -rl "fixtures/menu" apps/web/src` | automated (script) |
| AC22 — Phase 1/2 behaviour intact (5 UI commands, filter, search, detail) | full existing test suite + manual regression | automated + manual |
| AC23 — TEMPORARY comment on `cartStore.tsx` still accurate | manual diff review | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| add creates line at qty 1; re-add increments; no duplicate | AC1, AC2 | `apps/web/src/lib/state/cartStore.test.tsx` |
| decrement floors at 1; decrement on absent line is a no-op | AC4 | `apps/web/src/lib/state/cartStore.test.tsx` |
| add at cap (99) is a no-op | AC6 | `apps/web/src/lib/state/cartStore.test.tsx` |
| remove deletes regardless of quantity | AC7 | `apps/web/src/lib/state/cartStore.test.tsx` |
| line subtotal, cart subtotal, item count — incl. zero-line and unresolvable-item boundaries | AC8, AC9, AC10 | `apps/web/src/lib/cart/pricing.test.ts` |
| "+"/"−" click behaviour, disabled at 1 and at 99, accessible names | AC3, AC5, AC6, AC15 | `apps/web/src/components/cart/QuantityStepper.test.tsx` |
| tab order within a line: − → qty → + → Remove | AC17 | `apps/web/src/components/cart/QuantityStepper.test.tsx` |
| Remove button still names the item (regression from Phase 1 AC3) | AC7, AC15 | `apps/web/src/components/cart/CartLine.test.tsx` |
| empty state renders link to `/`, no totals/controls; non-empty renders every line | AC11, AC12 | `apps/web/src/components/cart/CartList.test.tsx` |
| nav shows "Menu"/"Cart (n)", count updates, `aria-current` on active route | AC14 | `apps/web/src/components/nav/SiteNav.test.tsx` |
| announces after a cart mutation, polite not assertive | AC16 | `apps/web/src/components/cart/CartAnnouncer.test.tsx` |
| `CartProvider` keeps its state when its child is swapped (route-swap simulation) | AC13 (partial) | `apps/web/src/lib/state/cartStore.navigation.test.tsx` |
| `dispatch.ts` has no import referencing `cartStore` (regression) | AC20 | existing `apps/web/src/lib/commands/dispatch.test.ts`, re-asserted unchanged |

## Validation commands

All exist already; no new commands introduced.

| Check | Command | Expected |
| ----- | ------- | -------- |
| install | `pnpm install` | executed once if lockfile changes |
| types | `pnpm turbo run typecheck` | PASS |
| lint | `pnpm turbo run lint` | PASS |
| test | `pnpm turbo run test` | PASS — 70 existing + new cart tests |
| build | `pnpm turbo run build` | PASS, including `/cart` prerender |

| Check | Status | Reason |
| ----- | ------ | ------ |
| format | NOT_CONFIGURED | no formatter declared in the repo |
| e2e / cross-browser | NOT_APPLICABLE | no framework configured; existing MEDIUM follow-up from Phase 2 |
| automated a11y scan | SKIPPED | no axe/Lighthouse configured; manual a11y-tree review substitutes |

Targeted per sub-phase (3.1–3.4); full validation set run before 3.5's
`/review`.

## Manual checks

1. `pnpm --filter web dev`; add an item from the menu; confirm the compact
   cart summary and nav count update immediately.
2. Add the same item again from the menu; confirm the existing line's
   quantity increments rather than a second line appearing.
3. Open `/cart`; use "+"/"−" on a line; confirm subtotal, cart subtotal, and
   nav count all update; confirm "−" disables at quantity 1.
4. Increase a line to 99; confirm "+" disables and further clicks are inert.
5. Remove a line; confirm it disappears and totals/count update; remove the
   last line and confirm the empty state (with a link back to `/`) replaces
   the list.
6. From `/cart`, click "Menu" in the nav, add a different item, click "Cart"
   in the nav; confirm every prior line and quantity is still present
   (AC13 — the one criterion automated tests can only partially cover).
7. Operate an entire cart line — decrease, quantity, increase, remove — using
   only the keyboard; confirm the tab order and that focus is never lost.
8. Turn on a screen reader (or read the accessibility tree) and confirm each
   quantity/remove button announces which item it acts on, and that a cart
   change is announced once, politely, not urgently.
9. Resize to 375 / 768 / 1280px; confirm no horizontal overflow and that cart
   lines stack sensibly at 375px.
10. Re-run the full Phase 1/2 manual regression: category filter, search AND
    semantics, item detail panel, all five UI commands via chat (including
    the adversarial malformed/unknown-command phrases), and the command log.
11. `rm -rf apps/web/.next && pnpm turbo run typecheck` — confirm the
    Phase 2 turbo race fix still holds after the provider hoist.

## Not covered

- No end-to-end browser automation framework (unchanged Playwright-shaped
  gap from Phase 1/2) — manual checks via Chrome DevTools MCP stand in.
- No automated accessibility scanner (axe/Lighthouse) — accessibility ACs
  are verified by targeted RTL queries and manual a11y-tree review, not a
  general audit.
- No color-contrast measurement.
- No cross-browser testing — Chromium only.
- No test proves cart state survives an actual full-page reload — out of
  scope by design (no persistence in this phase).
- No automated test drives the real Next.js client-side router across a
  route change (RTL does not run it); AC13 relies on a layout-level
  structural test plus a manual browser check, reported as manual.

## Results (as of Phase 3.5, 2026-09-14)

**Validation commands — executed, full set, at the end of every sub-phase
(3.2–3.5) and once more here:**

| Check | Command | Result |
| ----- | ------- | ------ |
| Type check | `pnpm turbo run typecheck` | **PASS** |
| Lint | `pnpm turbo run lint` | **PASS** |
| Test | `pnpm turbo run test` | **PASS** — 100 total (16 contracts + 84 web), up from 70 before Phase 3 |
| Build | `pnpm turbo run build` | **PASS** — `/`, `/cart`, `/_not-found` all prerender statically |
| Format | — | `NOT_CONFIGURED` (unchanged) |
| E2E / cross-browser | — | `NOT_APPLICABLE` (unchanged, existing MEDIUM follow-up from Phase 2) |
| Automated a11y scan | — | `SKIPPED` (unchanged, no scanner configured) |

**Acceptance criteria status:**

- AC1–AC12, AC14–AC16, AC22–AC23: verified by the automated suite listed
  above (each maps to a specific test file per the tables in this document).
- AC20 (`dispatch.ts` still excludes `cartStore`; no `packages/contracts/`
  change): confirmed by `grep -n "cartStore" apps/web/src/lib/commands/dispatch.ts`
  (no match) and `git status --porcelain packages/contracts/` (empty).
- AC21 (`menuSource.ts` remains the sole *runtime* fixture importer):
  confirmed by grepping non-type-only imports of `fixtures/menu` across
  `apps/web/src` — only `menuSource.ts` matches; every other match found by
  a naive grep (`CartPanel.tsx`, `CartList.tsx`, `CartLine.tsx`,
  `MenuItemCard.tsx`, `MenuList.tsx`, `CategoryFilter.tsx`,
  `ItemDetailPanel.tsx`, `filter.ts`, `pricing.ts`) is a type-only import of
  `MenuItem`/`MenuCategory`, which the Phase 2 AC6 precedent already
  established as not a violation (erased at compile time, no runtime
  dependency on the fixture).
- AC13 (state preserved across `/` → `/cart` → `/`): the automated half is
  covered — `cartStore.navigation.test.tsx` proves `CartProvider` retains
  its state when its child tree is swapped, which is the mechanism the
  provider hoist in `app/layout.tsx` relies on. **The manual half — actually
  clicking through `/` → `/cart` → `/` in a real browser — was not
  performed.**
- AC17 (keyboard operability): the automated half (DOM tab order) is
  covered by `QuantityStepper.test.tsx` and `CartLine.test.tsx`. **The
  manual half (real focus visibility, real screen reader behavior) was not
  performed.**
- AC18 (usable at 375px, no horizontal overflow) and AC19 (loading/error
  boundaries behave correctly in a live browser): **manual checks not
  performed.**

**Why the manual checks did not run:** the Chrome browser automation tool
(`mcp__claude-in-chrome__*`) was unavailable for the entire implementation
of Phase 3 — `tabs_context_mcp` returned "Browser extension is not
connected" on every attempt (checked at the end of sub-phases 3.2, 3.3, and
3.4). In its place, server-rendered HTML was inspected via `curl` to confirm
structural correctness (nav present, correct headings per route, empty-cart
copy, `aria-live="polite"` region present) on both `/` and `/cart`. This
substitutes for confirming markup exists, not for confirming interactive or
visual behavior. Per `.claude/rules/validation.md`, this is reported as
manual checks **not executed**, not as a pass.

**Recommendation:** before this feature is treated as fully verified (in
particular before `/review` or `/final-review` sign off on it), perform the
manual checks in this document's "Manual checks" section against a running
`pnpm --filter web dev` — items 1–10 specifically, since item 11 (the turbo
race check) was re-verified as part of the automated `typecheck` runs above.
