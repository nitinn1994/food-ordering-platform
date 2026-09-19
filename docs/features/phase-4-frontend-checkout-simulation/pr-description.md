# Add a frontend-only checkout simulation (Phase 4)

## Problem

Phase 3 shipped a complete frontend-only cart — add, remove, increase,
decrease, subtotals, an item count, and a `/cart` route whose state survives
navigation — but the journey stopped there. A user who built a cart had
nowhere to go: no way to express "I want this order," no place to provide the
details an order would need, and no confirmation that anything happened. This
also meant the shape of an order had never been exercised in the frontend at
all, so when `commerce-api` eventually owns orders for real, the frontend
would be meeting that contract for the first time at the most expensive point
to discover it's wrong.

This also required reversing a written boundary rather than working around
it quietly: `docs/product/food-ordering-frontend-mvp.md` §4/§9/§10 listed
"checkout of any shape" as out of scope, and `system-architecture.md` §4.4/§5
make order state authoritatively `commerce-api`'s. Both are addressed
directly below, not glossed over.

## Solution

A `/checkout` route that walks the existing local cart through a
customer-details form, a review step, and a simulated confirmation — entirely
in frontend state, reusing Phase 3's cart and pricing logic, adding no new
money concept, no dependency, and no network call.

- **Reuses, doesn't duplicate:** the order total is `cartSubtotalCents` — the
  identical function and value `/cart` already displays. A shared
  `resolveOrderLines` helper (extracted from the order-snapshot builder)
  serves both the live-cart review display and the frozen confirmation
  snapshot, so the "find the item, drop what doesn't resolve" rule exists in
  exactly one place.
- **Knowingly violates the order-state authority model, on purpose, once, and
  says so:** a locally generated order id and an immutable order snapshot are
  built entirely client-side. This is recorded in
  [ADR-0011](../../architecture/architecture-decisions.md#adr-0011--a-simulated-frontend-checkout-that-knowingly-violates-the-order-state-authority-model)
  and a new product-doc §11, the same treatment ADR-0010 gave the `/cart`
  route's own scope reversal — not a silent override.
- **States plainly that it's a simulation:** the confirmation screen says, in
  plain language, that the order is simulated, nothing was sent to a
  restaurant, and no payment was taken.
- **Twelve product decisions, answered before code was written, not
  invented silently:** delivery/pickup, address fields, tax/fees, submission
  latency, a failure path, and more were posed as open decisions (D1–D12) and
  answered by the human before implementation — recorded in
  `requirements.md`. The one field set with no documentary basis at all
  (which customer details to require) is flagged as an admitted
  recommendation, not a specification.

## Implementation summary

- **4.1 — Checkout domain layer:** pure types, validation, order-id
  generation, the order-snapshot builder, and the `details → review →
  submitting → confirmed` step reducer — all unit tested before any UI
  existed. Added `CLEAR_CART` to the existing cart reducer.
- **4.2 — Route, empty-cart guard, step skeleton:** the `/checkout` route,
  its loading boundary, and `CheckoutFlow`'s guard ordering — a confirmed
  order is checked *before* the empty-cart guard, because placing an order
  clears the cart and checking "empty" first would blank the confirmation the
  instant an order succeeds.
- **4.3 — Customer-details form and validation UI:** a hand-rolled form
  (matching the codebase's only other form, `ChatInput` — no form library, no
  `zod`), an error summary that receives focus on a failed submit, and a
  checkout-scoped live region separate from the existing cart one.
- **4.4 — Review, submission, confirmation:** the order summary, the review
  step, the submit path (`buildSimulatedOrder` → `clearCart()` → announce),
  and the confirmation screen.
- **4.5 — Accessibility, responsive, documentation:** found and fixed two
  real gaps beyond the plan's checklist items (below), then wrote the product
  doc, ADR, and getting-started updates.
- **`/review` fix:** found and fixed a missing idempotency guard in the
  submit handler itself (below).

## Changed files

| File | Change | Why |
| ---- | ------ | --- |
| `apps/web/src/lib/checkout/types.ts` | new | Checkout step/state/customer/order types |
| `apps/web/src/lib/checkout/validation.ts` (+`.test.ts`) | new | Hand-rolled field validators |
| `apps/web/src/lib/checkout/orderId.ts` (+`.test.ts`) | new | Mock `ORD-XXXXXX` id generator, injectable random source |
| `apps/web/src/lib/checkout/order.ts` (+`.test.ts`) | new | `resolveOrderLines` + `buildSimulatedOrder` — the one place a simulated order is constructed (TEMPORARY, see ADR-0011) |
| `apps/web/src/lib/checkout/checkoutReducer.ts` (+`.test.ts`) | new | The step machine, with its own no-op guards on every wrong-step transition |
| `apps/web/src/app/checkout/page.tsx`, `page.module.css`, `loading.tsx` (+`.test.tsx`) | new | `/checkout` route — same async Server Component + loading-boundary shape as `/cart` |
| `apps/web/src/components/checkout/CheckoutFlow.tsx` (+`.test.tsx`) | new | Owns the reducer; guard ordering; wires every step together |
| `apps/web/src/components/checkout/EmptyCheckoutNotice.tsx` (+CSS, `.test.tsx`) | new | Empty-cart guard UI |
| `apps/web/src/components/checkout/FormField.tsx` (+CSS, `.test.tsx`) | new | Shared label/`aria-invalid`/`aria-describedby` wiring |
| `apps/web/src/components/checkout/CustomerDetailsForm.tsx` (+CSS, `.test.tsx`) | new | The details form, error summary, focus management |
| `apps/web/src/components/checkout/OrderSummary.tsx` (+CSS, `.test.tsx`) | new | Read-only lines + total; reuses the existing `CartTotal` component |
| `apps/web/src/components/checkout/CheckoutReview.tsx` (+CSS, `.test.tsx`) | new | Details recap + order summary + edit/place-order actions |
| `apps/web/src/components/checkout/OrderConfirmation.tsx` (+CSS, `.test.tsx`) | new | Order id, recap, summary, simulation notice, back-to-menu |
| `apps/web/src/components/checkout/CheckoutAnnouncer.tsx` (+CSS, `.test.tsx`) | new | Checkout-scoped polite live region, separate from the cart's |
| `apps/web/src/lib/state/cartStore.tsx` (+`.test.ts`) | modified | Added `CLEAR_CART` action/`clearCart()`, called only when an order is placed |
| `apps/web/src/components/cart/CartList.tsx` (+CSS, `.test.tsx`) | modified | Added the "Proceed to checkout" link, non-empty branch only |
| `docs/product/food-ordering-frontend-mvp.md` | modified | New §11 (Phase 4 additions, the scope reversal recorded); §7 gained a fourth temporary item |
| `docs/architecture/architecture-decisions.md` | modified | New ADR-0011 |
| `docs/development/getting-started.md` | modified | Current state, `/checkout`, repository layout, verified commands |
| `docs/features/phase-4-frontend-checkout-simulation/{requirements,plan,test-plan}.md` | new | ForgeFlow feature documents |

34 new source files, 5 modified source files, 3 modified docs, 3 new feature
docs. **Zero dependencies added** — `pnpm-lock.yaml` and every `package.json`
are unchanged.

## Validation — executed

| Check | Command | Status | Evidence |
| ----- | ------- | ------ | -------- |
| Type check | `pnpm turbo run typecheck` (forced, uncached) | PASS | Full monorepo, zero errors |
| Lint | `pnpm turbo run lint` (forced, uncached) | PASS | Full monorepo, zero errors/warnings |
| Test | `pnpm turbo run test` (forced, uncached) | PASS | 190 total (16 contracts + 174 web), up from 100 before this phase |
| Build | `pnpm turbo run build` (forced, uncached) | PASS | `/`, `/cart`, `/checkout`, `/_not-found` all prerender statically |
| Boundary: `packages/contracts/` untouched | `git status --porcelain packages/contracts/` | PASS | Empty output |
| Boundary: `dispatch.ts` excludes cart/checkout | `grep '^import'` on `dispatch.ts` | PASS | Only imports `@contracts/ui-commands` and `../state/uiStore` |
| Boundary: fixture import (Phase 2 AC6) | `grep` for non-type-only `fixtures/menu` imports | PASS | Only `menuSource.ts`; every other match is `import type` |
| Boundary: no fetch/storage/console on customer details | word-boundary `grep` over `lib/checkout/`, `components/checkout/` | PASS | Zero matches |
| Boundary: no tax/fee/tip/discount wording | `grep` over `lib/checkout/`, `components/checkout/` | PASS | Matches are only comments/tests stating the absence |
| `/review` (self- and adversarial-checked against the diff) | manual code review | 1 MEDIUM found and fixed; 1 MEDIUM + 1 LOW deferred (below) | See Follow-up work |

## Validation — not executed

| Check | Status | Why |
| ----- | ------ | --- |
| Live browser session (click-through, keyboard/focus-visibility, screen reader, resize at 375/768/1280px, forced-rejection error-boundary test) | SKIPPED | The Chrome browser automation tool never connected during this phase's implementation (checked explicitly, twice). Automated proxies exist (DOM tab order, focus assertions, static CSS review, the loading-boundary test) and were accepted by the human in lieu of a live session — see `requirements.md`'s dated note under "Acceptance criteria." |
| Format | NOT_CONFIGURED | No formatter declared anywhere in the repository |
| E2E / cross-browser | NOT_APPLICABLE | No framework configured — existing MEDIUM follow-up from Phase 2, not resolved here |
| Automated accessibility scan | SKIPPED | No axe/Lighthouse configured; manual accessibility-tree review substitutes, itself only static (see above) |
| Install | NOT_APPLICABLE | No dependency was added; the lockfile did not change |

## Acceptance criteria

All 26 acceptance criteria in `requirements.md` are checked. 22 are backed
purely by automated evidence; AC9, AC19, AC20, and AC21 each have a real
manual-verification component that was not performed (no live browser
session — see above) and were checked only after the human explicitly
accepted the automated-only evidence as sufficient, on 2026-09-19 during
`/final-review`. That acceptance is recorded verbatim in `requirements.md`
alongside each criterion's original "not done" disclosure, which was left in
place rather than removed.

- [x] AC1–AC8, AC10–AC18, AC22–AC26 (22 total) — fully automated, each backed
      by a specific named test file (see `requirements.md` for the full list).
- [x] AC9 — focus-to-summary and live-region announcement on a failed submit:
      automated (DOM focus + live-region content); real screen-reader
      confirmation not performed, accepted.
- [x] AC19 — keyboard-only completion, focus managed at all three step
      transitions: automated (real DOM tab order, focus-on-mount at every
      transition); real keyboard/focus-visibility confirmation not performed,
      accepted.
- [x] AC20 — no horizontal overflow at 375px, ≥44×44px tap targets: static
      CSS review (found and fixed one real gap — see Known limitations);
      live resize/visual confirmation not performed, accepted.
- [x] AC21 — `/checkout` has its own loading boundary and inherits the root
      `error.tsx`: loading boundary is tested; the live forced-rejection test
      was not performed (this also leaves ADR-0010's identical open
      assumption for `/cart` unresolved), accepted.

## Known limitations

- **No live browser verification occurred anywhere in this phase.** Every
  interactive, visual, and screen-reader-dependent claim rests on an
  automated proxy (jsdom + React Testing Library, which does exercise real
  clicks, DOM tab order, and focus assertions within a render tree) or a
  static review, not a driven browser. This is the identical gap Phase 3
  recorded for the identical reason (the same tool was unavailable then too).
- **ADR-0010's open assumption is now open for two routes, not one:** whether
  a root `app/error.tsx` actually covers a nested route segment without its
  own `error.tsx` was never confirmed live for `/cart`, and `/checkout` makes
  the identical unverified assumption.
- A found-and-fixed gap during 4.5: `FormField`'s `<input>` had no explicit
  width, inconsistent with the codebase's own `ChatInput`/`MenuSearch`
  convention — fixed (`width: 100%`).
- A found-and-fixed gap during `/review`: `CheckoutFlow.handlePlaceOrder` had
  no step guard of its own — the reducer protected the persisted order but
  not the handler's side effects. Fixed by adding the same guard the reducer
  already uses. Not independently regression-tested: the exact race (two
  browser click events interleaving around one React commit) can't be
  reproduced in jsdom + Testing Library's fully-synchronous execution model.
- One disclosed simplification: if a user submits the details form
  repeatedly with no changes in between, only the first identical failure is
  announced through the live region (React bails out on an unchanged state
  value); the visual error summary and focus-move still fire every time.
- Two small, pre-existing documentation artifacts noticed during
  `/final-review`, neither fixed: a duplicated sentence in
  `requirements.md` (cosmetic, no effect on any criterion), and an untracked
  `.claude/scheduled_tasks.lock` file left by an unrelated tooling command
  earlier in this session (not part of this diff).

## Follow-up work

- **MEDIUM (human-accepted, deferred):** AC6, AC23, AC24, and the
  `lib/checkout` half of AC22 are documented as boundary checks but are not
  actually encoded as repeatable tests — they were one-time manual `grep`
  commands run during implementation and review, not something
  `pnpm turbo run test` re-checks going forward. Extend
  `apps/web/src/lib/commands/dispatch.test.ts`'s existing boundary test to
  also check for `lib/checkout` imports, and add a small dedicated test
  asserting the absence of fetch/storage/console calls and tax/fee/tip
  wording in `lib/checkout`/`components/checkout`.
- **LOW (human-accepted, deferred):** `lib/checkout/validation.ts`'s phone
  validator doesn't strip `.`, so a dot-separated number (e.g.
  `555.123.4567`) is rejected even though it's a common real-world format.
- **MEDIUM, carried from Phase 3, still unresolved:** Phase 3's own
  outstanding manual checks (its AC13, AC17, AC18, AC19) were never
  performed — the browser tooling remained unavailable throughout this phase
  too. Run them together with this phase's outstanding manual checks once
  the tool connects.
- **MEDIUM, carried from Phase 2, still unresolved:** no e2e/cross-browser
  test framework.
- **MEDIUM, carried from Phase 3/4, needs a product decision:**
  `MenuItem.available` is never enforced — an unavailable item can be added
  to the cart and, after this phase, checked out. Belongs to `commerce-api`
  validation once it exists.
- **LOW, pre-existing:** the known `.main`/`.column` CSS width-arithmetic
  mismatch, deliberately left open per earlier explicit instruction.
- **LOW:** the `dt`/`dd` detail rows in `CheckoutReview`/`OrderConfirmation`
  have no word-break/overflow-wrap guard against an unusually long,
  space-free value; the rest of the codebase has never needed this guard
  either, so it wasn't added unilaterally.

## Risks

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| This code is mistaken for a real checkout once `commerce-api` exists | Low | `lib/checkout/order.ts` carries a `TEMPORARY` header naming ADR-0011 as its replacement trigger; the confirmation screen itself states plainly it is simulated |
| The client-side pricing violation (product doc §7 item 3) grows more entrenched now that a second surface displays money | Low | No new pricing code — checkout reuses `lib/cart/pricing.ts` exclusively; `totalCents = subtotalCents` is an explicit, commented line |
| A future change silently reintroduces a boundary violation (an import of `cartStore` into `dispatch.ts`, a `console.log` of customer details, an invented tax field) | Medium | Currently only caught by manual review, not by the test suite — see the MEDIUM follow-up above |
| No live-browser confirmation means an interaction bug (focus, keyboard trap, real overflow) ships unnoticed | Medium | Explicitly accepted by the human as a known limitation before this PR; recorded, not hidden |

## Deployment considerations

None. This is a frontend-only, no-backend, no-database, no-auth change with
zero new dependencies. No migration, no config, no feature flag, no
deployment ordering concern. Nothing is sent to any external service —
`grep`-verified absence of `fetch`/`XMLHttpRequest`/storage/cookie calls
anywhere in the new code.
