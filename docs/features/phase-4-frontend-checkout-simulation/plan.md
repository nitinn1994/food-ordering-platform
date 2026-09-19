# Plan — Phase 4: Frontend Checkout Simulation

**Approval Status:** APPROVED (nitin, 2026-09-19; D1–D12 confirmed "all as
recommended")

## Approach

Build the checkout as a thin UI layer over a pure domain core, and add nothing
to the money model. Everything the checkout knows about prices comes from
`lib/cart/pricing.ts` — the same two functions `/cart` already calls — so the
number on the checkout screen is provably the number in the cart, and the
temporary client-side pricing violation (`food-ordering-frontend-mvp.md` §7
item 3) grows no larger than it already is.

The domain core lands first and alone: `lib/checkout/` holds types, a validator,
an order-snapshot builder, an order-id generator, and the step-machine reducer,
all pure and all unit tested before a single component renders. This mirrors
Phase 3.1, which proved the cart reducer and pricing before touching UI, and it
means the riskiest logic in the phase — the order snapshot and the transition
rules — is verified without any rendering in the way.

The route follows `/cart` exactly: an async Server Component that awaits
`getMenu()` and prop-drills `categories` down, with a sibling `loading.tsx` and
no local `error.tsx` (the root one is inherited, per ADR-0010). Checkout state
is a `useReducer` local to one client component. It is deliberately **not** put
in `uiStore`, which is documented as state that survives into the real system,
and **not** in `cartStore`, which ADR-0010 decoupled down to lines and
mutations. Checkout state is throwaway, and its scope should say so.

The one structural change outside `lib/checkout/` and `components/checkout/` is
a `CLEAR_CART` action on `cartStore`, needed because a confirmed order must
empty the cart (D6). Phase 3 listed "clear cart" as out of scope, so this is a
deliberate, approved reversal rather than a drive-by addition.

No UI command, contract, or `dispatch.ts` change is needed or made. Placing an
order is a business intent (`system-architecture.md` §4.4); routing it through
the validated-command pipeline would give the agent a write path to commerce
state, which is the exact failure §4.4 exists to prevent.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `apps/web/src/lib/checkout/types.ts` | new | `CheckoutStep`, `CheckoutState`, `CustomerDetails`, `CustomerDetailsErrors`, `SimulatedOrder`, `SimulatedOrderLine` |
| `apps/web/src/lib/checkout/validation.ts` | new | `validateCustomerDetails` + per-field rules, pure, no dependency |
| `apps/web/src/lib/checkout/validation.test.ts` | new | Every rule, incl. whitespace-only and length boundaries |
| `apps/web/src/lib/checkout/orderId.ts` | new | `createOrderId(random?)` — injectable source for determinism |
| `apps/web/src/lib/checkout/orderId.test.ts` | new | Format `ORD-[A-Z0-9]{6}`; deterministic under an injected source |
| `apps/web/src/lib/checkout/order.ts` | new | `buildSimulatedOrder` — TEMPORARY header comment |
| `apps/web/src/lib/checkout/order.test.ts` | new | Snapshot shape, `totalCents === subtotalCents`, unresolvable-line drop, immutability |
| `apps/web/src/lib/checkout/checkoutReducer.ts` | new | The step machine, separated from the component |
| `apps/web/src/lib/checkout/checkoutReducer.test.ts` | new | Every transition, incl. no second submit from `submitting` |
| `apps/web/src/app/checkout/page.tsx` | new | Async Server Component; awaits `getMenu()` |
| `apps/web/src/app/checkout/page.module.css` | new | Route layout, responsive |
| `apps/web/src/app/checkout/loading.tsx` | new | Route loading boundary (mirrors `app/cart/loading.tsx`) |
| `apps/web/src/app/checkout/loading.test.tsx` | new | Mirrors `app/cart/loading.test.tsx` |
| `apps/web/src/components/checkout/CheckoutFlow.tsx` | new | Owns the reducer; guard ordering; step switch |
| `apps/web/src/components/checkout/CheckoutFlow.module.css` | new | Flow-level layout |
| `apps/web/src/components/checkout/CheckoutFlow.test.tsx` | new | Guard ordering, step transitions, cart clear, end-to-end within one tree |
| `apps/web/src/components/checkout/EmptyCheckoutNotice.tsx` | new | Empty-cart guard UI |
| `apps/web/src/components/checkout/EmptyCheckoutNotice.test.tsx` | new | Message + link, no form/total/submit in the DOM |
| `apps/web/src/components/checkout/FormField.tsx` | new | One place for `htmlFor`/`id`/`aria-invalid`/`aria-describedby` wiring |
| `apps/web/src/components/checkout/FormField.module.css` | new | Field + error styling |
| `apps/web/src/components/checkout/FormField.test.tsx` | new | Label association, error wiring, valid/invalid states |
| `apps/web/src/components/checkout/CustomerDetailsForm.tsx` | new | The form, error summary, focus management |
| `apps/web/src/components/checkout/CustomerDetailsForm.module.css` | new | Form layout, ≥44px controls |
| `apps/web/src/components/checkout/CustomerDetailsForm.test.tsx` | new | Validation UI, value preservation, error clearing, focus |
| `apps/web/src/components/checkout/OrderSummary.tsx` | new | Read-only lines + total; props only, never `useCart` |
| `apps/web/src/components/checkout/OrderSummary.module.css` | new | Line layout, 480px stacking |
| `apps/web/src/components/checkout/OrderSummary.test.tsx` | new | Renders from live lines and from a snapshot identically |
| `apps/web/src/components/checkout/CheckoutReview.tsx` | new | Details recap + summary + edit links + "Place order" |
| `apps/web/src/components/checkout/CheckoutReview.module.css` | new | Review layout |
| `apps/web/src/components/checkout/CheckoutReview.test.tsx` | new | Recap content, edit paths, submit control |
| `apps/web/src/components/checkout/OrderConfirmation.tsx` | new | Order id, placed-at, recap, summary, simulation notice |
| `apps/web/src/components/checkout/OrderConfirmation.module.css` | new | Confirmation layout |
| `apps/web/src/components/checkout/OrderConfirmation.test.tsx` | new | Id format, snapshot rendering, simulation notice, back link |
| `apps/web/src/components/checkout/CheckoutAnnouncer.tsx` | new | `role="status"` `aria-live="polite"`, checkout messages only |
| `apps/web/src/components/checkout/CheckoutAnnouncer.module.css` | new | Visually-hidden region (mirrors `CartAnnouncer.module.css`) |
| `apps/web/src/components/checkout/CheckoutAnnouncer.test.tsx` | new | Announces validation failure and order placed, politely |
| `apps/web/src/lib/state/cartStore.tsx` | modified | Add `CLEAR_CART` + `clearCart()`; update TEMPORARY comment |
| `apps/web/src/lib/state/cartStore.test.ts` | modified | `CLEAR_CART` from populated and from empty |
| `apps/web/src/components/cart/CartList.tsx` | modified | "Proceed to checkout" link, non-empty branch only |
| `apps/web/src/components/cart/CartList.test.tsx` | modified | Link present when non-empty, absent when empty |
| `docs/product/food-ordering-frontend-mvp.md` | modified | New §11; fourth §7 temporary item (client-side order creation) |
| `docs/architecture/architecture-decisions.md` | modified | New ADR-0011 |
| `docs/development/getting-started.md` | modified | Current state, `/checkout`, layout, verified commands |
| `docs/features/phase-4-frontend-checkout-simulation/test-plan.md` | modified | Finalised with actual results in 4.5 |

Not modified: anything under `packages/contracts/`, `lib/commands/*`,
`lib/state/uiStore.tsx`, `lib/menu/*`, `lib/money.ts`, `lib/cart/pricing.ts`,
`lib/fixtures/menu.ts`, `app/layout.tsx`, `app/page.tsx`, `app/cart/*`, and
every file under `components/menu/`, `components/chat/`, `components/dev/`,
`components/nav/`.

## Phases

### Phase 4.1 — Checkout domain layer (no UI change)
- [ ] `lib/checkout/types.ts` — the six types, no behaviour
- [ ] `lib/checkout/validation.ts` — `validateCustomerDetails`; name required
      ≤100 chars, phone required and 7–20 chars of digits after stripping
      spaces/hyphens/parens/leading `+`, email optional but shaped if present
- [ ] `lib/checkout/orderId.ts` — `createOrderId(random = Math.random)`
- [ ] `lib/checkout/order.ts` — `buildSimulatedOrder(lines, categories,
      details, orderId, placedAt)`; drops unresolvable lines; sets
      `totalCents = subtotalCents` on an explicit commented line
- [ ] `lib/checkout/checkoutReducer.ts` — `SET_FIELD`, `SUBMIT_DETAILS`,
      `EDIT_DETAILS`, `PLACE_ORDER`, `ORDER_PLACED`
- [ ] Add `CLEAR_CART` to `cartReducer` and `clearCart()` to the context value;
      update the TEMPORARY header comment
- [ ] Tests: `validation.test.ts`, `orderId.test.ts`, `order.test.ts`,
      `checkoutReducer.test.ts`, extended `cartStore.test.ts`
- **Done when:** AC5, AC6, AC13 (reducer half), AC14 (format), AC15 (snapshot
  immutability) and AC26 (comments) hold in pure unit tests; nothing renders
  yet; the pre-existing suite is unchanged and still passes.

### Phase 4.2 — Route, empty-cart guard, step skeleton (isolated, highest structural risk)
- [ ] `app/checkout/page.tsx`, `page.module.css`, `loading.tsx`,
      `loading.test.tsx`
- [ ] `CheckoutFlow` — reducer wired, guard ordering (`confirmed` checked
      **before** `lines.length === 0`), step switch with placeholder steps
- [ ] `EmptyCheckoutNotice`
- [ ] "Proceed to checkout" link in `CartList`'s non-empty branch; update
      `CartList.test.tsx`
- [ ] Verify live that the root `error.tsx` covers the nested `/checkout`
      segment; add `app/checkout/error.tsx` only if it does not
- **Done when:** AC1, AC2, AC3 and AC21 hold; `pnpm turbo run build` prerenders
  `/checkout`; a manual Phase 1–3 regression confirms nothing else moved.
  **Checkpoint — nothing in 4.3 starts until that regression pass is
  confirmed.**

### Phase 4.3 — Customer details form and validation UI
- [ ] `FormField` — label association and error wiring in one place
- [ ] `CustomerDetailsForm` — three fields, `autoComplete` hints, correct
      `type`/`inputMode`, submit and "Back to cart"
- [ ] Error summary above the form; focus moved to it on failed submit; errors
      re-validated per keystroke once `submitAttempted` is true
- [ ] `CheckoutAnnouncer`; announce validation failure politely
- [ ] Tests: `FormField.test.tsx`, `CustomerDetailsForm.test.tsx`,
      `CheckoutAnnouncer.test.tsx`
- **Done when:** AC7–AC10 hold.

### Phase 4.4 — Review, submission, confirmation
- [ ] `OrderSummary` — props only; used by both review and confirmation
- [ ] `CheckoutReview` — details recap, summary, "Edit details", "Back to
      cart", "Place order"
- [ ] Submit path: `PLACE_ORDER` → control `disabled` → `buildSimulatedOrder` →
      `ORDER_PLACED` → `clearCart()` → announce
- [ ] `OrderConfirmation` — order id, placed-at, recap, summary, simulation
      notice, "Back to the menu"
- [ ] Tests: `OrderSummary.test.tsx`, `CheckoutReview.test.tsx`,
      `OrderConfirmation.test.tsx`, `CheckoutFlow.test.tsx`
- **Done when:** AC4, AC11–AC18 hold; manual Flows A–F pass.

### Phase 4.5 — Accessibility, responsive, documentation
- [ ] Keyboard-only completion of the whole flow; focus verified at all three
      transitions
- [ ] Accessibility-tree review: labels, `aria-invalid`/`aria-describedby`,
      heading order, control names, live-region behaviour
- [ ] 375 / 768 / 1280px checks; ≥44×44px tap targets
- [ ] Boundary greps for AC22, AC23, AC24
- [ ] `food-ordering-frontend-mvp.md` §11 + fourth §7 temporary item
- [ ] ADR-0011 in `architecture-decisions.md`
- [ ] `getting-started.md` current state, route, layout, verified commands
- [ ] Finalise `test-plan.md` with actual results and any follow-ups
- **Done when:** AC19, AC20, AC22–AC26 hold; the full validation set exits 0;
  `/review` can proceed.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| Phase 4 contradicts the authority model — `system-architecture.md` §5 makes order state `commerce-api`'s, §4.4 makes `PlaceOrder` a business intent, and this frontend mints an order id | High | Not hidden: ADR-0011 records it as a knowing, temporary violation with a named replacement, the same treatment §7 item 3 gives client-side pricing. All order construction is confined to `lib/checkout/order.ts` with a TEMPORARY header; nothing outside `components/checkout/` may import `SimulatedOrder` |
| The product doc excludes checkout in §4, §9 and §10 | High | Approved reversal, amended in §11 and recorded in ADR-0011 — the treatment ADR-0010 gave the `/cart` route, not a silent override |
| Inventing product requirements that no document supports | High | Twelve open decisions were posed before any code was planned and confirmed point-by-point at approval; D4 (customer fields) is recorded in `requirements.md` as invented and is the first thing to revisit against real requirements |
| Customer PII enters the codebase for the first time | Medium | AC24 makes "details never reach storage, network, or a log" a checked criterion, verified by `grep`, not an intention. No persistence, no analytics, no `console.*` |
| The confirmation/empty-guard ordering bug — clearing the cart on success trips the empty guard and blanks the confirmation | Medium | Identified up front as the likeliest defect in the phase; the `confirmed`-before-empty check ordering and the immutable snapshot both exist to prevent it; AC15 tests it directly |
| `CLEAR_CART` reverses a Phase 3 exclusion | Medium | Approved as D6. Confined to one reducer case and one context method; no "clear cart" button is added to the cart UI |
| Client-side pricing (§7 item 3) becomes more entrenched as a second surface shows money | Medium | No new pricing code — checkout calls `lineSubtotalCents`/`cartSubtotalCents` only. `totalCents = subtotalCents` is an explicit commented line, so the point where real pricing will diverge is visible |
| Scope creep toward a real checkout — payment fields, addresses, order history all feel natural here | Medium | Each is named in `requirements.md` § Out of scope; any of them entering scope re-triggers `/forge` and classifies HIGH |
| Step-machine state grows unmanageable inside a component | Low | Reducer extracted to `lib/checkout/checkoutReducer.ts` and unit tested independently, the pattern `cartReducer`/`uiReducer` already set |
| RTL cannot drive the real Next.js router across `/cart → /checkout` | Low | Same known limitation as Phase 3 AC13: component tests cover the flow within one render tree; the cross-route click-through is a manual browser check, and the browser tooling is available this phase |
| Order id or `placedAt` nondeterminism breaks SSR or tests | Low | Both are produced inside the submit event handler, never during render; `createOrderId` takes an injectable random source |

## Assumptions

- **Not verified:** that a root `app/error.tsx` covers a nested route segment
  without that segment having its own `error.tsx`. Inherited from ADR-0010,
  where it was also unverified. `/checkout` relies on it and AC21 will confirm
  or refute it live; if refuted, `app/checkout/error.tsx` is a small isolated
  addition and `app/cart/error.tsx` becomes a follow-up.
- **Verified by inspection:** `CartProvider` and `UiProvider` are mounted in
  `app/layout.tsx`, so cart state is already available on `/checkout` with no
  provider change — read directly from `apps/web/src/app/layout.tsx`.
- **Verified by inspection:** `apps/web` has no form library, no validation
  library, and no `zod` dependency (only `@contracts/ui-commands` depends on
  `zod`); the only existing form, `ChatInput`, is hand-rolled `useState`. Hand
  written validators therefore match the existing pattern and need no new
  dependency.
- **Verified for Phase 2 and Phase 3, assumed to extend:** the existing Vitest +
  jsdom + Testing Library setup handles these component tests with no config
  change (ADR-0008's three fixes are global).
- **Not verified:** that the Chrome browser automation tooling stays connected
  for the duration of implementation. It is connected now, unlike throughout
  Phase 3. If it drops, the manual checks are reported as not executed — never
  as passing — and Phase 3's gap simply repeats, recorded honestly.
- **Assumed from the approved decisions:** that losing a confirmed order on page
  reload is acceptable, since D6 forbids persistence and the confirmation is
  in-session state. The confirmation screen says so in plain language (AC17).

## Not doing

- Any change to `packages/contracts/`, `dispatch.ts`, `simulate.ts`, or
  `uiStore.tsx`.
- Any network call, route handler, or server action.
- Any payment field, including a fake one.
- Any persistence of cart, form, or order.
- Tax, fees, tips, discounts, promo codes, delivery/pickup selection, or
  address fields.
- Editing quantities at checkout; order history, tracking, status, cancel,
  re-order, receipt or email.
- Enforcing `MenuItem.available` at checkout (follow-up).
- A simulated failure path or simulated submission latency.
- Phase 3's outstanding manual checks (follow-up).
- Fixing the known `.main`/`.column` CSS arithmetic mismatch.
- Adding an e2e/cross-browser framework.
- Any backend, AI, voice, NestJS, auth, real payment, or infrastructure work.
- Committing, pushing, merging, or deploying.

## Specialised review needed?

Standard Path — informational only.

- security: no, with one note. There is no new input trust boundary: form input
  is trusted first-party input, not parsed external data, and nothing is
  transmitted, stored, or logged. The note is that this is the first code in
  the repository to hold customer PII at all, which is why AC24 exists as a
  checked criterion rather than an assumption. If any future phase transmits or
  persists these fields, that phase needs a security review.
- performance: no — small in-memory arrays, no queries, no network calls, no
  new rendering hot path.
- data / migration: no — no persistence, no schema, no migration. The
  `SimulatedOrder` shape is a frontend-local type, deliberately not a contract,
  and must not be treated as one when `api-contracts` is written.
