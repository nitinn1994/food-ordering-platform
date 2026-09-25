# Getting Started

**Last updated:** 2026-09-25 (Phase 5, sub-phase 5.4)
**Status:** `apps/web` and all three of `packages/contracts/{common,ui-commands,
agent-intents}` are scaffolded and working — Phase 1 (frontend foundation),
Phase 2 (menu browsing: search, item detail, loading/error states), Phase 3
(frontend cart simulation: full cart CRUD, a `/cart` route, cross-route
persistence), Phase 4 (frontend checkout simulation: a `/checkout` route,
customer-details form, review, and a simulated order confirmation), and
Phase 5 (contract foundation: shared primitives, envelopes, versioning,
strict validation, and generated JSON Schema for both `ui-commands` and the
newly-added `agent-intents`) are all complete. `apps/ai-service` and
`apps/commerce-api` do not exist yet — Phase 5 defines the contracts they
will consume; it does not build either service.

---

## Read this first

This file is the project's authoritative record of its own commands, per
`.claude/rules/validation.md`. That rule cuts both ways: a command listed here
must actually exist, and **a command that does not exist must not be listed
here just because it looks plausible.** Every command below has been run and
verified as of this update.

Whichever phase next scaffolds `apps/ai-service` or `apps/commerce-api` must
update this file in the same change. A scaffolding phase that leaves this file
stale has not finished.

## Current state

| | |
| --- | --- |
| Applications | `apps/web` — Next.js, TypeScript, working. `apps/ai-service`, `apps/commerce-api` — empty directories, not scaffolded. |
| Shared packages | `packages/contracts/common`, `ui-commands`, `agent-intents` — Zod schemas, all working, each with committed generated JSON Schema. `api-contracts` — still empty, no producer yet. |
| Dependency manifests | Root `package.json` + `pnpm-workspace.yaml` (pnpm + Turborepo, ADR-0002); `apps/web/package.json`; one `package.json` per `packages/contracts/*` package. |
| Build tooling | Turborepo (`turbo.json`), TypeScript (`tsconfig.base.json`), ESLint flat config (`eslint.config.mjs`, now also enforcing `apps/web`'s `agent-intents` import restriction — ADR-0012), Vitest per package. Each contracts package also has a `build` script (`scripts/emit-schema.ts`) that generates its committed JSON Schema; `packages/contracts/tools/` holds a small Node module hook those scripts use, and only they use. |
| CI | None. `apps/ai-service` will need its own invocation path when it exists — see ADR-0002's residual risk. |
| Git | Repository initialised; no commits yet. |

## Prerequisites

Verified working with:

| Toolchain | Verified version | Pinned in |
| --------- | ----------------- | --------- |
| Node.js | v24.19.0 | `.nvmrc`, `package.json` `engines` (`>=20.9.0`) |
| pnpm | 12.3.4 | `package.json` `packageManager` |
| Python | not yet installed or needed | `apps/ai-service` does not exist yet |

## Commands

Run from the repository root unless noted. All verified passing as of
2026-09-25 (Phase 5, sub-phase 5.4).

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | `pnpm install` | Verified |
| Type check (all packages) | `pnpm turbo run typecheck` | Verified |
| Lint (all packages) | `pnpm turbo run lint` | Verified |
| Test (all packages) | `pnpm turbo run test` | Verified — 281 tests (43 `common` + 33 `ui-commands` + 31 `agent-intents` + 174 `web`), up from 190 before Phase 5. `apps/web`'s 174 are unchanged in count and outcome from Phase 4. |
| Build (all packages) | `pnpm turbo run build` | Verified — `/`, `/cart`, `/checkout`, `/_not-found` all prerender; each contracts package's `build` regenerates its committed `schema/*.v1.json` |
| Generate one contract package's JSON Schema | `pnpm --filter @contracts/<name> build` | Verified for `common`, `ui-commands`, `agent-intents` — run after any schema change, before committing |
| Run `apps/web` in development | `pnpm --filter web dev` | Verified — serves on http://localhost:3000; `/cart` and `/checkout` also live |

**Not verified this phase:** interactive browser checks. `NOT_APPLICABLE` for
Phase 5 specifically — it changed no UI — but the gap itself is still open
from Phase 4: the Chrome browser automation tool did not connect when
checked explicitly at the start of sub-phase 4.2, and this phase did not
retry it (there was no UI change to verify with it). Everything Phase 5
changed was confirmed by `pnpm turbo run {typecheck,lint,test,build}`, not
by a browser session — appropriate here since nothing in `apps/web`'s
rendered output changed, but recorded rather than silently assumed fine.

`packages/contracts/{common,ui-commands,agent-intents}` have no `dev`/`start`
command — they are libraries, not runnable services. `apps/ai-service` and
`apps/commerce-api` have no commands at all, because they do not exist:

| Task | Command | Status |
| ---- | ------- | ------ |
| `apps/ai-service` — anything | — | `NOT_CONFIGURED` |
| `apps/commerce-api` — anything | — | `NOT_CONFIGURED` |

`NOT_CONFIGURED` means the project has no such check set up. It does not mean
passing, and it does not mean failing. See `.claude/rules/validation.md` for
the full status vocabulary.

One known warning, not a failure: `next build` reports "The Next.js plugin was
not detected in your ESLint configuration." This is expected — the root
ESLint config was kept deliberately minimal (no `next/core-web-vitals`
plugin) per `docs/features/phase-1-web-foundation/plan.md`.

## Repository layout

```text
apps/
  web/            Next.js frontend — scaffolded, working (Phase 1 + 2 + 3 + 4)
    src/app/                 layout.tsx (providers, SiteNav, CartAnnouncer),
                              page.tsx (menu, async Server Component),
                              loading.tsx, error.tsx, globals.css
    src/app/cart/             page.tsx (async Server Component), loading.tsx
    src/app/checkout/         page.tsx (async Server Component), loading.tsx
    src/components/menu/     CategoryFilter, MenuSearch, MenuList,
                              MenuItemCard, ItemDetailPanel
    src/components/cart/     CartPanel (compact menu-page summary),
                              CartList (full /cart view, checkout entry
                              link), CartLine, CartTotal, QuantityStepper,
                              CartAnnouncer
    src/components/checkout/ CheckoutFlow (step machine + guard),
                              EmptyCheckoutNotice, CustomerDetailsForm,
                              FormField, CheckoutReview, OrderSummary,
                              OrderConfirmation, CheckoutAnnouncer
    src/components/nav/      SiteNav (Menu / Cart (n), aria-current)
    src/components/chat/     ChatInput, ChatTranscript
    src/components/dev/      CommandLogPanel (development-only)
    src/lib/commands/        simulate.ts (temporary), dispatch.ts
    src/lib/state/           uiStore.tsx (durable), cartStore.tsx (temporary
                              — lines + mutations only, no pricing; gained
                              CLEAR_CART in Phase 4 for a placed order)
    src/lib/cart/            pricing.ts (line/cart subtotals, item count,
                              quantity cap — pure functions)
    src/lib/checkout/        types.ts, validation.ts, orderId.ts, order.ts
                              (temporary — simulated order snapshot),
                              checkoutReducer.ts (step machine)
    src/lib/menu/            menuSource.ts (the one fixture-import point),
                              filter.ts (category + query, AND semantics)
    src/lib/fixtures/        menu.ts (temporary)
    src/lib/money.ts         integer-cents formatting
  ai-service/     Python service — not yet scaffolded
  commerce-api/   NestJS service — not yet scaffolded
packages/
  contracts/
    common/         scaffolded, working (Phase 5) — shared primitives, no
                     consumer of its own: contractVersion, menu identifiers,
                     quantity, integer-cents money, correlation id,
                     idempotency key, ISO-8601 timestamp, structured error
    ui-commands/    scaffolded, working — what the screen should do (ai-service → web)
                     5 commands: ShowMenuCategory, HighlightItem, OpenCartPanel,
                     ShowItemDetail, SearchMenu — unchanged since Phase 2;
                     Phase 5 hardened all five (strict objects, bounded
                     SearchMenu.query) and added a batch envelope
    agent-intents/  scaffolded, working (Phase 5) — what should happen to
                     commerce (ai-service → commerce-api): AddItemToCart,
                     RemoveItemFromCart, SetCartItemQuantity; a single-intent
                     request envelope with an idempotency key
    api-contracts/  empty — request/response shapes (commerce-api → everyone);
                     no producer exists yet (Phase 5 D12)
    tools/          register-relative-ts.mjs, resolve-relative-ts.mjs — a
                     Node module hook used only by each package's own
                     `build` script (schema generation); not part of any
                     package's exports
infrastructure/
  database/  docker/  kubernetes/     empty; deliberately deferred
docs/
  architecture/  product/  api/  decisions/  development/
  api/contracts.md                         contract naming, worked examples,
                                            the declined-candidate register
  features/phase-1-web-foundation/         requirements.md, plan.md, test-plan.md
  features/phase-2-menu-browsing/          requirements.md, plan.md, test-plan.md
  features/phase-3-frontend-cart-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-4-frontend-checkout-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-5-contract-foundation/    requirements.md, plan.md, test-plan.md
.claude/          ForgeFlow — rules, commands, agents, skills, workflows
```

## Before writing any code

Read, in this order:

1. `CLAUDE.md` — the specification of record.
2. [`docs/architecture/system-architecture.md`](../architecture/system-architecture.md)
   — the component boundaries, and specifically §4, which is the part that is
   easy to break by accident.
3. [`docs/architecture/architecture-decisions.md`](../architecture/architecture-decisions.md)
   — what has been decided, and what is merely proposed. A `Proposed` ADR is
   not permission.
4. `.claude/rules/core.md` and `.claude/rules/scope-control.md`.

## Explicitly temporary code

Four modules in `apps/web` are scaffolding, each header-commented with what
replaces them — see
[`docs/product/food-ordering-frontend-mvp.md`](../product/food-ordering-frontend-mvp.md)
§7:

- `src/lib/fixtures/menu.ts` — replaced by `commerce-api` menu reads.
- `src/lib/state/cartStore.tsx` — replaced by `commerce-api` cart ownership.
- `src/lib/commands/simulate.ts` — replaced by real `apps/ai-service` output.
- `src/lib/checkout/order.ts` — replaced by `commerce-api` order creation,
  identity, and persistence (Phase 4; see
  [ADR-0011](../architecture/architecture-decisions.md#adr-0011--a-simulated-frontend-checkout-that-knowingly-violates-the-order-state-authority-model)).

## Next step

Phase 1 (sub-phases 1.1–1.4), Phase 2 (sub-phases 2.1–2.4), Phase 3
(sub-phases 3.1–3.5), Phase 4 (sub-phases 4.1–4.5), and Phase 5 (sub-phases
5.1–5.4) are all implemented: workspace foundation, the `ui-commands`
contracts package (5 commands, unchanged since Phase 2), the menu UI with
search and item detail, real loading/error states via an async `getMenu()`
seam, a complete frontend-only cart (add/remove/increase/decrease,
subtotals, item count, a `/cart` route with cross-route persistence), the
validated command pipeline with its adversarial rejection path, a
frontend-only checkout simulation (`/checkout`: customer-details form,
review, a simulated order confirmation, and clearing the cart on success)
that knowingly and temporarily violates the order-state authority model —
recorded in ADR-0011, not hidden — and now a contract foundation: shared
primitives (`@contracts/common`), a hardened and enveloped `ui-commands`,
and a new `@contracts/agent-intents` with three cart intents, all with
committed, freshness-tested JSON Schema (ADR-0012).

`apps/commerce-api` and `apps/ai-service` are the next major phases and have
not been planned yet. Phase 5 built the contracts they will consume against;
it built neither service.

Start planning either with `/forge`, which will route it to `/plan`.
