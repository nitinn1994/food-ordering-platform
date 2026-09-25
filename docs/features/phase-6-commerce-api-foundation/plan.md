# Plan — Phase 6: NestJS Commerce API Foundation

**Approval Status:** APPROVED (nitin, 2026-09-25, in conversation)

## Approach

Scaffold `apps/commerce-api` as a sibling of `apps/web` in the existing pnpm +
Turborepo workspace, copying the conventions already in the repository rather
than NestJS CLI defaults where the two disagree: ESM, `tsconfig.json` extending
`tsconfig.base.json`, colocated `*.test.ts` files, Vitest (ADR-0008), and the
root flat ESLint config. Phase 5's contracts are consumed through their
existing `exports` without modification.

Three patterns already in the codebase are followed:

- **Zod is the one schema source (ADR-0003).** Requests are validated with the
  Phase 5 schemas via Nest 12's built-in `StandardSchemaValidationPipe` (Zod 4
  implements Standard Schema) — no `class-validator` DTOs duplicating them.
- **The error shape designed in Phase 5 is used as designed.** `common/src/errors.ts`
  reserves `contractErrorSchema` for "a commerce-api response body" and says
  domain codes "arrive with the service that owns them"; commerce-api owns its
  API-level codes and emits exactly that shape.
- **Structural beats asserted (D11).** An ESLint rule makes it impossible for
  commerce-api to import `@contracts/ui-commands` or `apps/web`.

The one genuinely uncertain mechanism is the toolchain (OD1): Nest needs
`emitDecoratorMetadata`, which Vitest's default esbuild transform and Node's
native type stripping do not provide, and the contracts packages export raw
`.ts` with extensionless relative imports, which plain Node cannot load. The
chosen answer is one Vite + SWC pipeline for tests and build. Sub-phase 6.1
proves it before anything else is built on it.

Verified before planning (registry and published tarball, 2026-09-25):
`@nestjs/core` 12.1.0 is `"type": "module"`; `@nestjs/common` 12.1.0 ships
`StandardSchemaValidationPipe` (with `exceptionFactory`) and a `ConsoleLogger`
`json` option.

## Target structure

```text
apps/commerce-api/
├── package.json · tsconfig.json · vitest.config.ts · vite.config.ts
├── .env.example
├── README.md
├── src/
│   ├── main.ts                     bootstrap only: load config → create → configureApp → listen
│   ├── app.module.ts               imports ConfigModule, HealthModule
│   ├── configure-app.ts            global filter, pipe, versioning, middleware, body limits, shutdown hooks
│   ├── config/
│   │   ├── env.schema.ts (+ test)  Zod schema for process.env
│   │   └── config.module.ts        @Global, provides APP_CONFIG
│   ├── common/
│   │   ├── errors/                 api-error-codes.ts, api-exception.ts, all-exceptions.filter.ts (+ test)
│   │   ├── validation/             validation.ts — pipe options + issue → ContractError mapping (+ test)
│   │   ├── request-context/        request-context.ts (AsyncLocalStorage), request-context.middleware.ts (+ test)
│   │   └── logging/                logger.ts — ConsoleLogger({ json }) + request-log middleware
│   └── health/                     health.module.ts, health.controller.ts (+ test)
└── test/
    ├── app.e2e.test.ts             real HTTP via app.listen(0) + fetch
    └── fixtures/validation-fixture.controller.ts   test-only route (OD5)
```

## Conventions established

| Concern | Convention |
| --- | --- |
| Style | REST, JSON only, resource nouns |
| Versioning | URI `/v1/...` for business routes; `/health` unversioned. URL version and `contractVersion` are independent |
| Request body | `application/json` only (else 415); 16 kb limit (else 413) |
| Error body | Exactly a `ContractError` `{ code, message, field?, details? }`; `code` is the only field clients branch on |
| Status codes | 200/201 · 400 schema failure · 404 · 413 · 415 · 500; 422 reserved for domain rules, 409 for idempotency conflicts, 503 for readiness |
| Headers | `X-Request-Id` always server-generated; `X-Correlation-Id` echoed if valid per `correlationIdSchema`, else generated |
| Validation mapping | `INVALID_PAYLOAD`, or `UNSUPPORTED_CONTRACT_VERSION` when the failing path is `contractVersion`; `field` = first failing path (≤ 64 chars); `message` ≤ 500 chars; input never echoed |
| Unknown errors | 500 `INTERNAL_ERROR`, generic message; details logged server-side with `requestId` |
| Logging | One JSON line per entry; one request-log line per request (method, path, status, duration, ids); never bodies, headers, or query strings |
| Config | `NODE_ENV` (development/test/production), `HOST` (default `127.0.0.1`), `PORT` (default `3001`), `LOG_LEVEL`, `LOG_FORMAT` (`json`/`pretty`); fail-fast, field names only |
| Express | `x-powered-by` disabled; no CORS |
| Future modules | `modules/<domain>/` = controller → service → repository interface; only `modules/<domain>/infrastructure/` may touch storage; cross-module access via exported services only; direction `orders → cart → menu`, no cycles |

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `apps/commerce-api/**` (per target structure) | new | The application |
| `eslint.config.mjs` | modified | Boundary rule: `apps/commerce-api/**` may not import `@contracts/ui-commands` or `apps/web` (AC12) |
| `pnpm-lock.yaml` | modified | Via `pnpm install` only |
| `pnpm-workspace.yaml` | modified **only if needed** | `allowBuilds` entry for `@swc/core`, if pnpm blocks its install script — reported if so |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0013 |
| `docs/architecture/system-architecture.md` | modified | §6: commerce-api consumes `common`; §8: correlation reaches commerce-api logs; gaps 3/4 still open |
| `docs/development/getting-started.md` | modified | New commands, test counts (mandatory per that file) |
| `docs/api/commerce-api.md` | new | HTTP conventions, error codes, headers, status table |

Must **not** change: `apps/web/**`, `packages/contracts/**` (including every
`schema/*.v1.json`), `apps/ai-service/**`, `infrastructure/**`, `turbo.json`,
`tsconfig.base.json`, root `package.json` scripts, `CLAUDE.md`, `.claude/**`,
Phase 1–5 feature documents. Needing any of them is a scope change — stop and
report.

## Dependencies

| Package | Kind | Why |
| --- | --- | --- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` (^12.1) | runtime | Framework, Express adapter |
| `reflect-metadata` (^0.2), `rxjs` (^7.8) | runtime | Nest peers |
| `zod` (^4.1.12) | runtime | Env schema |
| `@contracts/common` (workspace) | runtime | Error, id, version schemas |
| `@nestjs/testing` | dev | Testing module |
| `@contracts/agent-intents` (workspace) | dev | Test-only validation fixture |
| `vitest` (^3.2), `unplugin-swc`, `@swc/core` | dev | Tests with decorator metadata |
| `vite` (a version compatible with vitest 3.2 — not 8.x) | dev | Build |
| `typescript`, `@types/node`, `@types/express` | dev | Types |

Deliberately excluded: `class-validator`, `class-transformer`,
`@nestjs/config`, `dotenv`, `pino`, `@nestjs/terminus`, `supertest`, `helmet`,
`@nestjs/swagger`, `@nestjs/cli`, any ORM or database driver.

## Phases

### Phase 6.1 — Toolchain spike and scaffold
- [ ] `package.json` (`commerce-api`, ESM, scripts), `tsconfig.json`
      (extends base; `experimentalDecorators`, `emitDecoratorMetadata`)
- [ ] `vitest.config.ts` with `unplugin-swc`; `vite.config.ts` SSR build
      bundling `@contracts/*`, externalizing other `node_modules`
- [ ] Minimal `main.ts` + `AppModule`; one provider injected by class type;
      one import from `@contracts/common`
- [ ] `pnpm install`; confirm `@swc/core` installs (report any `allowBuilds` need)
- **Done when:** a Vitest test proves type-based injection (AC3), and
  `build` → `start` and `dev` both boot the app. **Stop and report** before
  6.2 — if OD1-A fails, bring OD1-B or OD1-C back for a decision.

### Phase 6.2 — Config, logging, request context
- [ ] `env.schema.ts` + tests; `ConfigModule` providing `APP_CONFIG`;
      fail-fast in `main.ts`; `.env.example`
- [ ] JSON `ConsoleLogger`; request-log middleware
- [ ] `AsyncLocalStorage` request context; `X-Request-Id` / `X-Correlation-Id`
      middleware + tests; `enableShutdownHooks()`
- **Done when:** AC4, AC8, AC9 hold (targeted tests).

### Phase 6.3 — Error model and validation
- [ ] `api-error-codes.ts`, `ApiException`, `AllExceptionsFilter` + tests
- [ ] Global `StandardSchemaValidationPipe` with the issue → `ContractError`
      `exceptionFactory` (custom-pipe fallback if schemas cannot be attached
      cleanly — reported if used)
- [ ] 16 kb JSON body limit (413), non-JSON body (415), unknown route (404)
- [ ] Test-only fixture controller using `agentIntentRequestSchema`
- **Done when:** AC5, AC6, AC7 hold.

### Phase 6.4 — Health and API conventions
- [ ] `configure-app.ts` shared by `main.ts` and tests; URI versioning
- [ ] `HealthModule` / `GET /health`
- [ ] `test/app.e2e.test.ts` over real HTTP (`listen(0)` + `fetch`)
- **Done when:** AC2, AC10, AC11 hold.

### Phase 6.5 — Boundary guard and documentation
- [ ] ESLint rule; demonstrate it fails on a temporary violation, then remove it
- [ ] ADR-0013; `docs/api/commerce-api.md`; `getting-started.md`;
      `system-architecture.md` §6/§8; `apps/commerce-api/README.md`
- [ ] Full validation run
- **Done when:** AC1, AC12, AC13, AC14, AC15 hold and every command in the
  test plan has been run.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| Contracts' raw-TS `exports` cannot be consumed by the Nest runtime | Nothing runs | 6.1 spike with a hard stop; fallbacks OD1-B/C require a decision |
| Vitest omits decorator metadata | Injection silently fails in tests | `unplugin-swc`; AC3 is an explicit test |
| NestJS 12 postdates prior knowledge | Wrong API assumptions | Pipe and JSON logger confirmed from the tarball; schema attachment verified in 6.1/6.3, custom-pipe fallback |
| Vite 8 incompatible with Vitest 3.2 | Install or runtime failure | Pin a Vite version Vitest 3.2 supports |
| `verbatimModuleSyntax` + `emitDecoratorMetadata` (TS1272) | Typecheck errors | Value imports for injected classes; local override only if needed, reported |
| pnpm blocks `@swc/core` install script | SWC unavailable | `allowBuilds` entry, reported |
| Input echoed or internals leaked in errors | Untrusted-input boundary weakened | AC6, AC7 |
| Scope creep into domain modules | Guessed interfaces | AC13; any domain module is a stop-and-ask |
| New package breaks workspace-wide turbo tasks | Whole repository red | Full `turbo run` at end of 6.1 and 6.5; existing 281 tests compared |

## Assumptions

**Verified** (registry/tarball, 2026-09-25): NestJS 12.1.0 is current and ESM;
`StandardSchemaValidationPipe` and `ConsoleLogger` `json` exist in
`@nestjs/common` 12.1.0; `unplugin-swc` 2.0.0 peers on `@swc/core`; Node
v24.19.0 and pnpm 12.3.4 are installed; `pnpm-workspace.yaml` already includes
`apps/*`; `turbo.json` `build` outputs already include `dist/**`; `.env` and
`dist/` are already gitignored.

**Believed, not verified:**

- `vite build` in SSR mode with `unplugin-swc` bundles `@contracts/*` source and
  emits decorator metadata that Nest 12 reads correctly (6.1 proves it).
- The Standard Schema pipe can be given a Zod schema per parameter without a
  custom decorator (6.3 proves it).
- The root ESLint flat config applies to `apps/commerce-api` from `eslint .`
  inside the package, as it does for the contracts packages.
- Nest's `ConsoleLogger` JSON mode can carry `requestId`/`correlationId` via a
  thin subclass.

## Not doing

- Menu, Cart, Order modules, routes, services, repositories, or shells.
- Any database, in-memory store, or ADR-0004 decision.
- `api-contracts` content; any `packages/contracts` change.
- CORS, authentication, authorization, rate limiting, helmet, Swagger.
- Integration with `apps/web` or `apps/ai-service`.
- Docker, Kubernetes, CI/CD, deployment, production observability.

## Specialised review needed?

- **security: yes** — this phase establishes the API's untrusted-input
  boundary. Brief: validation runs before handlers; strict objects; no input
  reflection; no internals in 500s; no body logging; correlation-header
  handling; body limits; loopback bind; the ESLint boundary.
- **performance: no** — no queries, no I/O beyond HTTP, small payloads.
- **data / migration: no** — no persistence of any kind.
