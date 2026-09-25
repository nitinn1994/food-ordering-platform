# Food Ordering — Frontend MVP

**Status:** Sections 1–8 (the original MVP) are implemented — Phase 1, fully
delivered. Section 9 (Phase 2 additions) is implemented. Section 10 (Phase 3
additions) is implemented. Section 11 (Phase 4 additions) is implemented.
Section 12 (Phase 5 additions) is implemented. Section 13 (Phase 7
additions) is implemented.
**Last updated:** 2026-09-25 (Phase 7, sub-phase 7.4)
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

## 12. Phase 5 additions

Sections 1–11 above are the delivered Phase 1 + Phase 2 + Phase 3 + Phase 4
MVP. This section layers Phase 5's scope on top — see
`docs/features/phase-5-contract-foundation/` for the full plan.

Phase 5 is a contracts-only phase. It adds nothing to `apps/web`'s user
journeys, adds no new capability a user can see, and reverses nothing in
§4/§9/§10/§11. Its product-facing purpose is indirect: it defines, ahead of
`apps/ai-service` and `apps/commerce-api` existing, the vocabulary those
services will use to talk to each other and to `apps/web` — so that when
they are built, they are built *against* an interface rather than
inventing one under time pressure.

**Added, entirely inside `packages/contracts/`:**

- A new shared-primitives package, `@contracts/common` — a contract version,
  menu identifiers, quantity and money bounds, correlation and idempotency
  identifiers, an ISO-8601 timestamp, and one structured error shape, used
  by both other contract packages so each rule is defined once.
- `@contracts/ui-commands` hardened: every schema became a strict object (an
  unknown key is now rejected, not silently accepted and discarded), and
  `SearchMenu.query` gained a maximum length — closing a real gap where an
  agent-controlled string had no bound before reaching React state. A batch
  envelope was added so one conversational turn's several UI commands share
  one `contractVersion`/`correlationId`/`issuedAt`, with one malformed
  command dropping without discarding its valid siblings — the "dropped
  and logged" rule in §6 AC4/AC5 above, now also true at the batch level.
- A new `@contracts/agent-intents` package — three business intents,
  `AddItemToCart`, `RemoveItemFromCart`, `SetCartItemQuantity`, each
  mirroring a cart mutation `apps/web` already implements (Phase 3's
  `cartReducer`). Each intent request carries its own idempotency key.
  Nothing about placing an order (`PlaceOrder`) was adopted — see below.
- `apps/web` is now restricted, by ESLint, from importing
  `@contracts/agent-intents` at all. This is enforcement of an existing
  rule (§4.4 of `system-architecture.md`: a business intent is executed by
  `commerce-api`, never rendered by the frontend), not a new one.
- Every contract package now generates and commits a JSON Schema artifact,
  guarded by a test that fails if the committed file drifts from its Zod
  source — the mechanism ADR-0003 promised and this repository did not yet
  have.

**Explicitly declined, not deferred** — three candidates were considered and
rejected, recorded in `docs/api/contracts.md`'s candidate register rather
than silently added or silently dropped:

- **`PlaceOrder` / `CreateOrder`** as a business intent. Its payload would
  need the customer fields Phase 4 admittedly invented with no product
  basis (§11, D4 there) and an idempotency design `system-architecture.md`
  §8 still records as undesigned. Adopting it now would mean encoding two
  known-unsound guesses into a contract three services will depend on.
- **`ClearCart`** as a business intent. ADR-0011 makes `CLEAR_CART` the
  internal mechanism of a placed order only, explicitly not a user-facing
  feature — a `ClearCart` intent would create that feature by the back
  door.
- **`OpenCheckout`** as a UI command. §11 above decided `/checkout` is
  reachable only from a non-empty `/cart`, not from navigation or a chat
  command; an `OpenCheckout` command would reverse that without a new
  product decision to justify it.

One candidate was rejected outright rather than merely declined:
**`ShowOrderConfirmation`** as a UI command. The confirmation screen is
reachable only by having actually placed an order; a command that renders
it would let an agent show a user an order that never happened — the exact
failure §4.3 of `system-architecture.md` (agent output is untrusted input)
exists to prevent, in its most damaging form.

**Still out of scope**, unchanged from §4/§9/§10/§11: everything on the
backend/AI/voice/payments/infra list, and now additionally
`packages/contracts/api-contracts` specifically — no producer
(`commerce-api`) exists yet, so writing its request/response shapes now
would mean guessing at an interface, the same reasoning Phase 1 originally
applied to `agent-intents` itself.

**Known gap, recorded rather than hidden:** whether the JSON Schema this
phase generates actually produces usable Pydantic models for
`apps/ai-service` cannot be verified — that service does not exist. One
specific wrinkle is already known and recorded in
`docs/features/phase-5-contract-foundation/requirements.md`: a discriminated
union is emitted as a plain `oneOf` with no JSON Schema `discriminator`
keyword, so generated Pydantic will be a plain `Union` discriminated by its
`Literal` fields, not a Pydantic tagged union — functional, but with
different error messages than a tagged union would give. This is the first
thing to verify once `apps/ai-service` is scaffolded.

## 13. Phase 7 additions

Sections 1–12 above are the delivered MVP through Phase 6 (NestJS
commerce-api foundation, which added nothing to this document — it built no
domain and changed no product-facing capability). Phase 7 layers a
read-only Menu domain onto `apps/commerce-api` — see
`docs/features/phase-7-menu-domain/` for the full plan.

Like Phase 5, Phase 7 adds nothing to `apps/web`'s user journeys and
reverses nothing in §4/§9/§10/§11: `apps/web` still reads
`src/lib/fixtures/menu.ts`, unchanged, and no route or component in
`apps/web` was touched. Its relevance to this document is indirect but
real: §7 item 1 names "fixture menu data → replaced by `commerce-api` menu
reads" as temporary scaffolding, and Phase 7 is the first phase that gives
that replacement somewhere to land.

**Added, entirely inside `apps/commerce-api` and a new contracts package:**

- `GET /v1/menu` and `GET /v1/menu/items/:itemId` — the first real domain
  routes commerce-api exposes, following the layering ADR-0013 §8 reserved
  in advance (controller → service → repository interface, only
  `infrastructure/` touching storage).
- A new `@contracts/api-contracts` package, whose `menuResponseSchema` and
  `menuItemResponseSchema` are, deliberately, the same shape as
  `apps/web`'s existing `MenuItem`/`MenuCategory` fixture types plus one
  addition (`categoryId` on each item) — so a future phase that switches
  `apps/web` from the fixture to this API changes one module
  (`src/lib/menu/menuSource.ts`'s `getMenu()`), not every component that
  reads a `MenuItem`.
- An in-memory `MenuRepository`, seeded from a copy of the same fixture
  data (`apps/commerce-api` may not import `apps/web`, by the ESLint
  boundary ADR-0013 added — see ADR-0014). This is a second, temporary copy
  of the menu, not a shared one, until the switch above happens and the
  original fixture is deleted.

**Explicitly declined, not deferred:** a `GET /v1/menu/categories` route and
server-side query filtering — recorded in
`docs/features/phase-7-menu-domain/requirements.md`, declined because
nothing in the product needs either yet (`apps/web`'s own `filterMenu`
already does this client-side, over six items).

**Still out of scope**, unchanged from §4/§9/§10/§11/§12: switching
`apps/web` to call the new API (a separate phase — CORS and a frontend
change are both still undone), enforcing `MenuItem.available` anywhere (the
API returns it as a flag, the same as the fixture always has; nothing
rejects an unavailable item), and everything on the backend/AI/voice/
payments/infra list Phase 5's §4 already named.

**Known gap, recorded rather than hidden:** whether `apps/web` can actually
be pointed at `GET /v1/menu` without a shape mismatch is not yet
proven — `apps/web` was not touched this phase, so this is inferred from
the schemas matching, not from an integration having been run.

## 14. Phase 8 additions

Phase 8 adds a Cart domain to `apps/commerce-api`. See
`docs/features/phase-8-cart-domain/` for the full plan and ADR-0015 for the
decisions. Like Phases 5–7, it adds nothing to `apps/web`'s user journeys
and reverses nothing in §4/§9/§10/§11. `apps/web` still keeps its cart in
`src/lib/state/cartStore.tsx` and prices it in `src/lib/cart/pricing.ts`,
unchanged, and no route or component in `apps/web` was touched.

Its relevance here is §7 items 2 and 3 (client-side cart state and
client-side totals). Phase 8 is the first phase that gives both a backend
replacement to move to. **Both remain temporary and both remain in use.**
Nothing calls the Cart API yet.

**Added, entirely inside `apps/commerce-api` and `@contracts/api-contracts`:**

- `GET /v1/cart`, `POST /v1/cart/items`, `PATCH /v1/cart/items/:itemId`,
  and `DELETE /v1/cart/items/:itemId`, the executors of the three Phase 5
  intents (`AddItemToCart`, `SetCartItemQuantity`, `RemoveItemFromCart`).
- The Phase 3 cart rules, now enforced by the backend: one line per item, a
  repeated add merges, a 99 cap per line (rejected rather than clamped when
  a merge would exceed it), Remove as the only way to delete a line, and
  item count as the sum of quantities.
- **`MenuItem.available` is now enforced**, by the backend only: an
  unavailable item cannot be added or re-quantified. §13 recorded this as
  unenforced anywhere. `apps/web` still enforces it only by disabling the
  button.
- Backend pricing that matches `pricing.ts`'s formulas (line = unit ×
  quantity, subtotal = Σ lines), computed from the menu's *current* price on
  every read. There is no tax, fee, tip, or discount, unchanged from §10.

**Explicitly declined, not deferred:** `DELETE /v1/cart` (a general "empty
my cart"). ADR-0011 made clearing the internal mechanism of a placed order,
not a user-facing feature. Phase 8 keeps that decision, with a service-level
`clearCart` for the Order phase and no route.

**Still out of scope**, unchanged from §4/§9/§10/§11/§12/§13: switching
`apps/web` to the Cart or Menu API (which needs CORS and a frontend change),
cart persistence across a server restart (the cart is in-memory), more than
one cart (the system is single-user, so every caller shares one cart), an
Order domain, and everything on the backend/AI/voice/payments/infra list.

**Known gap, recorded rather than hidden:** a retried "add to cart"
request adds twice, because there is no idempotency key yet
(`system-architecture.md` §8 gap 3). This does not matter while nothing
calls the API, but it has to be resolved before a retrying caller (the AI
service, or a flaky network path from `apps/web`) is wired in.
