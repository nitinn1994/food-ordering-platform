# Test Plan — Phase 4: Frontend Checkout Simulation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --------------------- | ------------------- | ---- |
| AC1 — `/checkout` renders, prerenders, reachable from `/cart` | `pnpm turbo run build` output + `CartList.test.tsx` (link) + manual | automated + manual |
| AC2 — "Proceed to checkout" only when the cart is non-empty | `CartList.test.tsx` | automated |
| AC3 — empty cart shows the notice, no form/total/submit in the DOM | `EmptyCheckoutNotice.test.tsx`, `CheckoutFlow.test.tsx` | automated |
| AC4 — summary shows name, unit price, quantity, line subtotal | `OrderSummary.test.tsx` | automated |
| AC5 — checkout total equals `cartSubtotalCents` for the same cart | `order.test.ts` + `OrderSummary.test.tsx` | automated |
| AC6 — no tax/fee/tip/discount term anywhere | `order.test.ts` (shape) + `grep` over `components/checkout/` | automated (test + script) |
| AC7 — invalid submit keeps step, errors shown, values preserved | `CustomerDetailsForm.test.tsx` | automated |
| AC8 — `aria-invalid` + `aria-describedby` on invalid controls | `FormField.test.tsx`, `CustomerDetailsForm.test.tsx` | automated |
| AC9 — focus moves to the error summary; failure announced politely | `CustomerDetailsForm.test.tsx`, `CheckoutAnnouncer.test.tsx` | automated |
| AC10 — fixing a field clears its error without resubmitting | `CustomerDetailsForm.test.tsx` | automated |
| AC11 — valid submit advances to `review` with details + summary | `CheckoutFlow.test.tsx`, `CheckoutReview.test.tsx` | automated |
| AC12 — "Edit details" returns to `details` with values intact | `CheckoutFlow.test.tsx` | automated |
| AC13 — `submitting` disables the control; no second order | `checkoutReducer.test.ts` + `CheckoutFlow.test.tsx` | automated |
| AC14 — order id matches `ORD-[A-Z0-9]{6}`; confirmation content | `orderId.test.ts`, `OrderConfirmation.test.tsx` | automated |
| AC15 — confirmation renders from a snapshot, unaffected by the cart clearing | `order.test.ts` (immutability) + `CheckoutFlow.test.tsx` (clear-then-render) | automated |
| AC16 — cart is empty after confirmation | `cartStore.test.ts` (`CLEAR_CART`) + `CheckoutFlow.test.tsx` | automated |
| AC17 — confirmation states the order is simulated, nothing sent, no payment | `OrderConfirmation.test.tsx` | automated |
| AC18 — "Back to the menu" navigates to `/` | `OrderConfirmation.test.tsx` (href) + manual | automated + manual |
| AC19 — keyboard-completable; focus managed at all three transitions | `user-event.tab()` in component tests + manual | automated + manual |
| AC20 — no horizontal overflow at 375px; ≥44×44px tap targets | manual | manual |
| AC21 — `/checkout` loading boundary; root `error.tsx` covers the segment | `loading.test.tsx` (boundary) + manual forced-rejection check | automated + manual |
| AC22 — no `packages/contracts/` change; `dispatch.ts` imports neither `cartStore` nor `lib/checkout/` | `grep` + `git status` | automated (script) |
| AC23 — `menuSource.ts` remains the sole runtime fixture importer | `grep` for non-type-only imports of `fixtures/menu` | automated (script) |
| AC24 — no fetch/storage/cookie/console path receives customer details | `grep` over `lib/checkout/` and `components/checkout/` | automated (script) |
| AC25 — Phase 1/2/3 behaviour intact | full pre-existing suite + manual regression | automated + manual |
| AC26 — TEMPORARY comments present and accurate; §7 fourth item added | manual diff review | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| name required / trimmed / ≤100 chars | AC7 | `apps/web/src/lib/checkout/validation.test.ts` |
| phone required; 7–20 chars after stripping spaces, hyphens, parens, leading `+`; non-digits rejected | AC7 | `apps/web/src/lib/checkout/validation.test.ts` |
| email optional; shaped when present; blank is valid | AC7 | `apps/web/src/lib/checkout/validation.test.ts` |
| whitespace-only input is not valid input | AC7 | `apps/web/src/lib/checkout/validation.test.ts` |
| order id format; deterministic under an injected random source | AC14 | `apps/web/src/lib/checkout/orderId.test.ts` |
| snapshot carries name, unit price, quantity, line subtotal per line | AC4 | `apps/web/src/lib/checkout/order.test.ts` |
| `subtotalCents` equals `cartSubtotalCents(lines, categories)` | AC5 | `apps/web/src/lib/checkout/order.test.ts` |
| `totalCents === subtotalCents`; no other money field exists on `SimulatedOrder` | AC6 | `apps/web/src/lib/checkout/order.test.ts` |
| unresolvable line is dropped and excluded from totals | AC4, AC5 | `apps/web/src/lib/checkout/order.test.ts` |
| snapshot is unaffected by later cart mutation | AC15 | `apps/web/src/lib/checkout/order.test.ts` |
| every transition: `SET_FIELD`, `SUBMIT_DETAILS` valid/invalid, `EDIT_DETAILS`, `PLACE_ORDER`, `ORDER_PLACED` | AC11, AC12, AC13 | `apps/web/src/lib/checkout/checkoutReducer.test.ts` |
| `PLACE_ORDER` from `submitting` is a no-op; `ORDER_PLACED` sets `order` exactly once | AC13 | `apps/web/src/lib/checkout/checkoutReducer.test.ts` |
| errors clear per field once `submitAttempted` is true | AC10 | `apps/web/src/lib/checkout/checkoutReducer.test.ts` |
| `CLEAR_CART` empties a populated cart; is a no-op on an empty one | AC16 | `apps/web/src/lib/state/cartStore.test.ts` |
| "Proceed to checkout" present when non-empty, absent when empty | AC2 | `apps/web/src/components/cart/CartList.test.tsx` |
| loading boundary renders the cart-shaped skeleton | AC21 | `apps/web/src/app/checkout/loading.test.tsx` |
| empty notice: message + link to `/`, no form/total/submit rendered | AC3 | `apps/web/src/components/checkout/EmptyCheckoutNotice.test.tsx` |
| label association, `aria-invalid`, `aria-describedby`, valid vs invalid | AC8 | `apps/web/src/components/checkout/FormField.test.tsx` |
| invalid submit: stays on step, errors listed, values preserved | AC7 | `apps/web/src/components/checkout/CustomerDetailsForm.test.tsx` |
| focus moves to the error summary on failed submit | AC9, AC19 | `apps/web/src/components/checkout/CustomerDetailsForm.test.tsx` |
| correcting a field clears its error without resubmitting | AC10 | `apps/web/src/components/checkout/CustomerDetailsForm.test.tsx` |
| tab order through the form and its actions | AC19 | `apps/web/src/components/checkout/CustomerDetailsForm.test.tsx` |
| announces validation failure and order placed, politely not assertively | AC9 | `apps/web/src/components/checkout/CheckoutAnnouncer.test.tsx` |
| renders identically from live cart lines and from a snapshot | AC4, AC15 | `apps/web/src/components/checkout/OrderSummary.test.tsx` |
| review shows details recap, summary, edit paths, submit control | AC11 | `apps/web/src/components/checkout/CheckoutReview.test.tsx` |
| confirmation: id format, recap, lines, total, simulation notice, back link | AC14, AC17, AC18 | `apps/web/src/components/checkout/OrderConfirmation.test.tsx` |
| guard ordering: `confirmed` renders even with an empty cart | AC3, AC15 | `apps/web/src/components/checkout/CheckoutFlow.test.tsx` |
| full flow within one tree: details → review → submit → confirmed → cart cleared | AC11–AC16 | `apps/web/src/components/checkout/CheckoutFlow.test.tsx` |
| a second `PLACE_ORDER`/`ORDER_PLACED` outside its required step is a no-op | AC13 | `apps/web/src/lib/checkout/checkoutReducer.test.ts` (this row previously cited `CheckoutFlow.test.tsx`, which does not contain this test — corrected during `/review`, see Results) |
| `dispatch.ts` imports neither `cartStore` nor `lib/checkout/` (regression) | AC22 | existing `apps/web/src/lib/commands/dispatch.test.ts`, extended |

## Validation commands

All exist already; no new command and no new dependency is introduced.

| Check | Command | Expected |
| ----- | ------- | -------- |
| install | `pnpm install` | executed only if the lockfile changes — it should not |
| types | `pnpm turbo run typecheck` | PASS |
| lint | `pnpm turbo run lint` | PASS |
| test | `pnpm turbo run test` | PASS — 100 existing + ~45–55 new |
| build | `pnpm turbo run build` | PASS, with `/checkout` prerendering alongside `/`, `/cart`, `/_not-found` |
| dev server | `pnpm --filter web dev` | for the manual checks below |

| Check | Status | Reason |
| ----- | ------ | ------ |
| format | NOT_CONFIGURED | no formatter declared in the repository |
| e2e / cross-browser | NOT_APPLICABLE | no framework configured; existing MEDIUM follow-up from Phase 2 |
| automated a11y scan | SKIPPED | no axe/Lighthouse configured; manual accessibility-tree review substitutes |

Targeted per sub-phase (4.1–4.4); the full set runs before 4.5's `/review`.

### Boundary scripts

| # | Command | Expected |
| - | ------- | -------- |
| B1 | `git status --porcelain packages/contracts/` | empty (AC22) |
| B2 | `grep -nE "cartStore\|lib/checkout" apps/web/src/lib/commands/dispatch.ts` | no match (AC22) |
| B3 | `grep -rn "fixtures/menu" apps/web/src --include=*.ts --include=*.tsx` | only `menuSource.ts` as a non-type-only import (AC23) |
| B4 | `grep -rnE "fetch\|XMLHttpRequest\|localStorage\|sessionStorage\|document\.cookie\|console\." apps/web/src/lib/checkout apps/web/src/components/checkout` | no match (AC24) |
| B5 | `grep -rniE "tax\|tip\|fee\|discount\|promo" apps/web/src/lib/checkout apps/web/src/components/checkout` | no match (AC6) |

## Manual checks

1. `pnpm --filter web dev`; from `/`, add two different items; open `/cart`;
   confirm "Proceed to checkout" is present.
2. Remove every line; confirm the empty `/cart` branch does **not** show
   "Proceed to checkout".
3. Navigate directly to `/checkout` with an empty cart; confirm the empty
   notice, the link to `/`, and that no form field, total, or submit control
   exists on the page.
4. With a non-empty cart, open `/checkout`; confirm every line, its quantity,
   its subtotal, and the order total match `/cart` exactly, figure for figure.
5. Submit the details form empty; confirm the error summary appears, focus
   lands on it, each field shows an inline error, and nothing advances.
6. Fill only the name; submit; confirm the name error clears and the phone
   error remains.
7. Enter a clearly invalid phone (`abc`); confirm it is rejected. Enter
   `+1 (555) 123-4567`; confirm it is accepted.
8. Leave email blank and submit; confirm it is accepted. Enter `nope`; confirm
   it is rejected.
9. Continue to review; confirm details and order summary appear together;
   use "Edit details" and confirm every value is intact.
10. Place the order; confirm the control disables, the confirmation appears
    with an `ORD-` reference, the lines and total match, and the simulated-order
    notice is present and readable.
11. Confirm the nav count reads `Cart (0)` after confirmation and that the
    confirmation is still fully rendered — the guard must not fire.
12. Navigate back to the menu; confirm `/cart` shows its empty state and
    revisiting `/checkout` shows the empty notice.
13. Complete the entire flow using only the keyboard; confirm focus is visible
    at every step, never lost at a transition, and never left on a control that
    no longer exists.
14. Read the accessibility tree (or use a screen reader): confirm every input
    has a real label, invalid fields announce as invalid with their message,
    heading order is sensible, and the checkout announcements fire once each,
    politely.
15. Resize to 375 / 768 / 1280px; confirm no horizontal overflow, long item
    names wrap rather than push the total off-screen, and all tap targets are
    ≥44×44px.
16. Force a render-time rejection inside `/checkout` and confirm the root
    `app/error.tsx` catches it (AC21 — this also closes ADR-0010's open
    assumption for `/cart`).
17. Re-run the Phase 1/2/3 manual regression: category filter, search AND
    semantics, item detail panel, all five UI commands including the
    adversarial malformed/unknown-command phrases, the command log, and full
    cart CRUD with `/` → `/cart` → `/` persistence.

## Not covered

- No end-to-end browser automation framework (unchanged Playwright-shaped gap
  from Phases 1–3) — manual checks via the Chrome tooling stand in.
- No automated accessibility scanner (axe/Lighthouse); accessibility criteria
  are verified by targeted RTL queries plus a manual accessibility-tree review,
  not a general audit.
- No colour-contrast measurement.
- No cross-browser testing — Chromium only.
- No test drives the real Next.js client-side router across `/cart` →
  `/checkout`; RTL does not run it. The cross-route step is a manual check.
- No test proves anything about reload behaviour beyond "the order is lost",
  which is the intended design (no persistence) rather than a covered case.
- Nothing tests `commerce-api` order semantics, because no such service exists.
  `SimulatedOrder` is a frontend-local type and is deliberately not a contract.

## Results (as of Phase 4.5, 2026-09-19)

**Validation commands — executed, full monorepo, at the end of every
sub-phase (4.1–4.5) and once more here:**

| Check | Command | Result |
| ----- | ------- | ------ |
| Type check | `pnpm turbo run typecheck` | **PASS** |
| Lint | `pnpm turbo run lint` | **PASS** |
| Test | `pnpm turbo run test` | **PASS** — 190 total (16 contracts + 174 web), up from 100 before Phase 4 |
| Build | `pnpm turbo run build` | **PASS** — `/`, `/cart`, `/checkout`, `/_not-found` all prerender statically |
| Install | — | not run this phase; no dependency was added and the lockfile did not change |
| Format | — | `NOT_CONFIGURED` (unchanged) |
| E2E / cross-browser | — | `NOT_APPLICABLE` (unchanged, existing MEDIUM follow-up from Phase 2) |
| Automated a11y scan | — | `SKIPPED` (unchanged, no scanner configured) |

**Boundary scripts (B1–B5) — executed, re-run at the end of every sub-phase
that touched `lib/checkout/` or `components/checkout/`:**

All five passed at every check. One false positive is worth recording
honestly rather than silently working around: a plain-substring grep for
`fetch` matched the word "already-**fetch**ed" inside a comment in
`lib/checkout/order.ts`. Re-run with word-boundary patterns
(`\bfetch\(`, etc.), it correctly found zero matches. The word-boundary
form is what B4 above documents; the earlier plain-substring version was a
tooling mistake on my part, not a boundary violation.

**Acceptance criteria status:**

- AC1–AC8, AC10–AC18, AC22–AC24, AC26: verified by the automated suite
  above, each mapping to the specific test file listed in this document's
  tables.
- AC9 (focus to the error summary + polite live-region announcement on a
  failed submit): the automated half is covered
  (`CustomerDetailsForm.test.tsx`'s `toHaveFocus()` assertion,
  `CheckoutAnnouncer.test.tsx`, and `CheckoutFlow.test.tsx`'s live-region
  assertion). **Not performed:** real screen-reader confirmation. Also
  disclosed as a known, minor simplification (not a silent gap): if a user
  submits with no changes in between, only the *first* identical failure is
  announced through the live region — React bails out on an unchanged state
  value — though the visual error summary and focus-move fire on every
  attempt regardless.
- AC13 (submitting is disabled; a second order is impossible): the
  reducer-level guarantee is unit-tested (`checkoutReducer.test.ts`) and the
  component-level `disabled` attribute is tested in isolation
  (`CheckoutReview.test.tsx`). Per D9 (no artificial submission latency),
  `CheckoutFlow`'s handler dispatches `PLACE_ORDER` and `ORDER_PLACED`
  synchronously in one event handler; React batches both into a single
  re-render, so the disabled "submitting" frame is not independently
  observable in the live app.
  **Post-implementation correction (found during `/review`):** the
  reducer's step guards alone protect the *persisted* order (`state.order`)
  but not `handlePlaceOrder`'s own side effects — a genuine double
  invocation (a fast double-click landing before React commits the
  disabled attribute, or a held-key repeat) could still build a second,
  unpersisted order and re-announce it with a mismatched order id, even
  though the confirmed screen would still show the first, correct order.
  Fixed by adding the same step guard directly to `handlePlaceOrder`
  (`if (state.step !== "review") return;`), so a second invocation is a
  complete no-op, not just a no-op at the state layer. **Not independently
  unit-tested:** this exact race requires two browser click events to
  interleave around a single React commit — jsdom + Testing Library's
  `fireEvent`/`act()` model is fully synchronous per call and cannot
  reproduce that interleaving, so the fix is verified by code inspection
  and by confirming the full suite (174 tests) still passes unchanged, not
  by a dedicated regression test. This is the same class of gap as the
  missing e2e framework, not a new one.
- AC19 (full keyboard operability; focus explicitly managed at all three
  step transitions): fully covered by the automated suite —
  `CustomerDetailsForm.test.tsx` asserts the real DOM tab order across all
  five controls; `CheckoutReview.test.tsx` and `OrderConfirmation.test.tsx`
  each assert their own heading receives focus on mount;
  `CheckoutFlow.test.tsx` asserts the same at the integration level for both
  the details→review and review→confirmed transitions, plus the existing
  failed-submit→error-summary transition. **Not performed:** real keyboard
  operation and focus-visibility confirmation in a live browser.
- AC20 (usable at 375px, no horizontal overflow): a static review of every
  new CSS module found and fixed one real, disclosed gap —
  `FormField`'s `<input>` had no explicit `width`, inconsistent with this
  codebase's own convention (`ChatInput`, `MenuSearch` both use `flex: 1` to
  fill their container) and would have rendered as a narrow, browser-default
  box rather than a full-width field. Fixed (`width: 100%`). Every container
  uses `max-width: 32rem` (well under 375px) and the same
  `flex-wrap` + `@media (max-width: 480px)` stacking pattern Phase 3 already
  established for cart lines. **Not performed:** live resizing and visual
  confirmation in a real browser.
- AC21 (`/checkout` has its own loading boundary and inherits the root
  `error.tsx`): the loading boundary itself is tested
  (`app/checkout/loading.test.tsx`). **Not performed:** the live
  forced-rejection test confirming the root `error.tsx` actually covers the
  nested `/checkout` segment. This was expected, in the plan, to be
  verified live this phase — that did not happen, because the Chrome
  browser tool never connected (see below). ADR-0010's identical open
  assumption for `/cart` remains open too; both are recorded together in
  ADR-0011.
- AC25 (Phase 1/2/3 behaviour intact): the full pre-existing automated suite
  passes unchanged and the total grew from 100 to 190 with zero regressions.
  **Not performed:** a live manual click-through re-confirming the five UI
  commands, the adversarial rejection path, and cart CRUD in a real browser
  — the same gap Phase 3 already carried forward unresolved.

**Why the manual checks did not run:** the Chrome browser automation tool
(`mcp__claude-in-chrome__*`) did not connect — `tabs_context_mcp` reported
"Browser extension is not connected" when checked explicitly, twice, at the
start of sub-phase 4.2, and remained unavailable for the rest of this
phase's implementation. This is the identical gap Phase 3 recorded, for the
identical reason. In its place: static server-rendered HTML was inspected
via `curl` at the end of every sub-phase to confirm structural correctness
(nav present, correct headings per route, the empty-cart guard's markup,
the `role="status"` live regions) on `/`, `/cart`, and `/checkout`. Per
`.claude/rules/validation.md`, this is reported as manual checks **not
executed**, not as a pass — and, per explicit instruction partway through
this phase, curl-based static checks were used as the standing substitute
for the remainder of the work rather than continuing to poll for the
extension.

**Recommendation:** before this feature is treated as fully verified — in
particular before `/review` or `/final-review` sign off on it — perform the
manual checks in this document's "Manual checks" section (items 1–17)
against a running `pnpm --filter web dev`, once the Chrome extension
actually connects. Item 16 (the forced-rejection error-boundary check)
should be prioritized, since it closes an assumption open since Phase 3.

### Carried-in follow-ups (not Phase 4 work)

```text
FOLLOW-UP (not done): docs/features/phase-3-frontend-cart-simulation/test-plan.md —
  Phase 3 manual checks 1–10 (its AC13, AC17, AC18, AC19) were never executed. The
  browser tooling remained unavailable throughout Phase 4 as well (confirmed, not
  assumed) — run all of Phase 3's and Phase 4's outstanding manual checks together
  once it connects — MEDIUM
FOLLOW-UP (not done): repository-wide — no e2e/cross-browser framework; open since
  Phase 2 — MEDIUM
FOLLOW-UP (not done): apps/web/src/lib/fixtures/menu.ts — MenuItem.available is never
  enforced; an unavailable item can be added to the cart and, after this phase, checked
  out (D12) — needs a product decision, and belongs to commerce-api validation — MEDIUM
FOLLOW-UP (not done): apps/web/src/app/page.module.css — known .main/.column width
  arithmetic mismatch, deliberately left open per earlier explicit instruction — LOW
FOLLOW-UP (not done): apps/web/src/components/checkout/CheckoutReview.tsx and
  OrderConfirmation.tsx — the dt/dd detail rows have no word-break/overflow-wrap
  guard against an unusually long, space-free value (e.g. an atypical email address)
  at narrow viewports; the rest of the codebase has never needed this guard either,
  so it was not added unilaterally — LOW
FOLLOW-UP (not done): apps/web/src/components/checkout/CheckoutAnnouncer usage in
  CheckoutFlow.tsx — if a user submits the details form repeatedly with no changes
  in between, only the first identical failure is announced through the live region
  (React bails out on an unchanged state value); a "clear-then-set" announcement
  fix exists but was judged disproportionate to AC9's literal requirement — LOW
FOLLOW-UP (not done, found during /review): AC6/AC23/AC24 and the lib/checkout half
  of AC22 are labeled "automated (script)" in this document and requirements.md, but
  no test file or script actually encodes them — they were one-time manual grep/
  git-status commands run during implementation, not a repeatable check. Extend
  apps/web/src/lib/commands/dispatch.test.ts's existing AC8 test to also check for
  lib/checkout imports, and add a small dedicated boundary test asserting the
  absence of fetch/storage/console calls and tax/fee/tip wording in lib/checkout
  and components/checkout, so these become real regression guards — MEDIUM
FOLLOW-UP (not done, found during /review): apps/web/src/lib/checkout/validation.ts
  stripPhoneFormatting strips spaces, hyphens, and parentheses but not "." — a
  dot-separated phone number (e.g. "555.123.4567") is rejected by validatePhone even
  though it is a common real-world format — LOW
```
