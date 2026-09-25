# Requirements — Phase 5: UI Command & Business Intent Contract Foundation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-19 (in conversation, "approved", given after the
full plan including D1–D13 and a recommendation on each; the recommendations
were therefore taken as the decisions and are recorded in full below)
**Risk:** HIGH
**Path:** Full

## Problem

`system-architecture.md` §4.3 and §4.4 name the two boundaries that make every
other boundary in this system meaningful: agent output is untrusted input, not
code, and a UI command that can change commerce state is a business intent
wearing a costume. Exactly one of those boundaries is mechanized today —
`packages/contracts/ui-commands` — and it is mechanized for a producer that
does not exist yet.

Three specific gaps follow.

**First, the cross-language guarantee is undelivered.** ADR-0003 is `Accepted`
and describes a pipeline: Zod authored → JSON Schema generated → Pydantic
generated. The first generated artifact in that chain does not exist. Nothing
in the repository emits JSON Schema, so the property the ADR was written to
buy — "schema drift becomes structurally impossible rather than
test-dependent" — is currently a claim with no mechanism behind it.

**Second, there is no intent vocabulary at all.** `packages/contracts/agent-intents`
is an empty directory. Phase 1 was right to leave it that way
(`food-ordering-frontend-mvp.md` §4: "no consumer exists yet, so writing them
would mean guessing at interfaces"), but that reasoning has partly expired.
Phases 3 and 4 implemented cart mutation and order placement in the frontend,
so for cart operations there is now *observed behaviour to model* rather than
an interface to guess at. For order placement there is not — Phase 4's
customer fields are an admitted invention (D4 of that phase) and idempotency
remains undesigned (`system-architecture.md` §8 gap 3).

**Third, a real TypeScript/Python divergence already exists in the shipped
contract.** `ui-commands` schemas use `z.object`, which *strips* unknown keys
silently. `z.toJSONSchema` emits `additionalProperties: false` for those same
schemas, which *rejects* them. A Python consumer generated from that schema
would reject payloads the TypeScript consumer accepts. That is precisely the
drift ADR-0003 exists to prevent, present today, before the pipeline has even
been built. Verified by running both, not inferred.

## Goal

A contract foundation — shared primitives, a transport envelope, an error
model, versioning and compatibility rules, strict validation, and committed
JSON Schema artifacts with a freshness guard — that `apps/ai-service` and
`apps/commerce-api` can later be built *against*, and that turns the
frontend's existing allowlist from a one-off into one instance of an enforced
general rule.

Contracts only. No service is built, no backend is connected, and no runtime
behaviour is added to `apps/web` beyond what the contracts themselves validate.

## In scope

- A new `packages/contracts/common` package holding shared primitives:
  contract version, identifier schemas, quantity and integer-cents money
  schemas, correlation and idempotency identifiers, ISO-8601 timestamps, and
  the shared structured-error shape.
- Hardening `packages/contracts/ui-commands`: strict objects, a bounded
  `SearchMenu.query`, identifiers sourced from `common`, and a batch envelope
  (`contractVersion`, `correlationId`, `issuedAt`, `commands[]`) with
  per-command validation so one malformed command does not discard its valid
  siblings.
- A new `packages/contracts/agent-intents` package with three intents —
  `AddItemToCart`, `RemoveItemFromCart`, `SetCartItemQuantity` — each mirroring
  a cart mutation `apps/web` already implements, plus a request envelope
  carrying an idempotency key.
- JSON Schema emission for all three packages, committed to the repository,
  guarded by a test that fails when a committed artifact is stale relative to
  its Zod source.
- Contract tests covering acceptance, rejection, never-throwing, allowlist
  completeness, partial-batch behaviour, version rejection, and the
  intent/command boundary **in both directions**.
- An ESLint restriction preventing `apps/web` from importing
  `@contracts/agent-intents` at all.
- Documentation: ADR-0012, `system-architecture.md` §6, `getting-started.md`,
  `food-ordering-frontend-mvp.md` §12, and `docs/api/contracts.md` (worked
  examples plus the register of candidates that were considered and declined).

## Out of scope

Not deferred vaguely — each of these was considered and excluded for a stated
reason.

- **`packages/contracts/api-contracts`** — its producer (`commerce-api`) does
  not exist, so writing request/response shapes now means guessing at an
  interface. This is the same reasoning Phase 1 applied to `agent-intents`,
  and it still holds here (D12).
- **A `PlaceOrder` / `CreateOrder` intent** — its payload would need Phase 4's
  admittedly invented customer fields and an idempotency design that
  `system-architecture.md` §8 gap 3 records as undesigned. Recorded as a
  candidate (D2).
- **A `ClearCart` intent** — ADR-0011 makes `CLEAR_CART` the internal mechanism
  of a placed order and explicitly **not** a user-facing feature. An agent
  intent for it would create that feature by the back door (D7).
- **An `OpenCheckout` UI command** — Phase 4 decided `/checkout` is reachable
  only from a non-empty `/cart`. An agent command to open it reverses an
  approved product decision (D6).
- **A `ShowOrderConfirmation` UI command** — rejected outright, not deferred.
  The confirmation screen is reachable only by having placed an order; a
  command that renders it lets the agent show a user an order that never
  happened.
- **Any Python code, Pydantic generation, or `apps/ai-service` scaffolding** —
  the JSON Schema artifacts are the handoff point; consuming them belongs to
  whichever phase creates that app.
- **Everything on `CLAUDE.md`'s deferred list** — real AI integration,
  LangChain/LangGraph, LLM or tool calling, NestJS, database, authentication,
  payments, voice, MCP, infrastructure, Kubernetes, deployment.
- **Changes to `apps/web` source**, with one exception: the ESLint import
  restriction (D11). No component, store, or `dispatch.ts` change is planned.

## Risk assessment (Full Path)

**Blast radius.** `packages/contracts/ui-commands` is consumed by `apps/web`'s
`dispatch.ts` and `uiStore.tsx`, which are on the path of every chat-driven
interaction. A mistake in the strict-object change breaks the command pipeline
that Phases 1–2 exist to prove. Everything else in this phase is new code with
no existing consumer, so its blast radius is limited to the contracts packages
themselves.

**Reversibility.** Good, and deliberately so. Nothing is committed, migrated,
or deployed; there is no persisted state and no published package. The riskiest
change (strict objects) is a one-word edit per schema and reverts cleanly. The
generated JSON Schema artifacts are derived files — deleting and regenerating
them loses nothing.

**Detection.** Fast for the things that matter. `apps/web`'s 174 existing tests
exercise the command pipeline and will fail if strict objects break a real
consumer. The schema freshness test fails the suite the moment a committed
artifact drifts from its source. What detection does **not** cover: whether the
emitted JSON Schema actually generates usable Pydantic models — that cannot be
observed until `apps/ai-service` exists, and is recorded as an unverified
assumption rather than tested.

Reversibility is good and detection is fast, so the plan does not need a
smaller first phase — but sub-phase 5.2 is the one that touches working code,
and it validates the full suite before 5.3 begins.

## Acceptance criteria

- [x] **AC1** `@contracts/common` exists, exports the shared primitives
      (version, identifiers, quantity, integer cents, correlation and
      idempotency ids, ISO-8601 timestamp, structured error), and is consumed
      by both other contract packages.
- [x] **AC2** `@contracts/agent-intents` exports `AddItemToCart`,
      `RemoveItemFromCart`, and `SetCartItemQuantity` as a closed discriminated
      union, with a `parseIntent` that returns a result value and never throws.
- [x] **AC3** A business intent submitted to `parseCommand` is rejected, and a
      UI command submitted to `parseIntent` is rejected. Both directions have a
      test.
- [x] **AC4** Every contract schema is a strict object: an unknown key is
      rejected, not silently stripped.
- [x] **AC5** A batch containing one invalid and one valid command yields
      exactly one accepted command and one logged rejection — the valid one is
      not discarded.
- [x] **AC6** An envelope carrying an unrecognised `contractVersion` is
      rejected.
- [x] **AC7** A committed JSON Schema artifact exists for all three packages,
      and a test fails if any is stale relative to its Zod source.
- [x] **AC8** No contract schema uses `.transform()`, `.refine()`, `.brand()`,
      or `.catch()` — constructs that do not survive JSON Schema generation —
      verified by a test that inspects the contract sources.
- [x] **AC9** `SearchMenu.query` has a maximum length, and the envelope's
      `commands` array has a maximum length.
- [x] **AC10** `pnpm turbo run typecheck`, `lint`, `test`, and `build` all pass
      across the workspace, with `apps/web`'s 174 tests unchanged in count and
      outcome.
- [x] **AC11** ADR-0012 is written, and `system-architecture.md` §6,
      `getting-started.md`, and `food-ordering-frontend-mvp.md` are updated in
      the same change.
- [x] **AC12** No file under `apps/web/src`, `apps/ai-service`, or
      `apps/commerce-api` is created or modified, except the ESLint import
      restriction (D11).

AC3, AC4, and AC7 are the ones worth failing the phase over: AC3 and AC4 are
the boundary this phase exists to enforce, and AC7 is the mechanism without
which ADR-0003's guarantee stays decorative.

## Decisions (D1–D13)

Posed in the plan with a recommendation on each, and approved as recommended.
Recorded here rather than left implicit.

| # | Question | Decision | Why |
| - | -------- | -------- | --- |
| D1 | Command naming: `SHOW_CATEGORY` style or existing PascalCase? | **PascalCase** (`ShowMenuCategory`, `AddItemToCart`) | Renaming breaks a shipped, tested contract and 16 passing tests for no functional gain. |
| D2 | Adopt a `PlaceOrder` intent now? | **No — candidate** | Payload needs Phase 4's admittedly invented customer fields and an undesigned idempotency model. |
| D3 | Create `packages/contracts/common`? | **Yes**, with ADR-0012 and a §6 update | A fourth directory deviates from `system-architecture.md` §6's three families; the alternative is duplicating primitives per family, which accepts drift. Raised rather than done quietly (`core.md` rule 2). |
| D4 | UI commands batched, intents single? | **Yes** | Matches `system-architecture.md` §3 step 7 ("a set of UI commands") and per-intent idempotency. |
| D5 | Version format | **Integer major** | Semver is over-precise for a lockstep monorepo (ADR-0001); nothing would consume a minor or patch number. |
| D6 | Add an `OpenCheckout` UI command? | **No** | Reverses Phase 4's "reachable only from a non-empty `/cart`" decision. |
| D7 | Adopt a `ClearCart` intent? | **No — candidate** | ADR-0011 makes `CLEAR_CART` internal and explicitly not a user feature. |
| D8 | `z.strictObject` on the shipped `ui-commands`? | **Yes** | Fixes a real TS/Python divergence. It is a behaviour change to working code and is reported as one. |
| D9 | ISO-8601 or epoch millis on the wire? | **ISO-8601** | Unambiguous across languages. `uiStore`'s internal `receivedAt` stays epoch millis — it is internal state, not a wire format. |
| D10 | Commit generated JSON Schema, or generate on demand? | **Commit**, guarded by a freshness test | ADR-0003 left this sub-decision open and required codegen in CI. There is no CI, so a failing test is the enforcement available today. |
| D11 | Forbid `apps/web` from importing `@contracts/agent-intents`? | **Yes**, via ESLint `no-restricted-imports` | Structural beats asserted — the same technique `dispatch.ts` uses for "cannot reach cart state". |
| D12 | Write `api-contracts` in Phase 5? | **No** | No producer exists; it would be guessing at an interface. |
| D13 | Include `cartId` in intents? | **Omit** | Single-user assumption (`CLAUDE.md`; §8 gap 4). `commerce-api` resolves the cart. Revisit with authorization. |

## Open questions

Genuinely unresolved, carried forward rather than answered here.

1. **Does the emitted JSON Schema generate usable Pydantic models?** Cannot be
   observed until `apps/ai-service` exists. A known wrinkle is already
   recorded: `z.toJSONSchema` renders a discriminated union as plain `oneOf`
   with no JSON Schema `discriminator` keyword, so generated Pydantic will be a
   plain `Union` discriminated by its `Literal` fields — functional, but not a
   Pydantic *tagged* union, and its error messages differ.
2. **Where does the idempotency key come from, and what is its scope?**
   Phase 5 carries the field and bounds its length. The retry semantics behind
   it remain `system-architecture.md` §8 gap 3, and belong to whichever phase
   builds `commerce-api`.
3. **Does `correlationId` need to survive into `commerce-api`'s own logs?**
   Phase 5 defines the field; nothing consumes it yet.
4. **When do the declined candidates get revisited?** `PlaceOrder`, `ClearCart`,
   and `OpenCheckout` each need a product decision, not a contract decision.
   They are registered in `docs/api/contracts.md` so they are re-proposed
   deliberately rather than rediscovered.
