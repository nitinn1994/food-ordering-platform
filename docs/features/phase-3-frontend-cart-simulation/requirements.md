# Requirements — Phase 3: Frontend Cart Simulation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-14 (in conversation, "approved")
**Risk:** MEDIUM
**Path:** Standard

## Problem

Phase 1 shipped a placeholder cart (`cartStore.tsx`, `CartPanel`, `CartLine`,
`CartTotal`) that can only add and remove whole lines, has no quantity
control, no subtotal display, and no navigation of its own. Its providers are
mounted inside `app/page.tsx`, so there is currently no way to leave the menu
page without destroying cart state — there is nowhere else to leave to. The
cart cannot yet demonstrate the "preserve cart state during normal frontend
navigation" requirement because there is no navigation to preserve it across.

## Goal

A complete, frontend-only cart: add, remove, increase and decrease quantity;
line and cart subtotals; an item count visible from anywhere; a dedicated
`/cart` route that survives navigating away and back; empty/loading states;
and accessible, responsive controls — all still using mock menu data and
local client state, with no backend call and no new pricing concepts.

## In scope

- Quantity increase (re-add or in-cart "+") and decrease (in-cart "−", floor
  at 1) on existing cart lines.
- Cart item count (sum of quantities), shown in site navigation and in a
  compact menu-page cart summary.
- A dedicated `/cart` route with full cart management, reachable via
  `next/link` navigation from the menu page and back.
- Hoisting `UiProvider`/`CartProvider` from `app/page.tsx` to `app/layout.tsx`
  so cart state survives navigation between `/` and `/cart`.
- Decoupling `CartProvider` from menu data — it holds only lines and
  mutations; pricing becomes pure functions taking `(lines, categories)`
  explicitly (`lib/cart/pricing.ts`).
- Per-line and cart subtotals, in integer cents, via `formatCents`/`sumCents`.
- Empty-cart state with a link back to the menu.
- A quantity cap (99 per line) as frontend validation.
- A polite live-region announcement on cart changes.
- Responsive cart UI (stacks below ~480px) and accessible controls
  (named quantity buttons, correct `disabled` semantics, ≥44px tap targets,
  keyboard operability).
- Component and unit tests for all of the above.
- Documentation updates: `food-ordering-frontend-mvp.md` (new §10),
  `getting-started.md`, a new ADR in `architecture-decisions.md`.

## Out of scope

- **Any change to `packages/contracts/`.** Add/remove/quantity-change is
  commerce state, not a UI command (`system-architecture.md` §4.4). No new UI
  commands are added; `dispatch.ts` must remain structurally unable to import
  `cartStore` (Phase 2 AC8, re-verified here).
- **Repurposing `OpenCartPanel`** to navigate to `/cart`. It keeps its
  existing meaning against the menu-page summary.
- Cart persistence across a page reload (`localStorage`/`sessionStorage`) —
  deferred to when a real backend-owned cart exists.
- "Clear cart", saved carts, notes, modifiers, variants, combos, tax, fees,
  tips, discounts, promo codes, or any total beyond a subtotal.
- Deep-linkable item URLs (unchanged from Phase 2 §9).
- Checkout, of any shape.
- The known `.main`/`.column` CSS width-arithmetic mismatch — deliberately
  left open per earlier explicit instruction; new cart CSS does not depend on
  it being fixed.
- An e2e/cross-browser test framework — existing MEDIUM follow-up from Phase
  2, not resolved here.
- Backend, AI, voice, NestJS, database, authentication, real payments, real
  order creation, production infrastructure — unchanged from Phase 1/2.

## Acceptance criteria

Checked items are verified by the automated suite (`pnpm turbo run test`,
100 tests) unless noted otherwise. Four criteria (AC13, AC17, AC18, AC19)
have real manual-verification components that were not performed — the
Chrome browser automation tool was unavailable throughout Phase 3's
implementation and review. Those are left unchecked with the gap named
inline, rather than checked on the strength of automated coverage alone.

- [x] AC1: Adding an item not in the cart creates a line at quantity 1.
- [x] AC2: Adding an item already in the cart increments it; no duplicate
      line is created.
- [x] AC3: The in-cart "+" control increases quantity by exactly 1.
- [x] AC4: The in-cart "−" control decreases quantity by exactly 1 and never
      below 1.
- [x] AC5: "−" is `disabled` when quantity is 1.
- [x] AC6: "+" is `disabled` at quantity 99; `ADD_ITEM` at 99 is a no-op.
- [x] AC7: "Remove" deletes the whole line regardless of quantity.
- [x] AC8: Cart item count equals the sum of line quantities, not the number
      of distinct lines.
- [x] AC9: A line subtotal equals `priceCents × quantity`, in integer cents.
- [x] AC10: The cart subtotal equals the sum of all line subtotals.
- [x] AC11: `/cart` renders every line with name, quantity, subtotal, and
      controls.
- [x] AC12: An empty cart shows the empty state and a link to the menu, with
      no totals block and no quantity controls rendered.
- [ ] AC13: Navigating `/` → `/cart` → `/` preserves every line and its
      quantity. **Automated (partial):** `cartStore.navigation.test.tsx`
      proves `CartProvider` retains its state when its child tree is
      swapped — the mechanism the provider hoist relies on. **Not done:**
      the real click-through in a browser.
- [x] AC14: The nav cart count updates on every add, increase, decrease, and
      remove.
- [x] AC15: Every quantity control's accessible name includes the item name
      (never a bare "+"/"−").
- [x] AC16: Cart changes are announced in an `aria-live="polite"` region.
- [ ] AC17: The cart is fully operable by keyboard; tab order within a line
      is − → qty → + → Remove. **Automated:** DOM tab order verified via
      `user-event.tab()`. **Not done:** real keyboard/focus-visibility
      confirmation in a browser.
- [ ] AC18: The cart UI is usable at 375px with no horizontal overflow.
      **Not done:** no browser session was available to resize and check.
- [ ] AC19: `/cart` has its own loading boundary and inherits the existing
      root `error.tsx`. **Automated:** the loading boundary itself is
      tested (`app/cart/loading.test.tsx`). **Not done:** a live
      forced-rejection test confirming the root `error.tsx` actually covers
      the nested `/cart` segment — still an unverified assumption (see
      ADR-0010).
- [x] AC20: No file under `packages/contracts/` is modified; `dispatch.ts`
      still has no import referencing `cartStore` (boundary regression, same
      pattern as Phase 1 AC8 / Phase 2 AC15) — confirmed by `grep` and
      `git status`, not just by test.
- [x] AC21: `lib/menu/menuSource.ts` remains the only runtime importer of
      `lib/fixtures/menu.ts` (Phase 2 AC6 regression) — confirmed by `grep`
      for non-type-only imports.
- [x] AC22: All Phase 1 and Phase 2 behaviour still works, including all
      five existing UI commands and the command log (the full pre-existing
      automated suite for these still passes unchanged; live manual
      click-through was not repeated this phase).
- [x] AC23: The TEMPORARY header comment on `cartStore.tsx` survives, updated
      to still describe reality after the reducer/context changes.

AC13 and AC20–AC22 are the regression/boundary criteria — worth failing the
phase over, same standard as prior phases' boundary ACs.

## Decisions taken at approval

The plan (recorded in this conversation) posed six open decisions. The human
approved the plan as presented without amendment, which is read here as
accepting each stated recommendation. This reading is itself an assumption —
see Open questions below.

| # | Decision | Resolution |
| - | -------- | ---------- |
| 1 | Routing | A real `/cart` route is added (not an in-page view switch) |
| 2 | Decrement at quantity 1 | "−" is `disabled` at 1; Remove stays the only path to zero |
| 3 | Quantity cap | 99 per line |
| 4 | Mutation latency | No simulated delay on cart mutations; feedback is re-render + live-region announcement + CSS transition only |
| 5 | Provider decoupling | Approved — `CartProvider` no longer takes a `categories` prop; pricing moves to `lib/cart/pricing.ts` |
| 6 | Plan documents | Written now, on approval (this document and its siblings) |

## Open questions

- Whether "approved" was intended as approval of each individual
  recommendation above, or a general go-ahead assuming the recommendations
  would be followed. **Not independently confirmed.** If any resolution above
  is wrong, correct it before `/implement` proceeds past sub-phase 3.1 — all
  five decisions are cheap to reverse before sub-phase 3.2 (the provider
  hoist) begins, and expensive after.
- Whether a root `app/error.tsx` actually covers the nested `/cart` segment
  without its own `error.tsx` — unverified Next.js App Router behaviour,
  assumed true from documented conventions. To be confirmed in sub-phase 3.2;
  if wrong, `app/cart/error.tsx` is added as a small in-scope addition.
