# Test Plan — Phase 6: NestJS Commerce API Foundation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 — package scripts; workspace checks pass; 281 existing tests unchanged | `pnpm turbo run lint typecheck test build`; compare per-package test counts against 43 / 33 / 31 / 174 | automated |
| AC2 — `dev` and `start` serve `/health` | Run each, `curl -i http://127.0.0.1:3001/health`, expect `200 {"status":"ok"}` | manual (commands recorded) |
| AC3 — type-based injection | Module test: a provider injected by class type with no `@Inject` resolves and is called | automated |
| AC4 — config fail-fast | Unit tests on `env.schema.ts`; manual run with `PORT=abc` → non-zero exit, field named, value not printed | automated + manual |
| AC5 — every error body is a `ContractError` | API tests parse 400/404/413/415/500 bodies with `contractErrorSchema` | automated |
| AC6 — validation before handler | API tests via fixture controller: invalid body → 400 `INVALID_PAYLOAD`, handler spy not called; extra key rejected; `contractVersion: 2` → `UNSUPPORTED_CONTRACT_VERSION` | automated |
| AC7 — no leakage on 500 | Fixture route throws an error with a sentinel message; body lacks sentinel, stack, and payload; captured log contains `requestId` | automated |
| AC8 — request/correlation headers | API tests: `X-Request-Id` present and server-generated even when a client sends one; valid inbound `X-Correlation-Id` echoed; missing/over-length one replaced | automated |
| AC9 — JSON logs, no bodies | Capture logger output during an API test with a sentinel in the body; each line `JSON.parse`s, has both ids, lacks the sentinel | automated |
| AC10 — `/v1` and unversioned `/health` | API tests: fixture reachable only at `/v1/...`; `/health` 200, `/v1/health` 404 | automated |
| AC11 — shared `configureApp()` | API tests import and call the same `configureApp` as `main.ts`; confirmed by reading both | automated + manual |
| AC12 — ESLint boundary | Temporarily add `import "@contracts/ui-commands"` in a commerce-api file, run `pnpm --filter commerce-api lint`, expect failure; remove it, re-run, expect pass | manual (commands recorded) |
| AC13 — no domain code, no DB driver | Inspect `src/` tree and `package.json` | manual |
| AC14 — protected paths untouched | `git status` / `git diff --stat` | manual |
| AC15 — docs updated | Read ADR-0013, `docs/api/commerce-api.md`, `getting-started.md`, `system-architecture.md` | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| Env schema: defaults, coercion, rejection, no value in message | AC4 | `apps/commerce-api/src/config/env.schema.test.ts` |
| Issue → `ContractError` mapping, truncation, version code | AC5, AC6 | `apps/commerce-api/src/common/validation/validation.test.ts` |
| Exception filter: `ApiException`, `HttpException`, unknown error | AC5, AC7 | `apps/commerce-api/src/common/errors/all-exceptions.filter.test.ts` |
| Request-context middleware: id generation, correlation acceptance/replacement | AC8 | `apps/commerce-api/src/common/request-context/request-context.middleware.test.ts` |
| Health controller | AC2 | `apps/commerce-api/src/health/health.controller.test.ts` |
| AppModule compiles; injection by class type | AC3 | `apps/commerce-api/src/app.module.test.ts` |
| End-to-end over real HTTP | AC5–AC11 | `apps/commerce-api/test/app.e2e.test.ts` |

No existing test is modified.

## Validation commands

Workspace commands are declared in root `package.json`, `turbo.json`, and
`docs/development/getting-started.md`. The `commerce-api` package scripts are
created by this phase and are only valid once 6.1 lands.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| install | `pnpm install` | PASS |
| lint   | `pnpm turbo run lint` | PASS |
| types  | `pnpm turbo run typecheck` | PASS |
| test   | `pnpm turbo run test` | PASS — 281 existing plus new commerce-api tests |
| build  | `pnpm turbo run build` | PASS |
| targeted | `pnpm --filter commerce-api test` / `lint` / `typecheck` | PASS |
| runtime | `pnpm --filter commerce-api dev`, then `curl -i http://127.0.0.1:3001/health` | 200 |
| format | — | `NOT_CONFIGURED` — no formatter declared |
| Python | — | `NOT_CONFIGURED` — `apps/ai-service` does not exist |
| browser | — | `NOT_APPLICABLE` — no UI change |

Targeted runs between sub-phases; the full workspace set runs at the end of
6.1 (toolchain gate) and again at the end of 6.5.

## Manual checks

1. `pnpm --filter commerce-api dev`; `curl -i http://127.0.0.1:3001/health`;
   confirm status, body, and both id headers; stop.
2. `pnpm --filter commerce-api build && pnpm --filter commerce-api start`;
   repeat check 1 against the built output.
3. Start with `PORT=abc`; confirm non-zero exit, field named, value absent.
4. AC12's temporary-violation lint run.
5. `git diff --stat`; confirm only the files listed in `plan.md` changed.

## Not covered

- **How `apps/web` and `ai-service` experience these conventions** — neither
  calls commerce-api in this phase.
- **Any domain behaviour** — none exists.
- **Load, concurrency, or performance** — no meaningful workload.
- **Security testing beyond the listed ACs** (fuzzing, header smuggling,
  slow-body attacks) — out of scope for a local-only foundation; the
  specialised security review assesses the boundary by inspection.
- **Production runtime** — no deployment target exists; `production` config is
  a validated placeholder only.
