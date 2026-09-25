# Architecture Decisions

A single running record of the decisions that shape this system, why they were
made, and what they cost.

**Status vocabulary**

| Status | Meaning |
| ------ | ------- |
| `Accepted` | Decided by a human. Binding. Changing it requires a new ADR that supersedes this one. |
| `Proposed` | A recommendation with rationale. **Not binding.** Nothing should be built on it until a human accepts it. |
| `Superseded` | Replaced. The replacement is named. |

> Decisions marked `Proposed` below were *not* approved — they are recorded so
> the open questions live somewhere rather than being forgotten. Do not treat
> a `Proposed` ADR as permission.

**Index**

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](#adr-0001--monorepo-with-three-applications-and-a-shared-contracts-package) | Monorepo with three applications and a shared contracts package | Accepted |
| [0002](#adr-0002--pnpm-workspaces--turborepo-for-the-typescript-graph) | pnpm workspaces + Turborepo for the TypeScript graph | Accepted |
| [0003](#adr-0003--zod-as-contract-source-of-truth-pydantic-generated-for-python) | Zod as contract source of truth, Pydantic generated for Python | Accepted |
| [0004](#adr-0004--simulate-the-database-behind-a-repository-interface) | Simulate the database behind a repository interface | Proposed |
| [0005](#adr-0005--refetch-after-mutation-for-frontend-freshness) | Refetch-after-mutation for frontend freshness | Proposed |
| [0006](#adr-0006--jest-for-typescript-pytest-for-python) | Jest for TypeScript, pytest for Python | Proposed |
| [0007](#adr-0007--defer-voice-entirely-rather-than-stub-a-provider) | Defer voice entirely rather than stub a provider | Proposed |
| [0008](#adr-0008--vitest-for-typescript-testing-library--jsdom-for-components) | Vitest for TypeScript, Testing Library + jsdom for components | Accepted |
| [0009](#adr-0009--single-restaurant-scope-no-restaurant-entity) | Single-restaurant scope — no `Restaurant` entity | Accepted |
| [0010](#adr-0010--a-real-cart-route-with-providers-hoisted-to-the-root-layout) | A real `/cart` route, with providers hoisted to the root layout | Accepted |
| [0011](#adr-0011--a-simulated-frontend-checkout-that-knowingly-violates-the-order-state-authority-model) | A simulated frontend checkout that knowingly violates the order-state authority model | Accepted |
| [0012](#adr-0012--contract-foundation-envelope-metadata-versioning-and-a-fourth-contracts-family) | Contract foundation: envelope, metadata, versioning, and a fourth contracts family | Accepted |
| [0013](#adr-0013--nestjs-commerce-api-foundation-toolchain-validation-error-model-and-boundary) | NestJS commerce-api foundation: toolchain, validation, error model, and boundary | Accepted |

---

## ADR-0001 — Monorepo with three applications and a shared contracts package

**Status:** Accepted · **Date:** 2026-09-14 · **Source:** `CLAUDE.md`

### Context

The system has three runtime components in two languages, and they must agree
on shared schemas. The alternative is three repositories with contracts
published as versioned packages.

### Decision

One repository: `apps/web`, `apps/ai-service`, `apps/commerce-api`, and
`packages/contracts`.

### Consequences

- A contract change and its consumers land in one reviewable change.
- No package publishing, version negotiation, or cross-repo lockstep releases.
- The repository must not grow additional services without a decision —
  `CLAUDE.md` explicitly forbids unnecessary microservices.
- Independent deploy cadences per app are not free; if that becomes a
  requirement, revisit.

---

## ADR-0002 — pnpm workspaces + Turborepo for the TypeScript graph

**Status:** Accepted · **Date:** 2026-09-14

### Context

`apps/web`, `apps/commerce-api`, and `packages/contracts` share a dependency
graph and need coordinated builds. `apps/ai-service` is Python and shares none
of it. Options considered: npm workspaces alone (zero tooling, no caching or
task orchestration), Nx (most capable, heavier than this project needs), and
pnpm + Turborepo.

### Decision

pnpm workspaces for dependency management, Turborepo for task orchestration
and caching — scoped to the TypeScript subset only.

`apps/ai-service` is deliberately **outside** the workspace graph. It manages
its own Python dependencies and is not a pnpm package.

### Consequences

- Strict dependency isolation: `apps/web` cannot import a transitive
  dependency it did not declare.
- Build caching across `contracts → web` and `contracts → commerce-api`.
- **`turbo run` will not see the Python service.** Its lint, type, and test
  commands need a separate invocation path, and CI must call both. This is the
  main cost of the decision and the most likely thing to be forgotten.
- Contributors need pnpm installed, not just npm.

---

## ADR-0003 — Zod as contract source of truth, Pydantic generated for Python

**Status:** Accepted · **Date:** 2026-09-14

### Context

Three schema families (`ui-commands`, `agent-intents`, `api-contracts`) must be
enforced at runtime in TypeScript (`apps/web` validating agent output,
`commerce-api` validating requests) and in Python (`ai-service` producing
valid intents and commands). Writing them twice by hand means drift, and drift
in `ui-commands` specifically means the frontend silently dropping commands the
agent believes it sent.

Options considered: OpenAPI-first generated from NestJS (natural for
`api-contracts`, awkward for `ui-commands` and `agent-intents`, which are not
HTTP endpoints); hand-maintained parallel Zod and Pydantic kept in sync by
contract tests (no tooling, but drift caught late and only if tests are
thorough).

### Decision

Zod schemas in `packages/contracts` are the single source of truth. JSON Schema
is generated from them as the language-neutral interchange format. Pydantic
models are generated from that JSON Schema for `ai-service`.

```text
Zod (authored)  →  JSON Schema (generated)  →  Pydantic (generated)
```

### Consequences

- Schema drift becomes structurally impossible rather than test-dependent.
- Zod gives runtime validation in TypeScript directly, so `apps/web` gets its
  UI command allowlist enforcement from the same artifact.
- **Generated Python models must never be hand-edited**, and the codegen must
  run in CI. If it only runs locally, the Pydantic models go stale against
  their Zod source and the guarantee evaporates silently.
- Adds a build step and a generated-code review burden. Generated output
  should be committed or generated in CI — that sub-decision is still open.
- Not every Zod construct maps cleanly to JSON Schema (refinements, transforms,
  branded types). Contract schemas must stay in the expressible subset;
  discovering a construct that does not translate is a real risk when the
  schemas grow.

---

## ADR-0004 — Simulate the database behind a repository interface

**Status:** Proposed · **Date:** 2026-09-14

### Context

`CLAUDE.md` defers real persistence. `commerce-api` still needs to behave as
the authoritative owner of cart and order state from the first phase, or every
boundary above it is untested.

### Decision (proposed)

Implement an in-memory store behind an explicit repository interface in
`commerce-api`. Controllers and domain services depend on the interface, never
on the store.

### Consequences

- Swapping to a real database later changes one implementation, not the
  domain layer.
- In-memory state resets on restart — acceptable while simulating, confusing
  if not documented for whoever runs it first.
- Risk: an in-memory store makes transactional semantics look easier than they
  are. Code written against it may assume atomicity the real database will
  need explicit work to provide.

---

## ADR-0005 — Refetch-after-mutation for frontend freshness

**Status:** Proposed · **Date:** 2026-09-14

### Context

`CLAUDE.md` requires that the frontend refresh from the backend after every
operation, but does not say how. Options: refetch after each mutation,
polling, or a WebSocket/SSE push channel.

### Decision (proposed)

Refetch after mutation. No polling, no push channel.

### Consequences

- Simplest thing that satisfies the authority model, and it is correct by
  construction: the displayed cart is always a backend response.
- One extra round trip per mutation. Irrelevant at this scale.
- Does not cover state changing without a local action (another device, an
  order status advancing server-side). If multi-device or live order tracking
  becomes a requirement, this needs revisiting — it is a genuine limitation,
  not a deferral.

---

## ADR-0006 — Jest for TypeScript, pytest for Python

**Status:** Superseded by [ADR-0008](#adr-0008--vitest-for-typescript-testing-library--jsdom-for-components) · **Date:** 2026-09-14

### Context

No test tooling exists anywhere in the repository. Both Next.js and NestJS
default to Jest; the Python ecosystem defaults to pytest.

### Decision (proposed)

Adopt framework defaults rather than introducing a third choice. Vitest is a
reasonable alternative for `apps/web` and worth considering when that app is
actually scaffolded.

### Consequences

- Zero friction with framework tooling and documentation.
- Two test runners in one repository, so "run all tests" is two commands —
  reinforcing the CI gap noted in ADR-0002.
- Until a phase actually scaffolds an app, every test command in this
  repository is `NOT_CONFIGURED`. See
  [`getting-started.md`](../development/getting-started.md).

### Superseded

Phase 1 (`docs/features/phase-1-web-foundation/requirements.md`, Decision A)
chose Vitest for `apps/web` at approval time, before this ADR was ever marked
Accepted — it was implemented while still sitting at `Proposed`. This entry
was left stale until sub-phase 2.1 corrected it. See ADR-0008 for the
decision actually in force.

---

## ADR-0007 — Defer voice entirely rather than stub a provider

**Status:** Proposed · **Date:** 2026-09-14

### Context

Voice is a target capability, but `CLAUDE.md` forbids a real voice provider in
the initial scope. That leaves three options: a stubbed provider interface,
a browser-native Web Speech API implementation, or no voice surface at all.

### Decision (proposed)

No voice surface in the MVP. Not a disabled button, not a stub interface.

### Consequences

- Avoids designing an abstraction around a provider whose constraints —
  streaming, latency, interruption, partial transcripts — are unknown. An
  interface guessed now would almost certainly be wrong in the way that
  matters.
- The text path exercises the same conversational contract, so nothing about
  the architecture goes unvalidated by deferring voice.
- Risk: voice added later may demand streaming responses, whereas the text
  path can get away with request/response. If that shapes the `ai-service`
  HTTP contract, better to know before that contract has many consumers.

---

## ADR-0008 — Vitest for TypeScript, Testing Library + jsdom for components

**Status:** Accepted · **Date:** 2026-09-14 (sub-phase 2.1) · Supersedes [ADR-0006](#adr-0006--jest-for-typescript-pytest-for-python)

### Context

Phase 1 chose Vitest for pure-logic tests (`environment: "node"`) — no
component was ever actually rendered, so nothing exposed whether the choice
scaled to component testing. Phase 2 needed to test React components
(loading/error/empty states, the detail panel) for the first time, which
surfaced three gaps at once when sub-phase 2.1 first tried it:

1. Vite's default esbuild JSX transform is classic (`React.createElement`),
   which needs `React` in scope. Next.js's own SWC compiler doesn't have
   this requirement, so it never surfaced until a test rendered JSX.
2. `apps/web/src/lib/commands/dispatch.ts`'s AC8 test reads its own source
   file via `import.meta.url` — under `jsdom`, that stops being a real
   `file://` URL.
3. Without Vitest's `test.globals: true` (deliberately not set, to keep
   every test file's imports explicit), React Testing Library's automatic
   `afterEach` cleanup never registers, so unmounted components accumulate
   across tests in the same file.

### Decision

Vitest stays the one TypeScript test runner (formally accepted here, since
ADR-0006 was implemented while still `Proposed`). Component tests use
`@testing-library/react` + `@testing-library/user-event` +
`@testing-library/jest-dom`, environment `jsdom` project-wide, with three
concrete fixes:

- `vitest.config.ts` sets `esbuild.jsx: "automatic"`.
- `dispatch.test.ts` overrides to `// @vitest-environment node` for its one
  filesystem-based test — it isn't a DOM test and doesn't need to become one.
- `vitest.setup.ts` calls `cleanup()` in an explicit `afterEach`.

pytest remains the choice for `apps/ai-service` (unaffected by any of this;
it doesn't exist yet).

### Consequences

- Every future component test needs no per-file setup — the three fixes are
  global. New pure-logic tests are unaffected; jsdom is a superset
  environment for them.
- A file needing the Node environment specifically must say so explicitly
  (`dispatch.test.ts` is the first, precedent for the pattern).
- `@vitejs/plugin-react` was deliberately **not** added — `esbuild.jsx` alone
  was sufficient, and the plugin's fast-refresh/HMR features are irrelevant
  to a test runner.

---

## ADR-0009 — Single-restaurant scope, no `Restaurant` entity

**Status:** Accepted · **Date:** 2026-09-14 (sub-phase 2.1)

### Context

Phase 2 planning proposed "restaurant discovery" as potential scope. No
approved document — not `CLAUDE.md`, not `food-ordering-frontend-mvp.md`,
not `system-architecture.md` — contains the word "restaurant" anywhere
(verified by grep before this ADR was written). Introducing a `Restaurant`
entity would turn this from a single-restaurant ordering app into a
marketplace, which cascades into questions no document has answered: can a
cart span restaurants, does the menu API become restaurant-scoped, does
`commerce-api`'s domain model need a restaurant boundary from day one.

### Decision

Phase 2 stays single-restaurant. This is a **rejection**, not a deferral —
recorded so restaurant discovery isn't re-proposed later without a fresh
decision that actually weighs the marketplace-shaped consequences above.

### Consequences

- Phase 2's menu, search, and detail work stay additive to the existing
  single-restaurant fixture shape — no new entity, no new relationship.
- If a marketplace product direction is chosen later, it is a genuinely new
  architectural decision (server topology, cart-scoping semantics,
  `commerce-api` domain model), not an extension of Phase 2's work.

---

## ADR-0010 — A real `/cart` route, with providers hoisted to the root layout

**Status:** Accepted · **Date:** 2026-09-14 (Phase 3) · Reverses part of the
routing exclusion recorded in `food-ordering-frontend-mvp.md` §4/§9

### Context

`food-ordering-frontend-mvp.md` §4 and §9 listed "routing / deep-linkable item
URLs" as out of scope, in the context of the item-detail panel (Phase 2 chose
an inline panel specifically to avoid needing routing at all). Phase 3 needed
"navigate between menu and cart" and "preserve cart state during normal
frontend navigation" (per the approved
`docs/features/phase-3-frontend-cart-simulation/plan.md`). A client-side view
toggle inside `uiStore` would satisfy the words without proving anything: if
cart state already lives in a context that never unmounts, nothing is at risk
of being lost, so persistence across navigation is untested by construction.

Proving persistence for real requires an actual route change, which in turn
requires deciding where `UiProvider`/`CartProvider` live: Phase 1 and 2 both
mounted them inside `app/page.tsx`, which unmounts on every route change.

### Decision

Add a real `/cart` route (`app/cart/page.tsx`, `app/cart/loading.tsx`).
`UiProvider` and `CartProvider` move from `app/page.tsx` to `app/layout.tsx`,
so they persist across navigation between `/` and `/cart`. `CartProvider` is
decoupled from menu data as part of the same change — it now holds only cart
lines and their mutations (`addItem`, `decrementItem`, `removeItem`,
`itemCount`); pricing is computed by pure functions in
`apps/web/src/lib/cart/pricing.ts` that take `(lines, categories)` explicitly,
the same props-based pattern Phase 2 already used for menu data (AC6).

This narrows, rather than reverses, the §4/§9 exclusion: deep-linkable
**item** URLs are still out of scope, and the item-detail panel is still
inline. Only cart navigation gained a route.

### Consequences

- Cart state surviving navigation is now a structural property (the
  providers are above the router boundary), not an assumption — though the
  live cross-route check itself was verified only by static SSR inspection
  in this phase; the Chrome browser automation tool was unavailable
  throughout Phase 3's implementation, so the interactive click-through
  check is still outstanding.
- `CartProvider` no longer needs a `categories` prop, which removes a
  dependency from cart *state* on menu *data* — a cleaner shape independent
  of this decision's routing motivation.
- The root `app/error.tsx` is relied on to cover the nested `/cart` segment
  without its own error boundary, per documented Next.js App Router
  behavior. This has not been confirmed with a live forced-rejection test
  (same tooling gap as above); if it turns out not to hold, `app/cart/error.tsx`
  is a small, isolated addition.
- Any future route (e.g. a real order-confirmation page) now has a
  precedent to follow rather than a fresh decision to make.

---

## ADR-0011 — A simulated frontend checkout that knowingly violates the order-state authority model

**Status:** Accepted · **Date:** 2026-09-19 (Phase 4) · Reverses part of the
checkout exclusion recorded in `food-ordering-frontend-mvp.md` §4/§9/§10

### Context

`food-ordering-frontend-mvp.md` listed "checkout of any shape" as out of
scope in §4, §9, and §10. `system-architecture.md` §4.4 classifies
`PlaceOrder` as a business intent that only `commerce-api` may execute, and
§5 makes order state authoritatively `commerce-api`'s — prices and totals
are "never recomputed client-side or agent-side," and the frontend is never
the source of truth for order identity or status.

Phase 4 needed a way to demonstrate the cart-to-order journey end to end —
without it, the product cannot show what an order even looks like, and the
shape of an order goes unexercised in the frontend until `commerce-api`
exists to define it for real. `CLAUDE.md`'s frontend-first,
simulation-first scope, and the reasoning already applied to client-side
pricing (`food-ordering-frontend-mvp.md` §7 item 3) and to the `/cart`
route's own reversal of a routing exclusion (ADR-0010), both point the same
way: build the simulation, name the violation explicitly, and keep it small
enough to delete.

### Decision

Add a `/checkout` route that walks the existing local cart through a
customer-details form, a review step, and a simulated confirmation,
entirely in frontend state:

- `lib/checkout/order.ts` mints a locally generated order identifier
  (`ORD-XXXXXX`, via `lib/checkout/orderId.ts`) and an immutable
  `SimulatedOrder` snapshot. Both are **fictions** — no `commerce-api` order
  was created, no identity was validated, and nothing is sent, stored, or
  logged anywhere.
- The order total is exactly the cart subtotal, computed via the same
  `lib/cart/pricing.ts` functions `/cart` already uses. No tax, fee, tip, or
  discount concept is introduced.
- The confirmation screen states, in plain language, that the order is
  simulated, nothing was sent to a restaurant, and no payment was taken —
  so the simulation cannot be mistaken for a real one by whoever sees it.
- Placing the order clears the cart via a new `CLEAR_CART` action, reversing
  Phase 3's explicit "clear cart" exclusion for this one purpose only —
  `CLEAR_CART` is not exposed as a general user-facing "empty my cart"
  feature.
- No UI command, no `packages/contracts/` change, and no change to
  `dispatch.ts`: placing a simulated order stays unreachable from the
  validated-command pipeline, the same boundary Phase 3 held for cart
  mutations.

This narrows, rather than reverses, the rest of §4/§9/§10: real payments,
real order creation, delivery/pickup selection, address fields, order
history/tracking, and everything on the backend/AI/voice/infra list are
still out of scope. Twelve open product decisions (delivery/pickup, which
customer fields to require, tax/fees, submission latency, a failure path,
and others) were posed and answered by the human before implementation —
recorded in
`docs/features/phase-4-frontend-checkout-simulation/requirements.md` rather
than decided silently.

### Consequences

- The violation this ADR records is real, not cosmetic: for as long as
  `apps/commerce-api` does not exist, this frontend is the only thing that
  ever decides an order "happened," and it decides that with no business
  validation, no idempotency, and no persistence. Anyone reading
  `system-architecture.md` §5 in isolation would be right to flag this as a
  contradiction — it is one, made deliberately and recorded here rather
  than hidden, the same treatment §7 item 3 gives client-side pricing.
- `lib/checkout/order.ts` carries a `TEMPORARY` header naming this ADR and
  is deleted wholesale — not migrated, not adapted — the moment
  `commerce-api` owns order creation. `food-ordering-frontend-mvp.md` §7
  gained a fourth temporary item for exactly this reason.
- The confirmation's plain-language disclosure is the one piece of this
  simulation that is genuinely load-bearing rather than decorative: without
  it, a user (or a screenshot of one) could mistake a simulated order for a
  real one. It must survive any future redesign of this screen.
- `CLEAR_CART` is a second, narrow reversal of an earlier decision (Phase
  3's "no clear cart"). It is scoped to exactly one caller — a successfully
  placed simulated order — and is not wired to any visible "clear cart"
  button. A future general clear-cart feature is a new decision, not an
  extension of this one.
- ADR-0010 left open whether a root `app/error.tsx` actually covers a
  nested route segment without its own `error.tsx`, to be confirmed live in
  a later phase. `/checkout` makes the identical assumption and this
  question is **still open for both routes** — the live forced-rejection
  test was not performed, for the same tooling reason below. If it turns
  out false, `app/checkout/error.tsx` (and, as a follow-up,
  `app/cart/error.tsx`) is a small, isolated addition.
- Every acceptance criterion, decision, and gap for this phase is recorded
  in `docs/features/phase-4-frontend-checkout-simulation/`, including the
  twelve product decisions this repository's documentation did not
  previously answer (D1–D12) and one, D4 (which customer fields to
  require), invented for this phase with no documentary basis at all —
  flagged explicitly there as the first thing to revisit against real
  requirements.
- Same tooling gap as Phase 3, recorded rather than glossed over: the
  interactive manual verification this UI would normally get — click-
  through, live-region and focus behaviour with a real screen reader,
  layout at 375/768/1280px — could not be performed; the Chrome browser
  automation tool did not connect when checked explicitly at the start of
  sub-phase 4.2. Automated tests (174, up from 100 before Phase 4) and
  static server-rendered HTML checks via `curl` stand in, and are not
  equivalent to a live browser session.

---

## ADR-0012 — Contract foundation: envelope, metadata, versioning, and a fourth contracts family

**Status:** Accepted · **Date:** 2026-09-19 (Phase 5) · Extends ADR-0003,
narrows §6 of `system-architecture.md`

### Context

ADR-0003 committed to a pipeline — Zod authored → JSON Schema generated →
Pydantic generated — but nothing in the repository generated JSON Schema
until this phase, and `packages/contracts/agent-intents` was an empty
directory with no vocabulary at all. Two boundaries
`system-architecture.md` §4.3/§4.4 name as load-bearing (agent output is
untrusted input; a UI command must never change commerce state) were
therefore mechanized for exactly one producer (`ui-commands`) and not the
other (`agent-intents`).

A concrete divergence was also found and verified, not merely anticipated:
`z.object`'s generated JSON Schema says `additionalProperties: false`, but
`z.object` itself silently strips unknown keys at runtime. A Python
consumer built from that generated schema would reject a payload the
TypeScript consumer accepted — the exact drift ADR-0003 exists to prevent,
present in the shipped contract before the generation pipeline even existed.

### Decision

Four decisions, taken together as the Phase 5 contract foundation. Full
rationale for each numbered item lives in
`docs/features/phase-5-contract-foundation/requirements.md` (D1–D13); this
entry records the outcome and the parts that change what
`system-architecture.md` says.

1. **A fourth contracts family, `packages/contracts/common`.** `system-architecture.md`
   §6 named three families with one producer/consumer pair each. `common`
   is different in kind: it holds primitives (`contractVersion`, menu
   identifiers, correlation id, idempotency key, integer-cents money, an
   ISO-8601 timestamp, and a shared structured-error shape) consumed by
   both `ui-commands` and `agent-intents`, so the same rule is not
   authored twice. §6 is updated to reflect this (D3).
2. **Every contract schema is a strict object.** `z.object` → `z.strictObject`
   across `ui-commands` and throughout `agent-intents`. An unknown key is
   now rejected identically in both generated artifacts and both runtime
   validators — this is a behaviour change to the already-shipped
   `ui-commands` package, made deliberately to close the divergence above
   (D8).
3. **Two envelopes, not one, because intents and commands fail differently.**
   A UI command batch (`contractVersion`, `correlationId`, `issuedAt`,
   `commands[]`, capped at 10) is validated in two stages — the envelope as
   a whole, then each command individually — so one malformed command
   drops without discarding its valid siblings, preserving the
   "dropped and logged" behaviour §4.3 already requires of a single
   command. A business-intent request (`contractVersion`, `correlationId`,
   `idempotencyKey`, `issuedAt`, one `intent`) is validated as a single
   unit: there is exactly one intent per request, so there is nothing
   partial to preserve (D4).
4. **`packages/contracts/agent-intents` now exists**, with exactly the three
   intents observed in the frontend's own implemented behaviour —
   `AddItemToCart`, `RemoveItemFromCart`, `SetCartItemQuantity` — and
   nothing invented beyond it. `PlaceOrder`, `ClearCart`, and two UI-command
   candidates (`OpenCheckout`, `ShowOrderConfirmation`) were considered and
   explicitly declined; they are registered as candidates in
   `docs/api/contracts.md`, not silently dropped (D2, D6, D7).

Supporting decisions, each with a one-line reason: integer major version,
not semver, because this is a lockstep monorepo and nothing consumes a
minor number (D5); ISO-8601 on the wire, epoch millis stay internal to
`uiStore` (D9); generated JSON Schema is committed and guarded by a test
that regenerates it in memory and fails on drift, because there is no CI to
run codegen in (D10); `apps/web` is restricted by ESLint
(`no-restricted-imports`) from importing `@contracts/agent-intents` at all,
the same "structural beats asserted" reasoning `dispatch.ts` already
applies to `cartStore` (D11); `packages/contracts/api-contracts` stays
empty — no producer exists yet, and writing it now would mean guessing at
an interface, the same reasoning Phase 1 applied to `agent-intents` itself
(D12); no `cartId` in an intent — the system is single-user, so cart
resolution is `commerce-api`'s job, not this contract's (D13).

### Consequences

- **`system-architecture.md` §6 now names four contract families, not
  three.** Read in isolation, the older text would be wrong; it is updated
  in the same change as this ADR, not left stale.
- **The cross-language guarantee ADR-0003 promised now has a mechanism.**
  Every package emits committed JSON Schema (`schema/*.v1.json`), and a
  freshness test regenerates each artifact in memory and fails the suite on
  drift. This was verified to actually fail, not just pass vacuously: each
  artifact was deliberately corrupted once during implementation and the
  corresponding test failed as intended.
- **`agent-intents` has a test-only, dev-only dependency on `ui-commands`**
  (`boundary.test.ts` imports `parseCommand` to prove a UI command is
  rejected as an intent, and vice versa). This is not a runtime dependency
  and does not appear in either package's public exports; it exists only so
  the boundary between the two vocabularies is a tested property in both
  directions, not an assertion holding in only one.
- **The `z.strictObject` change is a real behaviour change to a package
  three UI journeys (Phases 1–4) already depend on.** It was verified,
  not assumed: `apps/web`'s full test suite (174 tests) was re-run
  unchanged in count and outcome after the change, and its `typecheck`,
  `lint`, and `build` were all re-run clean.
- **A genuine tooling gap was found and closed, confined to build tooling
  only.** Every contract package's `src/*.ts` uses extensionless relative
  imports — required, because `apps/web`'s `tsconfig.json` has no
  `allowImportingTsExtensions` and its `tsc` run type-checks straight
  through `ui-commands` into `common`'s source. But plain Node's native
  TypeScript execution (used to run each package's `scripts/emit-schema.ts`
  directly, with no new dependency and no build step) requires an explicit
  extension on every relative specifier — verified with a minimal repro,
  not assumed. `packages/contracts/tools/` holds a two-file Node module
  customization hook, used only by each package's `build` script, that
  retries a failed relative resolution with `.ts` appended. It is invisible
  to `tsc` and Vitest — both already resolve the extensionless form
  correctly — and invisible to every consumer, since nothing imports
  `tools/` except the `build` scripts themselves. `apps/web`'s typecheck
  was re-verified clean with this in place.
- **`turbo.json`'s `build` task outputs (`dist/**`, `.next/**`) do not list
  `schema/**`.** `turbo run build`/`typecheck` warns `no output files found`
  for each contracts package's `build` task. Harmless today — the
  artifacts are committed and freshness-tested independently of turbo's
  cache — but recorded as a follow-up rather than silently accepted:
  `turbo.json` should eventually declare `schema/**` as an output for the
  contracts packages.
- **Nothing about `apps/ai-service` or `apps/commerce-api` was built or
  assumed working.** Whether the generated JSON Schema produces usable
  Pydantic — and specifically, whether a discriminated union's `oneOf` (no
  JSON Schema `discriminator` keyword is emitted) generates a true tagged
  union or merely a plain `Union` — is recorded as an open question in
  `docs/features/phase-5-contract-foundation/requirements.md`, not answered
  here. It cannot be answered until that service exists.

---

## ADR-0013 — NestJS commerce-api foundation: toolchain, validation, error model, and boundary

**Status:** Accepted · **Date:** 2026-09-25 (Phase 6)

### Context

`apps/commerce-api` was an empty directory. `system-architecture.md` §1 and
§5 make it the sole authority for menu, cart, order, pricing, and payment
state, and `packages/contracts` (Phase 5) designed the vocabulary and error
shape it would consume — but nothing constructed it yet. Phase 6's job was
the transport boundary underneath that authority: validation, error shape,
correlation, versioning, configuration, and logging, with no Menu, Cart, or
Order behaviour.

Two concrete problems shaped the decisions below, neither guessed at —
both found and verified during implementation:

1. **The contracts packages ship raw TypeScript with no build output**
   (`exports: "./src/index.ts"`, extensionless relative imports). NestJS
   needs `emitDecoratorMetadata` for its dependency injection, which neither
   Vitest's default esbuild transform nor plain Node's native TypeScript
   execution provides.
2. **A real middleware-ordering bug**, not merely a risk anticipated in
   planning: cross-cutting middleware wired through `NestModule.configure()`
   binds during `app.init()`, strictly *after* an `app.useBodyParser(...)`
   call made right after `NestFactory.create()`. A live `curl` check against
   the built app — not any test, at the time — found a real 413 (payload too
   large) response missing its `X-Request-Id`/`X-Correlation-Id` headers,
   because the body parser ran before the middleware that sets them.

### Decision

Nine decisions, taken together as the Phase 6 commerce-api foundation. Full
rationale for each lives in
`docs/features/phase-6-commerce-api-foundation/requirements.md` (OD1–OD11);
this entry records the outcome.

1. **Toolchain: one Vite + SWC pipeline, not the Nest CLI.** `vitest` +
   `unplugin-swc` for tests, `vite build` (SSR mode) for the built
   `dist/main.js`, `vite-node --watch` for `dev`. `vite build`'s Rollup
   bundles `@contracts/*`'s raw-TypeScript source inline (resolved through
   its `exports` field, same as any bundler) and externalizes every real
   npm dependency (`@nestjs/*`, `zod`, `rxjs`, …), so nothing in
   `packages/contracts` changed to make this work. `unplugin-swc` reads
   `experimentalDecorators`/`emitDecoratorMetadata` straight from
   `tsconfig.json` — verified from its own documented default, not assumed.
2. **Validation: Nest 12's built-in `StandardSchemaValidationPipe`, not
   `class-validator`.** Zod 4 schemas implement the Standard Schema spec
   directly (`@Body({ schema: someZodSchema })`), so the Phase 5 contract
   schemas validate requests with no DTO duplication and no new dependency.
   A custom `exceptionFactory` (`common/validation/validation.ts`) maps
   Standard Schema issues to a `@contracts/common` `ContractError`:
   `INVALID_PAYLOAD`, or `UNSUPPORTED_CONTRACT_VERSION` specifically when
   `contractVersion` itself fails; `field` and `message` are bounded (64 /
   500 chars) and never include the rejected value.
3. **Error body: a bare `@contracts/common` `ContractError`, always.**
   `AllExceptionsFilter` is the one place any thrown error becomes a
   response: `ApiException` (this service's own, carrying a full
   `ContractError` and status), a Nest `HttpException` (404 →
   `ROUTE_NOT_FOUND`, 413/415 mapped explicitly), body-parser's own
   `entity.too.large` error (detected structurally — it is never a Nest
   exception), or anything else, which collapses to a generic 500
   `INTERNAL_ERROR` with no stack, no exception message, and no payload
   echo; the full detail is logged server-side with the request's id
   instead. API-level codes (`ROUTE_NOT_FOUND`, `PAYLOAD_TOO_LARGE`,
   `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`) live in `commerce-api`
   itself, reusing — not redefining — `INVALID_PAYLOAD` and
   `UNSUPPORTED_CONTRACT_VERSION` from `@contracts/common`, per that
   package's own stated intent (`errors.ts`: domain codes "arrive with the
   service that owns them").
4. **Every cross-cutting HTTP concern lives in one function,
   `configure-app.ts`, called by hand — not through `NestModule.configure()`.**
   This is the direct fix for the ordering bug above. `main.ts` and every
   API test call the identical `configureApp(app)`: URI versioning,
   request-context middleware, a JSON-only content-type guard, the
   size-limited body parser, request logging, the validation pipe, the
   exception filter, and shutdown hooks, registered through `app.use()`/
   `app.useBodyParser()` in one explicit, verified order. `AppModule` itself
   now holds no middleware wiring at all.
5. **Versioning: URI `/v1` for business routes, `/health` exempted via
   `VERSION_NEUTRAL`.** A liveness check has no contract to version.
6. **Logging: Nest's own `ConsoleLogger` (`json: true`), subclassed as
   `AppLogger` to attach the active request's `requestId`/`correlationId`
   automatically from `AsyncLocalStorage`**, rather than `nestjs-pino` or a
   new dependency. Verified structurally, not merely believed: `.log()`
   writes to stdout, `.error()` to stderr (each per `ConsoleLogger`'s own
   doc comments) — a test that only spied on stdout would silently miss
   every error-level log line.
7. **Configuration: a Zod env schema (`env.schema.ts`), not
   `@nestjs/config`.** Parsed once in `main.ts` before the Nest application
   is created; an invalid value exits the process non-zero, naming the
   field and never printing the value. No `dotenv` either — Node 24's
   `--env-file-if-exists` loads `.env` — though CLI-flag placement matters:
   the flag can be given directly to `node` (`start`), but is refused by
   Node when passed via `NODE_OPTIONS` — verified by running it, not
   assumed — so `dev` invokes `vite-node`'s own entry file
   (`node_modules/vite-node/vite-node.mjs`) directly rather than through its
   `bin` shim, the same "reach into `node_modules` directly" precedent
   `packages/contracts/tools/` already set for a different tool.
8. **No domain module shells.** `HealthModule` is the only module besides
   `ConfigModule`; Menu, Cart, and Order arrive one per phase, each with
   controller → service → repository interface, only `modules/<domain>/
  infrastructure/` touching storage, no cycles. No umbrella `Commerce`
   module.
9. **ESLint boundary, mirroring D11's precedent:** `apps/commerce-api` is
   restricted from importing `@contracts/ui-commands` (it executes business
   intents; it does not produce UI commands) and from importing anything
   under `apps/web`. Verified to actually fail: a temporary import was
   added, the lint run shown to fail with the expected message, then
   removed.

### Consequences

- **The toolchain choice is unverified for anything beyond this
  foundation.** Whether `vite build`'s inlining strategy continues to work
  cleanly once `packages/contracts` grows larger schemas, or once a real
  database client is added as a dependency, is not yet known.
- **`configure-app.ts` is now the single source of truth for HTTP
  behaviour.** Any future middleware, guard, or interceptor belongs there,
  not in `AppModule` or scattered across `main.ts` — the ordering bug this
  ADR records is the concrete cost of not doing that from the start.
- **The Standard Schema validation pipe couples request validation to
  Zod's `~standard` interface.** If a future domain schema cannot be
  expressed as a Zod schema (unlikely, but not yet tested at scale), this
  pipe would need a custom validator alongside it.
- **No authentication, no rate limiting, no CORS.** Per `CLAUDE.md`'s
  deferred list; `system-architecture.md` §8's gaps 3 (idempotency) and 4
  (authorization) remain open, and this phase adds no new mechanism for
  either — `X-Correlation-Id` is carried, not yet consumed by anything.
- **No database.** ADR-0004 stays `Proposed`; the first domain phase
  decides it. `GET /health` has no dependency to check and is liveness
  only, deliberately with no readiness endpoint.
- **A real bug was caught only by manual verification, not by the test
  suite, until the tests were extended afterward.** Recorded as a
  methodology note, not just a fix: an automated assertion (header
  presence on a 413 response) existed only after the live check surfaced
  the gap. `test/validation.e2e.test.ts` and `test/app.e2e.test.ts` both
  assert header presence on every response class now, including errors.

---
