# Food Ordering — Frontend MVP

**Status:** Sections 1–8 (the original MVP) are implemented — Phase 1, fully
delivered. Section 9 (Phase 2 additions) is implemented. Section 10 (Phase 3
additions) is implemented. Section 11 (Phase 4 additions) is implemented.
**Last updated:** 2026-09-19 (Phase 4, sub-phase 4.5)
**Related:** [`system-architecture.md`](../architecture/system-architecture.md) ·
[`phase-0-discovery.md`](../architecture/phase-0-discovery.md) ·
[`architecture-decisions.md`](../architecture/architecture-decisions.md)

> This document derives the MVP scope from `CLAUDE.md`. `CLAUDE.md` remains the
> specification of record; where the two disagree, `CLAUDE.md` wins and this
> file is wrong.

---

## 1. Goal

Prove the **UI command pipeline** — the riskiest cross-cutting mechanism in the
system — with the smallest possible surface, before any real backend, AI model,
or voice provider exists.

Everything else in the MVP exists to make that pipeline observable.

## 2. Why frontend-first

`CLAUDE.md` states the first milestone is frontend-first and simulation-first.
The reasoning worth restating: the boundary most likely to be got wrong is the
one where untrusted agent output meets the rendered UI. Building the backend
first would leave that boundary untested until late, when it is expensive to
change. Building the frontend against simulated commands tests it on day one.

## 3. In scope

| # | Capability | Notes |
| - | ---------- | ----- |
| 1 | Browse a simulated menu | Local fixture data in `apps/web`. No backend call. Clearly marked as fixture, in one module, easy to delete. |
| 2 | Add and remove cart items by touch | Cart state is local and **explicitly temporary** — it moves to `commerce-api` the moment that service exists. Documented as throwaway so nobody builds on it. |
| 3 | View a cart with line items and a total | Total computed locally *only because there is no backend yet*. This is the one place the MVP knowingly violates the authority model, and it must carry a comment saying so. |
| 4 | Text chat input | Produces simulated, hardcoded command sequences. No AI, no network call. |
| 5 | Validated UI command execution | The real deliverable. Commands are parsed against a Zod discriminated union from `packages/contracts/ui-commands`; unknown types are dropped and logged, never rendered. |
| 6 | A visible log of accepted and rejected commands | A development-only panel. Makes the allowlist's behaviour observable, which is what turns this from a claim into a demonstration. |

Minimum viable command set for #5 — three is enough to prove the pattern:
`ShowMenuCategory`, `HighlightItem`, `OpenCartPanel`.

## 4. Out of scope

Explicitly deferred, per `CLAUDE.md`:

- Real AI model integration — chat responses are hardcoded.
- Real voice provider, and any voice surface at all (ADR-0007).
- Real payments, and any checkout flow.
- Production authentication — single-user assumption.
- `apps/commerce-api` and `apps/ai-service` — neither is created in this MVP.
- Any database, real or simulated-behind-an-API.
- Docker, Kubernetes, deployment, tracing, multi-region.
- `agent-intents` and `api-contracts` schemas — no consumer exists yet, so
  writing them would mean guessing at interfaces.

## 5. User journeys

**Touch:** open the app → see the menu → tap an item → see it in the cart with
an updated total → remove it → total updates.

**Text:** type "show me the desserts" → a hardcoded `ShowMenuCategory` command
is produced → validated → the menu filters to desserts → the command appears in
the development log as accepted.

**Adversarial (the one that matters):** a deliberately malformed or
unrecognised command is injected → it is rejected → nothing renders → the
rejection appears in the development log. This journey is the MVP's actual
acceptance test.

## 6. Acceptance criteria

Written so each can be answered yes or no:

1. The menu renders from fixture data with no network request.
2. Tapping an item adds it to the cart; the line item and total both update.
3. A valid `ShowMenuCategory` command filters the menu to that category.
4. A command with an unrecognised `type` is not rendered, and is recorded as
   rejected in the development log.
5. A command with a recognised `type` but a malformed payload is rejected, not
   partially applied.
6. No code path in `apps/web` calls `eval`, `new Function`, or passes
   command-derived content to `dangerouslySetInnerHTML`.
7. `packages/contracts/ui-commands` is importable by `apps/web` through the
   workspace, not by relative path.

Criterion 4 and 5 are the ones worth failing the phase over.

## 7. Explicitly temporary

Four things in this MVP are scaffolding to be deleted, and each must say so in
its own source file:

1. Fixture menu data → replaced by `commerce-api` menu reads.
2. Client-side cart state → replaced by `commerce-api` cart ownership.
3. Client-side total calculation → replaced by backend-authoritative pricing.
4. Client-side simulated order creation (Phase 4) → replaced by
   `commerce-api` order creation, identity, and persistence. See
   [ADR-0011](../architecture/architecture-decisions.md#adr-0011--a-simulated-frontend-checkout-that-knowingly-violates-the-order-state-authority-model).

The risk this section exists to manage: temporary state that stops being
temporary. Items 3 and 4 in particular contradict the authority model, and the
longer they live the more code depends on the client knowing how to price
things and mint order identities that were never validated by a backend.

## 8. Open product questions

1. **Menu shape.** Categories, modifiers, variants, combos? The fixture's
   shape becomes the de facto contract for the real menu API, so this is worth
   ten minutes now rather than a migration later.
2. **What does the chat do when it does not understand?** Even hardcoded, the
   MVP needs an answer, because "the agent produced nothing usable" is the
   common case in production and the UI should already have a shape for it.
3. **Does the development command log ship?** Useful in demos, and a plausible
   debugging surface later. If it ships, it needs a real home rather than being
   quietly promoted from a dev tool.

## 9. Phase 2 additions

Sections 1–8 above are the delivered Phase 1 MVP, left as written for the
historical record. This section layers Phase 2's approved scope on top —
see `docs/features/phase-2-menu-browsing/` for the full plan.

**Added to in-scope:**

- Search/filter within the existing menu (category + text query, AND
  semantics).
- An inline (non-modal) item detail panel, reachable by touch and by two new
  UI commands: `ShowItemDetail`, `SearchMenu`.
- Richer, **display-only** fixture fields (dietary tags, allergens, calories,
  longer description) — not price-affecting, so the pricing violation in §7
  does not grow.
- Real loading and error states, via an async `getMenu()` seam that becomes
  the single point `commerce-api` integration will later change.

**Explicitly declined, not deferred:** restaurant discovery, or any
`Restaurant` entity. See
[ADR-0009](../architecture/architecture-decisions.md#adr-0009--single-restaurant-scope-no-restaurant-entity)
— this was a live proposal for Phase 2 that was rejected because no approved
document ever specified it, and because it would silently turn a
single-restaurant ordering app into a marketplace.

**Still out of scope**, unchanged from §4: modifiers/variants/combos (would
compound the §7 pricing violation), routing/deep links, and everything on
the backend/AI/voice/payments/infra list.

## 10. Phase 3 additions

Sections 1–9 above are the delivered Phase 1 + Phase 2 MVP. This section
layers Phase 3's scope on top — see
`docs/features/phase-3-frontend-cart-simulation/` for the full plan.

**Added to in-scope:**

- Full frontend-only cart CRUD: increase quantity (in-cart "+", same path as
  adding from the menu), decrease quantity (in-cart "−", floors at 1 —
  Remove is the only path to deleting a line), and a quantity cap (99 per
  line) as frontend validation.
- Per-line and cart subtotals, and a cart item count (sum of quantities,
  shown in site navigation and in a compact menu-page summary).
- A real `/cart` route, reachable via site navigation from the menu page and
  back. See
  [ADR-0010](../architecture/architecture-decisions.md#adr-0010--a-real-cart-route-with-providers-hoisted-to-the-root-layout)
  for why this narrows, rather than reverses, §9's "no routing" boundary.
- Cart state now survives navigating between `/` and `/cart` — `UiProvider`
  and `CartProvider` moved from `page.tsx` to the root layout as part of the
  same change.
- A polite (`aria-live="polite"`) live-region announcement on cart changes,
  and a brief visual highlight on a changed line in place of any fabricated
  loading state — cart mutations are synchronous local state with no real
  latency to represent.
- Empty-cart states (menu summary and `/cart`), accessible quantity controls
  (named per item, correct `disabled` semantics, ≥44px tap targets), and a
  responsive stack below ~480px.

**Explicitly still temporary, unchanged from §7:** items 2 and 3 (client-side
cart state and its pricing) are more complete after Phase 3, not less
temporary — they still exist only because `commerce-api` does not yet.
`cartStore.tsx` holds only lines and mutations; all pricing math lives in the
new `lib/cart/pricing.ts`, a small, deletable, pure module, specifically so
replacing it with `commerce-api` responses later is a contained change.

**Still out of scope**, unchanged from §4/§9 except where narrowed above:
modifiers/variants/combos, deep-linkable **item** URLs (the item-detail
panel is still inline), tax/fees/tips/discounts/any total beyond a subtotal,
cart persistence across a page reload, "clear cart", checkout of any shape,
and everything on the backend/AI/voice/payments/infra list.

**Known gap, recorded rather than hidden:** the interactive manual
verification this kind of UI change would normally get (clicking through
the cart, confirming live-region announcements, checking behavior at
375/768/1280px, and directly observing cross-route persistence) could not
be performed — the Chrome browser automation tool was unavailable for the
entirety of Phase 3's implementation. What stands in its place: 98 automated
tests (Vitest + React Testing Library, which does exercise clicks and state
transitions within a render tree) and static server-rendered HTML checks via
`curl`. This is not equivalent to driving a real browser, and should be
treated as the first thing to verify before this phase is considered fully
proven.

## 11. Phase 4 additions

Sections 1–10 above are the delivered Phase 1 + Phase 2 + Phase 3 MVP. This
section layers Phase 4's scope on top — see
`docs/features/phase-4-frontend-checkout-simulation/` for the full plan.

This section **reverses** part of §4's, §9's, and §10's exclusion of
checkout — those sections listed "checkout of any shape" as out of scope.
Phase 4 adds a frontend-only checkout *simulation*, deliberately and
knowingly, recorded here and in
[ADR-0011](../architecture/architecture-decisions.md#adr-0011--a-simulated-frontend-checkout-that-knowingly-violates-the-order-state-authority-model)
rather than silently. It does not reverse anything else in §4/§9/§10:
real payments, real order creation, tax/fees/delivery, and everything on
the backend/AI/voice/infra list remain out of scope, unchanged.

**Added to in-scope:**

- A `/checkout` route, reachable from `/cart`'s non-empty state only (not
  from site navigation or the menu-page cart summary), using the same async
  Server-Component + `loading.tsx` shape `/cart` already established.
- A client-side checkout step machine — `details → review → submitting →
  confirmed` — in `lib/checkout/checkoutReducer.ts`, entirely separate from
  `cartStore`'s and `uiStore`'s state, and not added to either.
- A hand-rolled customer-details form (full name and phone required, email
  optional — a recommendation invented for this phase, since no product
  document defines what a customer must provide), with inline validation,
  an error summary that receives focus on a failed submit, and per-keystroke
  revalidation once a submit has failed.
- A review step showing the entered details alongside an order summary that
  reuses `lib/cart/pricing.ts` exclusively — no new pricing concept is
  introduced, and the order total is exactly the cart subtotal (no tax,
  fee, tip, or discount).
- A single-submit guard (a genuinely `disabled` "Place order" control while
  `submitting`), a locally generated mock order reference (`ORD-XXXXXX`),
  and an immutable order snapshot taken at the moment of submission.
- Clearing the cart on a successful submission (a new `CLEAR_CART` action on
  `cartStore` — Phase 3 explicitly excluded "clear cart"; this reverses that
  exclusion for this one, specific purpose, not as a general cart feature).
- A confirmation screen that states in plain language that the order is
  simulated, nothing was sent to a restaurant, and no payment was taken.
- Explicit focus management at all three step transitions (details→review,
  review→confirmed, and a failed submit→its error summary), so keyboard
  focus is never silently left on a control that has just unmounted.
- A second, checkout-scoped polite live region (`CheckoutAnnouncer`),
  deliberately separate from `CartAnnouncer`, which stays cart-count only.

**Explicitly declined, not deferred** — twelve open decisions (D1–D12) were
posed before implementation and answered by the human, recorded in
`docs/features/phase-4-frontend-checkout-simulation/requirements.md`: no
delivery/pickup selection, no address fields, no tax/fees/tips/discounts, no
simulated submission latency, no simulated failure/decline path, and no
enforcement of `MenuItem.available` at checkout (the fixture already carries
this flag, but nothing reads it yet — recorded as a follow-up). None of
these were invented as requirements; each is recorded as either an explicit
exclusion or, for the one genuinely invented element (which customer fields
to ask for), an admitted recommendation rather than a specification.

**Still out of scope**, unchanged from §4/§9/§10 except where narrowed
above: real payments, real order creation, order history/tracking/status,
cart or order persistence across a reload, "clear cart" as a general user
feature (`CLEAR_CART` exists only as the internal mechanism a placed order
uses), modifiers/variants/combos, and everything on the backend/AI/voice/
infra list.

**Known gap, recorded rather than hidden:** the interactive manual
verification this kind of UI change would normally get (clicking through
the full checkout flow, confirming live-region announcements and focus
behaviour with a real screen reader, and checking layout at
375/768/1280px) could not be performed — the Chrome browser automation tool
did not connect when checked explicitly at the start of sub-phase 4.2 (twice)
and remained unavailable for the rest of Phase 4's implementation. What
stands in its place: 174 automated tests (Vitest + React Testing Library,
which does exercise clicks, real DOM tab order, and focus assertions within
a render tree) and static server-rendered HTML checks via `curl`. This is
the same substitution Phase 3 made for the same reason, and it carries the
same caveat: it is not equivalent to driving a real browser, and should be
the first thing verified before this phase is considered fully proven.
