# Getting Started

**Last updated:** 2026-09-25 (Phase 7, sub-phase 7.4)
**Status:** `apps/web`, all four of `packages/contracts/{common,ui-commands,
agent-intents,api-contracts}`, and `apps/commerce-api` are scaffolded and
working — Phase 1 (frontend foundation), Phase 2 (menu browsing: search, item
detail, loading/error states), Phase 3 (frontend cart simulation: full cart
CRUD, a `/cart` route, cross-route persistence), Phase 4 (frontend checkout
simulation: a `/checkout` route, customer-details form, review, and a
simulated order confirmation), Phase 5 (contract foundation: shared
primitives, envelopes, versioning, strict validation, and generated JSON
Schema for both `ui-commands` and `agent-intents`), Phase 6 (NestJS
commerce-api foundation: configuration, request validation against the
Phase 5 contract schemas, a structured error model, correlation and request
logging, URI versioning, and `GET /health`), and Phase 7 (Menu domain: a new
`@contracts/api-contracts` package, an in-memory `MenuRepository`, and
`GET /v1/menu` / `GET /v1/menu/items/:itemId`) are all complete.
`commerce-api` implements no Cart or Order route yet. `apps/ai-service` does
not exist yet.

---

## Read this first

This file is the project's authoritative record of its own commands, per
`.claude/rules/validation.md`. That rule cuts both ways: a command listed here
must actually exist, and **a command that does not exist must not be listed
here just because it looks plausible.** Every command below has been run and
verified as of this update.

Whichever phase next scaffolds `apps/ai-service` must update this file in the
same change. A scaffolding phase that leaves this file stale has not finished.

## Current state

| | |
| --- | --- |
| Applications | `apps/web` — Next.js, TypeScript, working. `apps/commerce-api` — NestJS, TypeScript, working (Phase 6 foundation + Phase 7 read-only Menu domain; no Cart/Order route). `apps/ai-service` — empty directory, not scaffolded. |
| Shared packages | `packages/contracts/common`, `ui-commands`, `agent-intents`, `api-contracts` — Zod schemas, all working, each with committed generated JSON Schema. `api-contracts` gained its first producer in Phase 7 (`commerce-api`'s Menu domain). |
| Dependency manifests | Root `package.json` + `pnpm-workspace.yaml` (pnpm + Turborepo, ADR-0002); `apps/web/package.json`; `apps/commerce-api/package.json`; one `package.json` per `packages/contracts/*` package. |
| Build tooling | Turborepo (`turbo.json`), TypeScript (`tsconfig.base.json`), ESLint flat config (`eslint.config.mjs`, enforcing `apps/web`'s `agent-intents` import restriction — ADR-0012 — and `apps/commerce-api`'s `ui-commands`/`apps/web` import restriction — ADR-0013), Vitest per package. Each contracts package also has a `build` script (`scripts/emit-schema.ts`) that generates its committed JSON Schema; `packages/contracts/tools/` holds a small Node module hook those scripts use, and only they use. `apps/commerce-api`'s own `build` is `vite build` (SSR mode) — a different mechanism, since it produces a runnable service, not a JSON Schema artifact (ADR-0013). |
| CI | None. `apps/ai-service` will need its own invocation path when it exists — see ADR-0002's residual risk. |
| Git | Repository initialised; commits exist (this file is touched on every phase, this line just tracked reality late — see Phase 7's follow-up notes). |

## Prerequisites

Verified working with:

| Toolchain | Verified version | Pinned in |
| --------- | ----------------- | --------- |
| Node.js | v24.19.0 | `.nvmrc`, `package.json` `engines` (`>=20.9.0`) |
| pnpm | 12.3.4 | `package.json` `packageManager` |
| Python | not yet installed or needed | `apps/ai-service` does not exist yet |

## Commands

Run from the repository root unless noted. All verified passing as of
2026-09-25 (Phase 7, sub-phase 7.4).

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | `pnpm install` | Verified |
| Type check (all packages) | `pnpm turbo run typecheck` | Verified |
| Lint (all packages) | `pnpm turbo run lint` | Verified |
| Test (all packages) | `pnpm turbo run test` | Verified — 375 tests (43 `common` + 33 `ui-commands` + 31 `agent-intents` + 19 `api-contracts` + 174 `web` + 75 `commerce-api`), up from 329 before Phase 7. The first five packages' pre-existing tests (`api-contracts` is new) are unchanged in count and outcome from Phase 6. |
| Build (all packages) | `pnpm turbo run build` | Verified — `/`, `/cart`, `/checkout`, `/_not-found` all prerender; each contracts package's `build` regenerates its committed `schema/*.v1.json`; `commerce-api`'s `build` produces `dist/main.js`. Each contracts package's `build` prints a `no output files found` warning from turbo (its `outputs` key covers `dist/**`, not `schema/**`) — pre-existing since Phase 5, not a Phase 7 regression. |
| Generate one contract package's JSON Schema | `pnpm --filter @contracts/<name> build` | Verified for `common`, `ui-commands`, `agent-intents`, `api-contracts` — run after any schema change, before committing |
| Run `apps/web` in development | `pnpm --filter web dev` | Verified — serves on http://localhost:3000; `/cart` and `/checkout` also live |
| Run `apps/commerce-api` in development | `pnpm --filter commerce-api dev` | Verified — serves on http://127.0.0.1:3001; `GET /health` → `200 {"status":"ok"}`; `GET /v1/menu` and `GET /v1/menu/items/:itemId` also live |
| Run `apps/commerce-api`'s built output | `pnpm --filter commerce-api build && pnpm --filter commerce-api start` | Verified — same `/health` and `/v1/menu*` responses, from `dist/main.js` |

**Not verified this phase, same gap as Phases 3–6:** interactive browser
checks against `apps/web`. `NOT_APPLICABLE` for Phase 7 specifically — it
changed no UI (`apps/web` still reads its own fixture, not the new API) —
but the Chrome browser automation tool gap recorded since Phase 4 remains
open. `apps/commerce-api` has no UI to check with a browser tool; the Menu
routes were verified instead by `curl` against both `dev` and the built
`start` output, directly, for every response class in
[`docs/api/commerce-api.md`](../api/commerce-api.md) §6 and §11 (200 for
the menu and a found item, 200 with `available: false` for `gelato`, 404
`MENU_ITEM_NOT_FOUND` for an unknown item, 400 `INVALID_PAYLOAD` for a
malformed one) — not merely by the automated test suite.

`packages/contracts/{common,ui-commands,agent-intents,api-contracts}` have
no `dev`/`start` command — they are libraries, not runnable services.
`apps/ai-service` has no commands at all, because it does not exist:

| Task | Command | Status |
| ---- | ------- | ------ |
| `apps/ai-service` — anything | — | `NOT_CONFIGURED` |

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
  commerce-api/   NestJS service — scaffolded, working (Phase 6 foundation +
                   Phase 7 read-only Menu domain; no Cart/Order route)
    src/main.ts               bootstrap: parse env, fail-fast, build logger,
                               NestFactory.create, configureApp, listen
    src/configure-app.ts      every cross-cutting HTTP concern in one place
                               and one verified order — shared by main.ts
                               and every API test (versioning, request
                               context, content-type guard, body parser,
                               request logging, validation pipe, exception
                               filter, shutdown hooks)
    src/app.module.ts         wires ConfigModule + HealthModule; no HTTP
                               middleware of its own (see configure-app.ts)
    src/config/               env.schema.ts (Zod, fail-fast), config.module.ts
                               (APP_CONFIG, provided by main.ts's already-
                               validated config), test-config.ts (test-only)
    src/common/errors/        api-error-codes.ts, api.exception.ts,
                               all-exceptions.filter.ts — every thrown error
                               becomes exactly a @contracts/common
                               ContractError
    src/common/validation/    validation.ts — Standard Schema issues →
                               ContractError (INVALID_PAYLOAD /
                               UNSUPPORTED_CONTRACT_VERSION)
    src/common/http/          json-body.middleware.ts — JSON-only
                               content-type guard (415) + the 16kb body
                               limit's constant
    src/common/logging/       logger.ts (AppLogger: JSON logs carrying
                               requestId/correlationId automatically),
                               request-log.middleware.ts
    src/common/request-context/  AsyncLocalStorage-backed request/
                               correlation ids; X-Request-Id always
                               server-generated, X-Correlation-Id echoed if
                               valid else generated
    src/health/               health.module.ts, health.controller.ts (GET
                               /health, unversioned), health.service.ts
    test/                     app.e2e.test.ts, validation.e2e.test.ts,
                               menu.e2e.test.ts (real HTTP via listen(0) +
                               fetch, no supertest),
                               fixtures/validation-fixture.controller.ts
                               (test-only, proves the pipeline against a
                               real @contracts/agent-intents schema)
    src/modules/menu/         the first domain module (Phase 7) —
                               menu.controller.ts, menu.service.ts,
                               menu.mapper.ts, menu.module.ts
      domain/                 menu.types.ts, menu.invariants.ts,
                               menu.errors.ts (MenuItemNotFoundError),
                               menu.repository.ts (abstract MenuRepository)
      infrastructure/         menu.seed.ts (temporary copy of the web
                               fixture, plus categoryId),
                               in-memory-menu.repository.ts
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
    api-contracts/  scaffolded, working (Phase 7) — request/response shapes
                     (commerce-api → everyone); first schemas are the Menu
                     domain's menuResponseSchema / menuItemResponseSchema
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
  api/commerce-api.md                      HTTP conventions, error codes,
                                            headers, status table
  features/phase-1-web-foundation/         requirements.md, plan.md, test-plan.md
  features/phase-2-menu-browsing/          requirements.md, plan.md, test-plan.md
  features/phase-3-frontend-cart-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-4-frontend-checkout-simulation/  requirements.md, plan.md, test-plan.md
  features/phase-5-contract-foundation/    requirements.md, plan.md, test-plan.md
  features/phase-6-commerce-api-foundation/  requirements.md, plan.md, test-plan.md
  features/phase-7-menu-domain/              requirements.md, plan.md, test-plan.md
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
(sub-phases 3.1–3.5), Phase 4 (sub-phases 4.1–4.5), Phase 5 (sub-phases
5.1–5.4), Phase 6 (sub-phases 6.1–6.5), and Phase 7 (sub-phases 7.1–7.4) are
all implemented: workspace foundation, the `ui-commands` contracts package
(5 commands, unchanged since Phase 2), the menu UI with search and item
detail, real loading/error states via an async `getMenu()` seam, a complete
frontend-only cart (add/remove/increase/decrease, subtotals, item count, a
`/cart` route with cross-route persistence), the validated command pipeline
with its adversarial rejection path, a frontend-only checkout simulation
(`/checkout`: customer-details form, review, a simulated order confirmation,
and clearing the cart on success) that knowingly and temporarily violates
the order-state authority model — recorded in ADR-0011, not hidden — a
contract foundation: shared primitives (`@contracts/common`), a hardened and
enveloped `ui-commands`, and `@contracts/agent-intents` with three cart
intents, all with committed, freshness-tested JSON Schema (ADR-0012), a
NestJS commerce-api foundation: a Vite + SWC toolchain running the contract
packages' raw-TypeScript source unmodified, Zod-validated configuration,
request validation against the Phase 5 contract schemas (Nest's built-in
Standard Schema pipe), a structured error model (`@contracts/common`'s own
`ContractError`, nothing else), request correlation and JSON logging, URI
versioning, and `GET /health` (ADR-0013), and now a read-only Menu domain:
a new `@contracts/api-contracts` package, an in-memory `MenuRepository`
behind an abstract interface, `GET /v1/menu` and
`GET /v1/menu/items/:itemId`, and a shared `DomainError` base for turning a
domain module's own error into an HTTP response (ADR-0014).

Cart and Order are the next major phases and have not been planned yet —
`apps/commerce-api` has no route that mutates commerce state of any kind.
Wiring `apps/web` to read the real menu instead of its own fixture is also
still unplanned (Phase 7's OD8). `apps/ai-service` remains unplanned too.

Start planning any of them with `/forge`, which will route it to `/plan`.
