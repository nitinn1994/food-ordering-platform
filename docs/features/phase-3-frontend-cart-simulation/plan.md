# Plan — Phase 3: Frontend Cart Simulation

**Approval Status:** APPROVED (nitin, 2026-09-14)

## Approach

Isolate the one structurally risky change — hoisting `UiProvider`/
`CartProvider` from `app/page.tsx` to `app/layout.tsx` so cart state survives
navigation — into its own sub-phase, done alone, verified against the full
existing suite and a manual Phase 1/2 regression pass before any new cart UI
is built on top of it. Everything else (quantity domain rules, the `/cart`
view, accessibility/responsive polish) is additive and lower-risk, and is
sequenced after the hoist is proven stable.

The cart data model does not change (`CartLine`, `CartState`); only actions
and derived values grow. Pricing, previously computed inside `CartProvider`
from a `categories` prop, moves to pure functions in `lib/cart/pricing.ts` so
`CartProvider` can live in the layout without the layout needing to fetch
menu data. This mirrors the Phase 2 AC6 pattern (menu data flows down as a
prop from wherever `getMenu()` is awaited) rather than introducing a new one.

No UI command, contract, or `dispatch.ts` change is needed or made — cart
mutations are not business intents and must stay unreachable from the
validated-command pipeline (`system-architecture.md` §4.4).

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `apps/web/src/lib/cart/pricing.ts` | new | `lineSubtotalCents`, `cartSubtotalCents`, `cartItemCount`, `MAX_LINE_QUANTITY` |
| `apps/web/src/lib/cart/pricing.test.ts` | new | Pure function tests incl. boundaries |
| `apps/web/src/lib/state/cartStore.tsx` | modified | Drop `categories` prop, `totalCents`, `findItem`; add `DECREMENT_ITEM`, `itemCount`, quantity cap; update TEMPORARY comment |
| `apps/web/src/lib/state/cartStore.test.tsx` | new | Reducer tests: add, re-add, decrement floor, cap, remove |
| `apps/web/src/app/layout.tsx` | modified | Mount `UiProvider`, `CartProvider`, `SiteNav`, `CartAnnouncer` |
| `apps/web/src/app/page.tsx` | modified | Remove providers; keep `await getMenu()`; render `CartPanel` as summary |
| `apps/web/src/app/page.module.css` | modified | Accommodate the nav only — no unrelated layout rework |
| `apps/web/src/app/cart/page.tsx` | new | Cart route; Server Component; awaits `getMenu()` |
| `apps/web/src/app/cart/page.module.css` | new | Cart page layout, responsive |
| `apps/web/src/app/cart/loading.tsx` | new | Cart-shaped loading skeleton |
| `apps/web/src/components/nav/SiteNav.tsx` | new | "Menu" / "Cart (n)" links, `aria-current` |
| `apps/web/src/components/nav/SiteNav.test.tsx` | new | Count text, accessible name, `aria-current` |
| `apps/web/src/components/nav/SiteNav.module.css` | new | Nav styling, responsive |
| `apps/web/src/components/cart/CartAnnouncer.tsx` | new | `aria-live="polite"` region |
| `apps/web/src/components/cart/CartAnnouncer.test.tsx` | new | Announces on count change |
| `apps/web/src/components/cart/CartPanel.tsx` | modified | Becomes compact summary: count, subtotal, empty state, link to `/cart`; takes `categories` prop |
| `apps/web/src/components/cart/CartPanel.module.css` | modified | Summary styling |
| `apps/web/src/components/cart/CartList.tsx` | new | Resolves lines to items; renders list or empty state |
| `apps/web/src/components/cart/CartList.test.tsx` | new | Empty state, line rendering, ordering |
| `apps/web/src/components/cart/CartList.module.css` | new | List + empty-state styling |
| `apps/web/src/components/cart/CartLine.tsx` | modified | Takes resolved `item` prop; renders `QuantityStepper` + line subtotal |
| `apps/web/src/components/cart/CartLine.test.tsx` | modified | Updated for new props/controls |
| `apps/web/src/components/cart/CartLine.module.css` | modified | Room for stepper; responsive stacking |
| `apps/web/src/components/cart/CartTotal.tsx` | modified | Takes `totalCents: number` prop instead of reading context |
| `apps/web/src/components/cart/QuantityStepper.tsx` | new | − / qty / + control |
| `apps/web/src/components/cart/QuantityStepper.test.tsx` | new | Names, disabled at 1 and at cap, click behaviour |
| `apps/web/src/components/cart/QuantityStepper.module.css` | new | Stepper styling, ≥44px tap targets |
| `docs/product/food-ordering-frontend-mvp.md` | modified | New §10 "Phase 3 additions"; reaffirm §7 items 2–3 still temporary |
| `docs/development/getting-started.md` | modified | Current state, new route, verified commands |
| `docs/architecture/architecture-decisions.md` | modified | New ADR: cart route + provider placement in root layout + cart state decoupled from pricing |

Not modified: anything under `packages/contracts/`, `lib/commands/*`,
`lib/state/uiStore.tsx`, `lib/menu/*`, `lib/money.ts`, `lib/fixtures/menu.ts`,
and every `components/menu/*` file (including `MenuItemCard.tsx`, which
already calls `addItem` and needs no change).

## Phases

### Phase 3.1 — Cart domain layer (no UI change)
- [ ] `lib/cart/pricing.ts`: `lineSubtotalCents`, `cartSubtotalCents`,
      `cartItemCount`, `MAX_LINE_QUANTITY = 99`
- [ ] Extend `cartReducer` with `DECREMENT_ITEM` (floor at 1) and the
      quantity cap on `ADD_ITEM` (no-op at 99)
- [ ] `pricing.test.ts`, `cartStore.test.tsx`
- **Done when:** AC1, AC2, AC4 (reducer half), AC6 (reducer half), AC8, AC9,
  AC10 hold in pure/unit tests; provider/context shape is untouched so
  nothing else in the app compiles differently yet.

### Phase 3.2 — Provider hoist and navigation shell (isolated, highest risk)
- [ ] Move `UiProvider`/`CartProvider` from `page.tsx` to `layout.tsx`
- [ ] Decouple `CartProvider` from `categories` (drop the prop, `totalCents`,
      `findItem`; expose `lines`, `itemCount`, `addItem`, `decrementItem`,
      `removeItem`)
- [ ] Add `app/cart/page.tsx` (awaits `getMenu()`) and `app/cart/loading.tsx`
- [ ] Add `SiteNav`; wire into `layout.tsx`
- [ ] Update `page.tsx`, `CartPanel`, `CartLine`, `CartTotal` to the new
      provider shape — cart rendering stays functionally as it was in Phase 1
- [ ] Update `CartLine.test.tsx` for the new props
- **Done when:** full validation set passes; manual Phase 1/2 regression
  confirmed (category filter, search AND semantics, item detail, all five UI
  commands, command log). **Checkpoint — nothing in 3.3 starts until this
  regression pass is confirmed.**

### Phase 3.3 — Cart view and quantity controls
- [ ] `QuantityStepper.tsx`
- [ ] `CartList.tsx` (empty state vs. line list)
- [ ] Per-line subtotal on `CartLine`; cart subtotal via `CartTotal` on
      `/cart`
- [ ] Compact `CartPanel` summary on the menu page: count, subtotal, empty
      state, "View cart" link
- [ ] Tests: `QuantityStepper.test.tsx`, `CartList.test.tsx`, updated
      `CartLine.test.tsx`, `CartPanel` summary coverage
- **Done when:** AC3, AC5–AC7, AC11, AC12, AC14 hold; manual Flows A–F pass.

### Phase 3.4 — Feedback, responsive, accessibility
- [ ] `CartAnnouncer.tsx` (`aria-live="polite"`)
- [ ] Accessible names on all quantity/remove controls; correct `disabled`
      semantics (not `aria-disabled`)
- [ ] Tap targets ≥44×44px on stepper and remove controls
- [ ] Responsive CSS: cart line grid → stacked layout below ~480px
- [ ] Keyboard tab-order test within a cart line (− → qty → + → Remove)
- [ ] Short CSS transition on a changed line (no spinner — see test-plan)
- **Done when:** AC15–AC18 hold via tests + manual a11y-tree review + manual
  checks at 375/768/1280px.

### Phase 3.5 — Documentation
- [ ] `food-ordering-frontend-mvp.md` §10
- [ ] `getting-started.md` current-state and verified-commands update
- [ ] New ADR in `architecture-decisions.md`
- [ ] Finalize this feature's `test-plan.md` with actual results and any
      follow-ups
- **Done when:** AC19–AC23 hold; full validation set exits 0; `/review` can
  proceed.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ------------------ |
| Provider hoist (3.2) regresses Phase 1/2 behaviour | High | Done alone, immediately followed by the full suite and a manual regression pass before any cart UI work starts; nothing in 3.3 begins until confirmed |
| Routing reverses a written scope boundary (product doc §9 listed routing as out of scope) | Medium | Human approved the plan that explicitly recommended adding `/cart`; recorded as its own ADR so the reversal is deliberate and traceable |
| Decoupling `CartProvider` from `categories` touches already-working code and three components | Medium | Required for the provider hoist to avoid coupling the layout to menu data; not a drive-by refactor — it is the mechanism, not a side effect |
| The client-side pricing violation (`food-ordering-frontend-mvp.md` §7 item 3) becomes more entrenched as more cart code is written | Medium | No new pricing concepts (no tax/fees/discounts); logic isolated in one small, deletable pure module; TEMPORARY comments retained and updated |
| Cross-route state preservation (AC13) is not directly testable with RTL, which does not run the Next.js router | Medium | Covered by a layout-level render test proving state lives above the page, plus an explicit manual browser check reported as manual, not automated |
| Fabricating a loading state for cart mutations that have no real latency | Low | Route-level `loading.tsx` only (a genuine boundary); mutation feedback is announcement + transition, not a spinner |
| Cart is scheduled for deletion once `commerce-api` exists — risk of over-investing | Low | No persistence, no "clear cart", no feature beyond the approved scope; logic concentrated in pure functions that port cleanly later |
| `SiteNav` in the layout shifts existing page layout | Low | Minimal nav styling; Phase 1/2 visual regression checked manually in 3.2 |

## Assumptions

- `@testing-library/react` and the existing Vitest/jsdom setup handle the new
  component tests with no additional configuration — verified true for
  Phase 2's component tests, assumed to extend to this phase's.
- A root `app/error.tsx` covers the nested `/cart` segment without its own
  `error.tsx` — unverified Next.js behaviour; confirmed or corrected in 3.2.
- No requirement for the cart to survive a full page reload — read from the
  brief's "preserve during normal frontend navigation" plus "do not persist
  to a server"; corrected if wrong.
- The six planning decisions were resolved as recorded in requirements.md
  from a general "approved" without point-by-point confirmation — flagged
  there as an open question, cheap to correct before sub-phase 3.2.

## Not doing

- Any change to `packages/contracts/` or `dispatch.ts`/`simulate.ts`.
- Cart persistence (`localStorage`, reload survival).
- "Clear cart", saved carts, notes, modifiers, variants, combos.
- Tax, fees, tips, discounts, promo codes, or any total beyond a subtotal.
- Deep-linkable item URLs, checkout of any shape.
- Fixing the known `.main`/`.column` CSS arithmetic mismatch.
- Adding an e2e/cross-browser framework.
- Any backend, AI, voice, NestJS, auth, real payments, or infrastructure
  work.
- Committing, pushing, merging, or deploying.

## Specialised review needed?

Standard Path — informational only.

- security: no — no new input trust boundary; cart mutations are local state
  changes triggered by trusted, direct UI interaction, not parsed external
  input.
- performance: no — small in-memory arrays, no queries, no network calls.
- data / migration: no — no persistence, no schema.
