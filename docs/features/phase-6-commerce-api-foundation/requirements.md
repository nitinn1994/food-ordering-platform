# Requirements — Phase 6: NestJS Commerce API Foundation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the
full plan including OD1–OD11 and a recommendation on each; the recommendations
were therefore taken as the decisions and are recorded in full below)
**Risk:** HIGH
**Path:** Full

## Problem

`system-architecture.md` §1 and §5 make `apps/commerce-api` the sole authority
for menu, cart, order, pricing, and payment state. That authority exists only on
paper: `apps/commerce-api` is an empty directory, and four temporary modules in
`apps/web` (`fixtures/menu.ts`, `cartStore.tsx`, `simulate.ts`,
`checkout/order.ts`) stand in for it — ADR-0011 records that one of them
knowingly violates the order-state authority model because nothing else exists.

Phase 5 designed the vocabulary commerce-api will consume
(`@contracts/common`, `@contracts/agent-intents`) and an error shape
(`contractErrorSchema`) explicitly intended for "a commerce-api response body",
but nothing constructs it yet. Before any domain logic is written, the
transport boundary it will sit behind — validation, error shape, correlation,
versioning, configuration, logging — needs to exist and be tested, so that the
first domain phase inherits conventions rather than inventing them.

## Goal

A runnable, tested NestJS 12 modular-monolith foundation in `apps/commerce-api`
that boots, validates its configuration, rejects invalid requests with a
contract-shaped error before any handler runs, logs structured JSON with request
and correlation ids, and exposes `GET /health` — and implements no Menu, Cart,
or Order behaviour.

## In scope

- Scaffolding `apps/commerce-api` as the workspace package `commerce-api`
  (pnpm + Turborepo, ADR-0002), with `lint`, `typecheck`, `test`, `build`,
  `dev`, and `start` scripts.
- A toolchain that lets the Nest runtime and its tests consume the contracts
  packages' raw-TypeScript `exports` unchanged, with decorator metadata emitted
  (OD1).
- Zod-validated environment configuration, fail-fast at bootstrap (OD7).
- Request validation at the API boundary via Nest 12's built-in
  `StandardSchemaValidationPipe` and the Phase 5 Zod schemas (OD2).
- A single error model: every error response body is a `@contracts/common`
  `ContractError` (OD3), with API-level error codes owned by commerce-api.
- Request and correlation ids (`X-Request-Id`, `X-Correlation-Id`) carried via
  `AsyncLocalStorage`.
- Structured JSON logging via Nest's built-in `ConsoleLogger({ json: true })`
  (OD6).
- URI versioning (`/v1`) for business routes; an unversioned `GET /health`
  liveness endpoint (OD8).
- Unit, module-level, and in-process API tests (Vitest, ADR-0008).
- An ESLint boundary rule forbidding commerce-api from importing
  `@contracts/ui-commands` or `apps/web`.
- Documentation: ADR-0013, `docs/api/commerce-api.md`, `getting-started.md`,
  `system-architecture.md` §6/§8.

## Out of scope

- **Menu, Cart, Order modules** — no module, route, service, or repository for
  any domain, and no empty module shells (OD4).
- **Any production business route** — validation is proven through a
  test-only fixture controller (OD5).
- **Any database or persistence**, including an in-memory store. ADR-0004 stays
  `Proposed`; the first domain phase decides it (OD10).
- **`packages/contracts/api-contracts`** — stays empty (Phase 5 D12); no
  business request/response contract is produced yet.
- **Any change to `packages/contracts/**`** — sources and generated schemas are
  consumed as-is.
- **CORS, frontend integration, ai-service integration.**
- Authentication, authorization, rate limiting, helmet, payments, customer
  accounts, Python, LangChain/LangGraph, OpenAI, tool calling, voice, RAG, MCP,
  Redis, Kafka, RabbitMQ, microservices, Docker, Kubernetes, CI/CD, cloud
  deployment, production observability, Swagger/OpenAPI.

## Risk assessment (Full Path)

**Blast radius.** New code with no existing consumer: nothing in `apps/web` or
`packages/contracts` imports commerce-api, and neither is modified. A mistake
here breaks only commerce-api itself — but the conventions it sets
(error shape, validation, versioning) are copied by every later domain phase
and consumed by `ai-service` and `apps/web`, so a wrong convention is
expensive later even though it is cheap now. The workspace-wide checks are
shared: a broken commerce-api `build` or `lint` fails `pnpm turbo run …` for
the whole repository.

**Reversibility.** Good. Nothing is persisted, migrated, published, or
deployed. The new directory can be deleted outright; the only edits to
existing files are one ESLint rule, the lockfile, possibly one
`allowBuilds` entry, and documentation.

**Detection.** Fast for the things that matter. The error model is checked by
parsing every error response against `contractErrorSchema`; validation
ordering by a handler spy; dependency injection by an explicit test; the
workspace's existing 281 tests by re-running them unchanged. What detection
does **not** cover: how `ai-service` and `apps/web` will actually experience
these conventions — neither calls commerce-api in this phase.

The main uncertainty is the toolchain (OD1), so sub-phase 6.1 is a spike with
a hard stop before any further work.

## Acceptance criteria

- [x] **AC1** `apps/commerce-api` is the workspace package `commerce-api` with
      `lint`, `typecheck`, `test`, `build`, `dev`, and `start` scripts, and
      `pnpm turbo run lint`, `typecheck`, `test`, and `build` pass across the
      workspace with the existing 281 tests unchanged in count and outcome.
- [x] **AC2** Both `pnpm --filter commerce-api dev` and `start` (from built
      output) serve `GET http://127.0.0.1:3001/health` → `200 {"status":"ok"}`.
- [x] **AC3** Constructor injection by class type (no `@Inject`) is proven to
      work under Vitest by a test, and in the built runtime by AC2.
- [x] **AC4** An invalid environment value (e.g. `PORT=abc`) makes the process
      exit non-zero before listening, with a message naming the field and not
      printing its value.
- [x] **AC5** Every error response — 400, 404, 413, 415, 500 — has a body that
      parses against `@contracts/common`'s `contractErrorSchema`.
- [x] **AC6** An invalid request body returns `400 INVALID_PAYLOAD` and the
      handler is never invoked (asserted by a spy); an unknown key is rejected;
      `contractVersion: 2` returns `UNSUPPORTED_CONTRACT_VERSION`.
- [x] **AC7** A 500 response contains no stack trace, no exception message, and
      no echo of the request payload, and the failure is logged with its
      `requestId`.
- [x] **AC8** Every response carries `X-Request-Id` (always server-generated);
      a valid inbound `X-Correlation-Id` is echoed back, and a missing or
      invalid one is replaced with a generated id.
- [x] **AC9** Log output is single-line JSON including `requestId` and
      `correlationId`; no request body appears in any log line.
- [x] **AC10** Business routes are served under `/v1`; `/health` is
      unversioned.
- [x] **AC11** API tests build the application with the same
      `configureApp()` function `main.ts` uses.
- [x] **AC12** ESLint fails on a commerce-api import of
      `@contracts/ui-commands` — demonstrated by an actual lint run against a
      temporary violation, which is then removed.
- [x] **AC13** No Menu, Cart, or Order module, route, repository, or
      persistence exists, and `apps/commerce-api/package.json` declares no
      database driver or ORM.
- [x] **AC14** `git status` shows no change under `apps/web`,
      `packages/contracts`, `apps/ai-service`, `infrastructure`, `turbo.json`,
      `tsconfig.base.json`, `CLAUDE.md`, `.claude/`, or any Phase 1–5 feature
      document.
- [x] **AC15** ADR-0013, `docs/api/commerce-api.md`, `getting-started.md`, and
      `system-architecture.md` are updated in the same change.

AC5, AC6, and AC7 are the ones worth failing the phase over: they are the
untrusted-input boundary this phase exists to establish.

## Decisions (OD1–OD11)

Posed in the plan with a recommendation on each, and approved as recommended.

| # | Question | Decision | Why |
| - | -------- | -------- | --- |
| OD1 | How does the runtime consume the contracts packages' raw-TS `exports`? | **One Vite + SWC pipeline**: Vitest + `unplugin-swc` for tests; `vite build` (SSR) bundling `@contracts/*` inline and externalizing `node_modules`, with SWC emitting decorator metadata; dev runs the build under `node --watch`. Finalized by the 6.1 spike. | Leaves Phase 5 packaging untouched; one transform for test and build. Fallbacks: B — Nest CLI + webpack; C — contracts emit `dist/` (changes Phase 5, needs separate approval). |
| OD2 | Validation mechanism | **Nest 12 `StandardSchemaValidationPipe`** with the Phase 5 Zod schemas, custom `exceptionFactory` | Zod 4 implements Standard Schema; one schema source (ADR-0003); no `class-validator`. Fallback: a ~30-line custom Zod pipe. |
| OD3 | Error response body | **Bare `ContractError`**; ids in headers; `api-contracts` stays empty | Reuses the committed `error.v1.json`; no Phase 5 change. |
| OD4 | Domain modules now or incrementally? | **Incrementally**, one per phase; no umbrella `Commerce` module | Empty shells would guess at interfaces (D12's reasoning). Layout rules are documented in ADR-0013 instead. |
| OD5 | How is end-to-end validation proven? | **Test-only fixture controller** | No production business route before a domain owns it. |
| OD6 | Logging | **Built-in `ConsoleLogger({ json: true })`** | Zero dependencies; sufficient for local development. |
| OD7 | Configuration | **Zod env schema + Node `--env-file-if-exists`** | No `@nestjs/config`/`dotenv`; fail-fast; Node 24 built-in. |
| OD8 | Versioning | **URI `/v1`**; `/health` unversioned | Explicit, visible in logs, trivially routable. |
| OD9 | HTTP adapter | **Express** | Nest default; fewest surprises. |
| OD10 | Database in Phase 6 | **None**; ADR-0004 stays `Proposed` | Health has no dependency to check; persistence belongs to a domain phase. |
| OD11 | Module format | **ESM** | NestJS 12 and every workspace package are ESM. |

## Open questions

Carried forward, not answered here.

1. **Relationship between the `X-Correlation-Id` header and an intent
   envelope's `correlationId`.** Both exist; which wins when they disagree is
   for the phase that executes intents.
2. **Idempotency semantics** — still `system-architecture.md` §8 gap 3.
3. **Service-to-service authentication** between `ai-service` and
   commerce-api — any local process can call the API today.
4. **CORS policy** for `apps/web`'s direct touch-driven calls — decided when
   the frontend integrates.
5. **Whether API-level error codes move into `api-contracts`** once a
   consumer needs to branch on them.
