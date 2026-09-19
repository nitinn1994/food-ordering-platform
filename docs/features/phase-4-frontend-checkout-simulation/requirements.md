# Requirements — Phase 4: Frontend Checkout Simulation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-19 (in conversation, "approved", then confirmed
point-by-point: "all as recommended" for D1–D12)
**Risk:** MEDIUM
**Path:** Standard

## Problem

Phase 3 delivered a complete frontend-only cart: add, remove, increase,
decrease, per-line and cart subtotals, an item count, and a `/cart` route whose
state survives navigation. The flow stops there. A user who has built a cart
has nowhere to go — there is no way to express "I want this order", no place to
provide the details an order would need, and no confirmation that anything
happened.

Two consequences follow. First, the product cannot be demonstrated end to end:
the journey dead-ends at a list of items. Second, and more importantly for what
comes next, the shape of an order has never been exercised in the frontend at
all. When `commerce-api` arrives and owns orders for real, the frontend will be
meeting that contract for the first time, at the point where it is most
expensive to discover the shape is wrong.

This phase is also the first one to knowingly contradict the authority model
rather than merely anticipate it. `system-architecture.md` §5 makes order state
authoritatively `commerce-api`'s, and §4.4 classifies `PlaceOrder` as a business
intent executed by the backend — never by the frontend. A frontend that mints an
order identifier violates both. That violation is accepted here, deliberately,
under the same terms as the client-side pricing violation recorded in
`food-ordering-frontend-mvp.md` §7 item 3: contained in one small module, header
commented, named in the product doc, and recorded in an ADR.

It also reverses a written scope boundary. "Checkout of any shape" is listed as
out of scope in `food-ordering-frontend-mvp.md` §4, §9 **and** §10. This phase
amends that in §11 rather than quietly ignoring it — the same treatment ADR-0010
gave the `/cart` routing reversal.

## Goal

A frontend-only checkout simulation: from a non-empty `/cart`, the user reaches
`/checkout`, reviews the order, enters customer details, sees validation errors
on bad input, reviews details and order together, submits once, and lands on a
confirmation carrying a locally generated order reference and an immutable
snapshot of what was ordered — using local state and mock data only, with no
network call, no persistence, no payment, and **no new money concept**: the
order total is the cart subtotal, exactly.

## In scope

- A `/checkout` route (`app/checkout/page.tsx`, async Server Component awaiting
  `getMenu()`), plus `app/checkout/loading.tsx` — the same shape as `/cart`.
- A client-side step machine: `details → review → submitting → confirmed`,
  implemented as a reducer in `lib/checkout/checkoutReducer.ts` so it is unit
  testable independently of any component, the pattern `cartReducer` and
  `uiReducer` already set.
- An empty-cart guard that precedes the form and is bypassed only by the
  `confirmed` step.
- A read-only order summary — item name, unit price, quantity, line subtotal,
  order total — computed by **reusing** `lib/cart/pricing.ts`. No new pricing
  code of any kind.
- A customer-details form: full name (required), phone (required), email
  (optional). Required-field validation, inline errors, an error summary that
  takes focus, and preserved input on failure.
- A review step showing details and order summary together, with edit paths
  back to `details` and back to `/cart`.
- A single-submit guard: the `submitting` step renders the control genuinely
  `disabled`. This is the frontend analogue of the idempotency `commerce-api`
  will later own.
- A locally generated order identifier (`ORD-` + 6 uppercase base-36
  characters) and an immutable `SimulatedOrder` snapshot taken at submit time.
- Clearing the cart on successful submission, via a new `CLEAR_CART` action on
  `cartStore`.
- Responsive layout at the existing ~480px breakpoint, ≥44×44px tap targets,
  accessible form semantics, explicit focus management at every step
  transition, and a polite live region for checkout status — separate from
  `CartAnnouncer`, which stays cart-count only.
- Component and unit tests for every new module and component.
- Documentation: `food-ordering-frontend-mvp.md` §11 and a fourth §7 temporary
  item; a new ADR-0011; `getting-started.md`.

## Out of scope

- **`apps/commerce-api`, `apps/ai-service`, NestJS, Python, LangChain,
  LangGraph, voice, authentication, production infrastructure** — unchanged
  from Phases 1–3.
- **Any network call of any kind**, including a fetch to a local stub route
  handler or a server action.
- **Payment of any shape** — no card fields, no fake card fields, no payment
  method selection, no provider stub. Any of these re-triggers `/forge` and
  classifies HIGH.
- **Persistence** — no `localStorage`, `sessionStorage`, cookies, or IndexedDB
  for the cart, the form, or the order. The order lives in React state for the
  life of the session and is lost on reload, by design.
- **Tax, delivery fee, service fee, tip, discount, promo code** (D5) — the
  order total equals the cart subtotal exactly, stated as an explicit commented
  line in `buildSimulatedOrder` rather than left implicit.
- **Delivery vs pickup selection, and delivery address fields** (D2, D3) — no
  approved document defines either. Adding them would mean inventing fulfilment
  policy (zones, fees, windows, minimums) that nothing supports.
- **Any change to `packages/contracts/`.** Placing an order is a business
  intent (`system-architecture.md` §4.4), not a UI command. No new UI command is
  added, and `dispatch.ts` must remain structurally unable to import
  `cartStore` or anything under `lib/checkout/`.
- **Order history, order tracking, order status, re-order, cancel, receipt, or
  email of any kind.**
- **A guest-versus-account distinction** — there is no authentication and no
  subject to distinguish.
- **Modifiers, variants, combos, per-item notes, scheduled ordering.**
- **Editing quantities at checkout** — line editing stays on `/cart`.
- **Enforcing `MenuItem.available` at checkout** (D12) — nothing enforces it
  today, and enforcing it is real business validation that belongs to
  `commerce-api`. Recorded as a follow-up.
- **Simulated backend failure or decline paths** (D10) — there is no failure
  mode to simulate without inventing a backend error contract.
- **Simulated submission latency** (D9) — Phase 3 refused to fabricate latency
  for synchronous local mutations and that precedent holds.
- **An e2e / cross-browser framework** — existing MEDIUM follow-up from
  Phase 2, not resolved here.
- **The known `.main`/`.column` CSS width-arithmetic mismatch** — deliberately
  left open per earlier explicit instruction.
- **Phase 3's outstanding manual checks** (its AC13, AC17, AC18, AC19) — the
  browser tooling remained unavailable throughout Phase 4 as well (confirmed
  during this phase, not assumed from Phase 3), so these are still not
  performable and are carried forward as a follow-up, not Phase 4 scope.

## Acceptance criteria

Checked items are verified by the automated suite (`pnpm turbo run test`,
190 tests: 16 contracts + 174 web) unless noted otherwise. Four criteria
(AC9, AC19, AC20, AC21) have real manual-verification components that were
not performed — the Chrome browser automation tool did not connect when
checked explicitly, twice, at the start of sub-phase 4.2, and remained
unavailable for the rest of this phase's implementation, the same gap Phase
3 recorded. Each is marked below with what the automated suite actually
covers and what it does not.

**2026-09-19, during `/final-review`:** the human explicitly accepted the
automated-only evidence for AC9, AC19, AC20, and AC21 as sufficient —
"Accept the automated-only evidence for AC9/AC19/AC20/AC21" — rather than
waiting for the browser tool to connect. All four are checked below on that
basis. The underlying gap (no live browser session ever confirmed real
screen-reader behaviour, real keyboard/focus-visibility, real 375/768/1280px
rendering, or the live forced-rejection error-boundary test) is unchanged
and remains recorded in each entry and in `test-plan.md`'s Results section
— accepting the evidence does not mean the live check happened.

- [x] AC1: `/checkout` renders and prerenders in `pnpm turbo run build`, and is
      reachable from `/cart` when the cart is non-empty.
- [x] AC2: `/cart` shows a "Proceed to checkout" control only when the cart has
      at least one line; the empty-cart branch does not render it.
- [x] AC3: Visiting `/checkout` with an empty cart renders the empty-cart
      notice and a link to `/`, and renders no form control, no total, and no
      submit button.
- [x] AC4: The checkout order summary shows every resolvable line with name,
      unit price, quantity, and line subtotal.
- [x] AC5: The checkout order total equals `cartSubtotalCents(lines,
      categories)` for the same cart — the identical value `/cart` displays.
- [x] AC6: No tax, fee, tip, discount, or any term other than the subtotal
      appears anywhere in the checkout UI or in `SimulatedOrder`.
- [x] AC7: Submitting the details form with a blank required field keeps the
      user on `details`, renders an error for each invalid field, and preserves
      every entered value.
- [x] AC8: Each invalid control carries `aria-invalid="true"` and an
      `aria-describedby` pointing at its visible message.
- [x] AC9: A failed submit moves focus to the error summary, and the failure is
      announced in a polite live region. **Automated:** focus move
      (`CustomerDetailsForm.test.tsx`) and the live-region announcement
      (`CheckoutAnnouncer.test.tsx`, `CheckoutFlow.test.tsx`) are both
      tested. **Not done:** real screen-reader confirmation in a browser —
      human-accepted as sufficient evidence at `/final-review` (see note
      above). Also disclosed: a static string means only the *first* of
      several identical, back-to-back failed submits is announced (React
      bails out on an unchanged state value) — the visual summary and
      focus-move still fire every time.
- [x] AC10: Correcting a field after a failed submit clears that field's error
      without requiring a resubmit.
- [x] AC11: A valid details submission advances to `review`, showing the
      entered details and the order summary together.
- [x] AC12: From `review`, an "Edit details" control returns to `details` with
      every value intact.
- [x] AC13: "Place order" transitions through `submitting` with the control
      `disabled`, and a second activation cannot create a second order. Per
      D9 (no artificial latency), the two dispatches that advance
      `submitting` → `confirmed` happen synchronously in one handler, so
      React batches them into a single render — the `disabled` frame is not
      independently visible in the live app, though both halves of this
      criterion are directly unit/component tested regardless. `/review`
      found that `CheckoutFlow.handlePlaceOrder` itself had no step guard
      of its own — the reducer protected the persisted order but not the
      handler's side effects (a second, unpersisted order could be built
      and announced on a genuine double-invocation). Fixed by adding the
      same guard directly to the handler; see `test-plan.md`'s AC13 note.
- [x] AC14: Confirmation shows a locally generated order id matching
      `ORD-[A-Z0-9]{6}`, the customer recap, the order lines, and the total.
- [x] AC15: The confirmation renders from an immutable snapshot and is
      unaffected by the cart being cleared.
- [x] AC16: After confirmation, the cart is empty — the nav count reads
      `Cart (0)` and `/cart` shows its empty state.
- [x] AC17: The confirmation states in plain language that the order is
      simulated, that nothing was sent, and that no payment was taken.
- [x] AC18: "Back to the menu" from the confirmation navigates to `/`.
- [x] AC19: The whole flow is completable by keyboard alone; focus is
      explicitly managed at all three step transitions and is never lost.
      **Automated:** real DOM tab order (`CustomerDetailsForm.test.tsx`) and
      focus-on-mount at all three transitions, both at the component level
      (`CheckoutReview.test.tsx`, `OrderConfirmation.test.tsx`) and the
      integration level (`CheckoutFlow.test.tsx`). **Not done:** real
      keyboard operation and focus-visibility confirmation in a browser —
      human-accepted as sufficient evidence at `/final-review`.
- [x] AC20: No horizontal overflow at 375px, and all tap targets are
      ≥44×44px. **Static review performed:** every new CSS module checked;
      found and fixed one real gap (`FormField`'s `<input>` had no explicit
      width, inconsistent with `ChatInput`/`MenuSearch`'s existing
      `flex: 1` convention). All containers cap at `max-width: 32rem`,
      well under 375px, using the same stacking pattern Phase 3 established.
      **Not done:** live resizing and visual confirmation in a browser —
      human-accepted as sufficient evidence at `/final-review`.
- [x] AC21: `/checkout` has its own loading boundary and inherits the root
      `error.tsx`. **Automated:** the loading boundary itself is tested
      (`app/checkout/loading.test.tsx`). **Not done:** the live
      forced-rejection test confirming the root `error.tsx` actually covers
      the nested `/checkout` segment — this was expected to be verified live
      this phase and was not; ADR-0010's identical open assumption for
      `/cart` remains open too (see ADR-0011). Human-accepted as sufficient
      evidence at `/final-review`; the ADR-0010/ADR-0011 assumption itself
      remains open and is not resolved by this acceptance.
- [x] AC22: No file under `packages/contracts/` is modified, and `dispatch.ts`
      contains no import referencing `cartStore` or anything under
      `lib/checkout/` — confirmed by `grep` and `git status`, not by test alone.
- [x] AC23: `lib/menu/menuSource.ts` remains the only runtime importer of
      `lib/fixtures/menu.ts` (Phase 2 AC6 regression).
- [x] AC24: No `fetch`, `XMLHttpRequest`, route handler, server action,
      `localStorage`, `sessionStorage`, `document.cookie`, or `console.*` call
      receives customer details anywhere in the checkout code — confirmed by
      `grep` over `lib/checkout/` and `components/checkout/`.
- [x] AC25: All Phase 1/2/3 behaviour is intact (the full pre-existing
      automated suite still passes unchanged, growing from 100 to 190 tests
      with zero regressions); live manual click-through was not repeated
      this phase, the same standing gap Phase 3 already carried.
- [x] AC26: `lib/checkout/order.ts` and the updated `cartStore.tsx` carry
      TEMPORARY header comments naming what replaces them, and
      `food-ordering-frontend-mvp.md` §7 lists client-side order creation as a
      fourth temporary item.

AC22–AC25 are the boundary/regression criteria — worth failing the phase
over, same standard as prior phases' boundary ACs.

AC22, AC23, AC24 and AC25 are the boundary/regression criteria — worth failing
the phase over, the same standard as Phase 1 AC8, Phase 2 AC15, and Phase 3
AC20–AC22. AC24 is new in kind: it is the first criterion in this repository
that exists because customer PII is present at all.

## Decisions taken at approval

Twelve decisions were posed in the plan, each covering something **no approved
document in this repository defines**. The human approved the plan and then
confirmed explicitly, when asked, that "approved" meant all twelve
recommendations as written. Unlike Phase 3, this confirmation was obtained
point-by-point rather than assumed from a general go-ahead.

| # | Decision | Resolution |
| - | -------- | ---------- |
| D1 | Does Phase 4 happen, given §4/§9/§10 exclude checkout? | Yes — with a §11 product-doc amendment and ADR-0011 recording the reversal |
| D2 | Delivery vs pickup selection | Neither. No fulfilment-method selection in Phase 4 |
| D3 | Delivery address fields | None. Contingent on D2 |
| D4 | Which customer fields are required | Full name (required), phone (required), email (optional) |
| D5 | Tax, fees, tips, discounts | None. `totalCents === subtotalCents` |
| D6 | Is the cart cleared on confirmation? | Yes, via a new `CLEAR_CART` action — reverses Phase 3's "clear cart" exclusion |
| D7 | Confirmation: separate route or in-route step? | In-route step |
| D8 | Order identifier format | `ORD-` + 6 uppercase base-36 characters |
| D9 | Simulate submission latency? | No artificial delay; keep the `submitting` state for double-submit protection |
| D10 | A simulated failure/decline path? | No |
| D11 | Entry points to checkout | `/cart` only, non-empty branch |
| D12 | Can an `available: false` item be checked out? | Yes — not enforced in Phase 4; recorded as a follow-up |

D4 is the one resolution with no documentary basis whatsoever — it was proposed
as a recommendation, labelled as invented, and accepted as such. If real product
requirements later specify a different field set, this is the decision to
revisit first.

## Open questions

- None outstanding at approval. D1–D12 were confirmed explicitly rather than
  inferred.
- Carried in from ADR-0010, to be closed by this phase's AC21: whether a root
  `app/error.tsx` actually covers a nested route segment without that segment
  having its own `error.tsx`. Still an unverified Next.js assumption for
  `/cart`; `/checkout` makes the same assumption and will verify it live. If it
  turns out false, `app/checkout/error.tsx` (and, as a follow-up,
  `app/cart/error.tsx`) is a small isolated addition.
