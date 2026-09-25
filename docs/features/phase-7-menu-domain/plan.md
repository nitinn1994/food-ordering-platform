# Plan — Phase 7: Menu Domain & Menu API

**Approval Status:** APPROVED (nitin, 2026-09-25, in conversation)

## Approach

Add the first domain module under `apps/commerce-api/src/modules/menu/`,
following the layout ADR-0013 §8 fixed in advance: controller → service →
repository interface, only `modules/<domain>/infrastructure/` touching
storage, no umbrella module. Phase 6's transport conventions are inherited
unchanged: `/v1` URI versioning, Standard Schema validation with Zod schemas
drawn from `packages/contracts`, `ContractError` bodies, constructor injection
by class type (no `@Inject`).

Response shapes live in a new `@contracts/api-contracts` package, built the
same way as its three siblings (raw-TS `exports`, `emit-schema.ts`, committed
JSON Schema, drift test). `vite.config.ts` already inlines every `@contracts/*`
package, so no build change is expected.

Verified before planning: Nest 12's `@Param(options)` accepts `{ schema }`
(`@nestjs/common` `route-params.decorator.d.ts`), so path params reuse the
existing global pipe and `validationExceptionFactory` unchanged.

## Model

- `MenuItem { id, categoryId, name, description, longDescription, priceCents,
  available, dietaryTags, allergens, calories }` — the web fixture's fields
  plus `categoryId`.
- `MenuCategory { id, name, items }`. Array order is display order.
- Invariants (checked at repository construction): unique category ids, unique
  item ids, every item's `categoryId` equals its parent category's id.
- Bounds (proposed, no product source): `name` 1–80, `description` 1–200,
  `longDescription` 1–1000, `dietaryTags` ≤ 10, `allergens` ≤ 20 (each a
  lowercase slug ≤ 32), `calories` int ≥ 0.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `packages/contracts/api-contracts/**` | new | Menu response contracts (OD4) |
| `apps/commerce-api/src/modules/menu/**` | new | The domain (per target structure) |
| `apps/commerce-api/src/common/errors/domain.error.ts` | new | `DomainError` base (OD7) |
| `apps/commerce-api/src/common/errors/all-exceptions.filter.ts` (+ test) | modified | `DomainError` branch |
| `apps/commerce-api/src/common/errors/api-error-codes.ts` | modified | `MENU_ITEM_NOT_FOUND` |
| `apps/commerce-api/src/app.module.ts` | modified | Import `MenuModule` |
| `apps/commerce-api/test/menu.e2e.test.ts` | new | Real-HTTP tests |
| `apps/commerce-api/package.json`, `pnpm-lock.yaml` | modified | `@contracts/api-contracts` workspace dep (via `pnpm install`) |
| `apps/commerce-api/README.md` | modified | No longer "no Menu route" |
| `docs/api/commerce-api.md`, `docs/api/contracts.md` | modified | Routes, codes, api-contracts |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0014; ADR-0004 status |
| `docs/architecture/system-architecture.md` | modified | §6 `api-contracts` row |
| `docs/development/getting-started.md` | modified | State, commands, test counts |
| `docs/product/food-ordering-frontend-mvp.md` | modified | §13 Phase 7 additions |

Must **not** change: `apps/web/**`,
`packages/contracts/{common,ui-commands,agent-intents}/**`, `configure-app.ts`,
`vite.config.ts`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`,
`CLAUDE.md`, `.claude/**`, Phase 1–6 feature documents. Needing any of them is
a scope change — stop and report.

## Target structure

```text
packages/contracts/api-contracts/
├── package.json · tsconfig.json · vitest.config.ts
├── schema/menu.v1.json
├── scripts/emit-schema.ts
└── src/ index.ts · menu.ts · menu.test.ts · schema.test.ts

apps/commerce-api/src/
├── common/errors/domain.error.ts
└── modules/menu/
    ├── menu.module.ts (+test) · menu.controller.ts · menu.service.ts (+test) · menu.mapper.ts
    ├── domain/  menu.types.ts · menu.invariants.ts (+test) · menu.errors.ts · menu.repository.ts
    └── infrastructure/  menu.seed.ts · in-memory-menu.repository.ts (+test)
apps/commerce-api/test/menu.e2e.test.ts
```

## Phases

### Phase 7.1 — Contracts package
- [x] `@contracts/api-contracts` package, `menu.ts` schemas, `index.ts`
- [x] `emit-schema.ts`, generated `schema/menu.v1.json`, drift test
- [x] Schema tests (accept fixture-shaped data; reject unknown key, bad id,
      negative/float price, over-length strings, non-slug tags)
- [x] `pnpm install` (workspace link only)
- **Done when:** AC8 holds; targeted `build`/`test`/`lint`/`typecheck` for the
  package pass.

### Phase 7.2 — Domain and repository
- [x] `domain/menu.types.ts`, `menu.invariants.ts`, `menu.errors.ts`,
      `menu.repository.ts`
- [x] `infrastructure/menu.seed.ts`, `in-memory-menu.repository.ts`
- [x] Tests for invariants and repository (order, hit/miss, frozen)
- **Done when:** AC6, AC7 hold (targeted commerce-api tests).

### Phase 7.3 — Service, controller, module, error mapping
- [x] `common/errors/domain.error.ts`; filter branch + tests; error code
- [x] `menu.mapper.ts`, `menu.service.ts` (+ test with fake repository)
- [x] `menu.controller.ts`, `menu.module.ts` (+ DI test); `AppModule` import;
      `@contracts/api-contracts` runtime dependency
- **Done when:** AC5 holds; targeted commerce-api tests pass.

### Phase 7.4 — End-to-end, docs, full validation
- [x] `test/menu.e2e.test.ts`
- [x] `curl` against `dev` and built `start`
- [x] All documentation in the affected-files table
- **Done when:** AC1–AC4, AC9–AC12 hold and every command in the test plan
  has been run.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| Seed duplicates the web fixture | Two menus drift | Temporary; commented in the seed; deleted by the web integration phase |
| New contracts package breaks Vite inlining or turbo `^build` | Build red | `build` + `start` checked in 7.3/7.4; any config change is stop-and-report |
| `@Param` + `strictObject` rejects Express-added params | Every item request 400s | e2e test; fallback `z.object` for params only, reported |
| Shared filter change regresses Phase 6 | Error model weakened | Existing filter tests must pass unchanged, plus new branch tests |
| Response shape becomes de facto contract | Costly later change | Intended; ADR-0014; in-major changes additive only |
| Scope creep | Guessed interfaces | Declined items listed; any addition is stop-and-ask |

## Assumptions

**Verified:** `@Param({ schema })` exists in Nest 12.1; `vite.config.ts`
externalizes everything except `@contracts/*`; `pnpm-workspace.yaml` already
includes `packages/contracts/*`; the web fixture has 3 categories / 6 items
with `gelato` unavailable.

**Believed, not verified:**
- `validationExceptionFactory` yields `field: "itemId"` for a param-object
  schema failure (issue path `["itemId"]`).
- A new `@contracts/*` package needs no `turbo.json` or ESLint change.
- Nest resolves an abstract class as a provider token by type without
  `@Inject`.

## Not doing

- Categories endpoint, filtering, availability enforcement, menu writes.
- Any `apps/web` change, CORS.
- Any database, ORM, or change to ADR-0004 beyond recording its acceptance
  for Menu.

## Specialised review needed?

Standard Path — not required.

- security: no — read-only, no auth; the one untrusted input (`itemId`) goes
  through the existing Phase 6 validation boundary.
- performance: no — six items in memory.
- data / migration: no — no persistence.
