# Requirements — Phase 7: Menu Domain & Menu API

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the
full plan including OD1–OD8 and a recommendation on each; the recommendations
were therefore taken as the decisions and are recorded below)
**Risk:** MEDIUM
**Path:** Standard

## Problem

`system-architecture.md` §5 makes `apps/commerce-api` the authority for menu
and availability, but Phase 6 deliberately shipped no domain (Phase 6 AC13).
The only menu that exists is `apps/web/src/lib/fixtures/menu.ts`, marked
temporary in `food-ordering-frontend-mvp.md` §7 item 1. Neither `apps/web` nor
a future `ai-service` has a backend menu to read, and
`packages/contracts/api-contracts` is still empty because, until now, no
producer existed (Phase 5 D12).

## Goal

A read-only Menu domain in `apps/commerce-api`, layered controller → service →
domain → repository interface → in-memory seed, exposing `GET /v1/menu` and
`GET /v1/menu/items/:itemId` whose responses are defined by a new
`@contracts/api-contracts` package.

## In scope

- New workspace package `@contracts/api-contracts` with menu response schemas
  (`menuItemSchema`, `menuCategorySchema`, `menuResponseSchema`,
  `menuItemResponseSchema`, `menuItemParamsSchema`) and a committed, drift-tested
  `schema/menu.v1.json`. Reuses `@contracts/common` ids and `priceCentsSchema`.
- `apps/commerce-api/src/modules/menu/`: domain types, invariants, domain
  error, abstract `MenuRepository`, `InMemoryMenuRepository` over a static seed
  (copied from the web fixture, plus `categoryId`), `MenuService`, mapper,
  `MenuController`, `MenuModule`.
- A shared `DomainError` base and one `AllExceptionsFilter` branch mapping it
  to a `ContractError`; new code `MENU_ITEM_NOT_FOUND`.
- Tests: contracts, domain, repository, service (with a fake repository),
  filter, module, and end-to-end over real HTTP.
- Documentation: ADR-0014 (and ADR-0004 status line), `commerce-api.md`,
  `contracts.md`, `system-architecture.md` §6, `getting-started.md`,
  `food-ordering-frontend-mvp.md` §13, `apps/commerce-api/README.md`.

## Out of scope

- `GET /v1/menu/categories` and any server-side filtering (no consumer).
- Wiring `apps/web` to the API, CORS, any `apps/web` change (OD8).
- Enforcing availability (Cart phase), menu writes/admin.
- Cart, Order, Payment, authentication, customer accounts, AI, LangChain,
  LangGraph, OpenAI, RAG, voice, MCP, any database or ORM, Redis, Kafka,
  RabbitMQ, microservices, Docker, Kubernetes, deployment.
- Any change to `packages/contracts/{common,ui-commands,agent-intents}`.

## Acceptance criteria

- [x] **AC1** `GET /v1/menu` → 200; body parses against `menuResponseSchema`;
      3 categories and 6 items in fixture order.
- [x] **AC2** `GET /v1/menu/items/tiramisu` → 200, parses against
      `menuItemResponseSchema`; `gelato` → 200 with `available: false`.
- [x] **AC3** A well-formed unknown id → 404 `MENU_ITEM_NOT_FOUND`, a valid
      `ContractError`, with `X-Request-Id` and `X-Correlation-Id`.
- [x] **AC4** A malformed `itemId` → 400 `INVALID_PAYLOAD` with
      `field: "itemId"`; the value is never echoed; the handler is never
      invoked (spy).
- [x] **AC5** The controller contains no branching; `MenuService` depends only
      on the abstract `MenuRepository`; a service test passes with a fake
      repository; only `infrastructure/` imports the seed.
- [x] **AC6** An invalid seed (duplicate id, orphan item) fails repository
      construction — tested.
- [x] **AC7** Returned domain data is frozen; mutating it throws.
- [x] **AC8** `@contracts/api-contracts` exists with a passing schema-drift
      test; no file in `common`, `ui-commands`, `agent-intents` changes.
- [x] **AC9** No `/v1/menu/categories`, and no cart/order/payment/auth/database
      code or dependency.
- [x] **AC10** `pnpm turbo run lint`, `typecheck`, `test`, `build` pass; the
      existing 329 tests are unchanged in count and outcome.
- [x] **AC11** `dev` and `start` both serve the menu routes (verified by `curl`).
- [x] **AC12** Every document listed in scope is updated in the same change.

AC3, AC4 and AC5 are the ones worth failing the phase over: the input
boundary, the error convention every later domain inherits, and the layering.

## Decisions (OD1–OD8)

| # | Question | Decision | Why |
| - | -------- | -------- | --- |
| OD1 | `/api/v1` or `/v1`? | **`/v1`** | Phase 6 convention (ADR-0013); a global prefix would move `/health` too. |
| OD2 | `products` or `items`? | **`items`** | Matches `MenuItem`, `menuItemIdSchema`, intents' `itemId`. |
| OD3 | Endpoints | **`GET /v1/menu`, `GET /v1/menu/items/:itemId`** | Justified by `getMenu()` and item detail / agent menu reads; categories endpoint and filters have no consumer. |
| OD4 | Where response schemas live | **New `@contracts/api-contracts`** | The directory `system-architecture.md` §6 reserves for commerce-api's shapes; D12's blocker (no producer) is gone. |
| OD5 | Data source | **In-memory seed behind abstract `MenuRepository`** | Read-only domain; ADR-0004's transactional risk does not apply to reads. DB choice deferred to Cart. Recorded in ADR-0014. |
| OD6 | `dietaryTags` / `allergens` | **Bounded slug strings, not enums** | Adding an enum member later breaks old consumers (same reasoning as `errors.ts`). |
| OD7 | Domain error → HTTP | **Shared `DomainError` base + one filter branch** | Domain stays HTTP-free; filter stays module-agnostic; reusable by later domains. |
| OD8 | Wire `apps/web` now? | **No** | Needs CORS and a frontend change — separate phase. |

## Open questions

1. Whether `apps/web` switches to the API wholesale or behind its existing
   `getMenu()` seam — decided by the integration phase.
2. Cache headers / ETag policy for menu reads — none set; Express's default
   weak ETag applies.
3. Availability enforcement semantics for the Cart phase (reject vs. warn).
