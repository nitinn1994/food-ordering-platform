# Test Plan — Phase 18: Production, Security, Performance & Reliability Hardening

## What will be tested

| Acceptance criterion | How it is verified | Type |
| --- | --- | --- |
| AC1 | Section and label check of `plan.md` | manual |
| AC2 | Checklist exists; every item has a status and evidence; B1 BLOCKED | manual |
| AC3 | Runbook reviewed against the code: every described command/route exists | manual |
| AC4 | ADR-0024 present; stale comment and §7/§8 corrected | manual |
| AC5 | e2e: headers on menu, cart, order, health, 404; `no-store` on cart/order | automated |
| AC6 | unit: ready / DB error / slow DB (fake ping) → 200/503/503 within 1 s; DB test: ready against real Postgres | automated |
| AC7 | env-schema tests: production + loopback → error; + override → ok; production without `DATABASE_SSL` → error; dev defaults unchanged; value never in message | automated |
| AC8 | DB test: `Promise.all` of two identical `POST /v1/orders` → both 201, same id, one row; forced unique violation → replay, not 500 | automated |
| AC9 | unit: bootstrap rejection → one log line, `process.exit(1)` | automated |
| AC10 | unit: `TRUST_PROXY` on/off reflected in Express setting | automated |
| AC11 | pytest: scripted slow model / slow tool → 504 `AGENT_TIMEOUT`; tool-call counter shows no call after deadline | automated |
| AC12 | pytest: hold N turns on an event, N+1th → 503 `AGENT_BUSY`, graph not invoked | automated |
| AC13 | pytest: `/health/ready` 200 with commerce client unreachable (no outbound call) | automated |
| AC14 | pytest: uvicorn.run kwargs captured (monkeypatch) | automated |
| AC15 | pytest: headers on `/health`, `/v1/agent/turns`, 404, 400 | automated |
| AC16 | vitest: header builder output (prod vs dev); **live** `curl -I` against `next start` | automated + manual |
| AC17 | vitest: extracted URL guard throws in production when unset; manual `NODE_ENV=production next build` without URLs fails | automated + manual |
| AC18 | vitest: page renders without `CommandLogPanel` when `NODE_ENV=production` | automated |
| AC19 | vitest cases **and live probe matrix** (below) against `next start` with a recording stand-in on :3001 | automated + manual |
| AC20 | vitest: `not-found`, `global-error` render; `error` copy neutral | automated |
| AC21 | vitest: route handler returns 200 and makes no fetch | automated |
| AC22 | vitest (fake timers + fake TTS that never settles) → state leaves `speaking` | automated |
| AC23 | `docker build` ×3; `docker run --rm <img> id -u` ≠ 0; `docker run --rm <img> ls -a` shows no `.env` | manual |
| AC24 | run built migrate entry against the test DB from a prod-only install | manual |
| AC25 | Workflow reviewed; `actionlint` is NOT_CONFIGURED, so syntax is reviewed by hand; no deploy step, no secrets | manual |
| AC26 | `docker compose -f infrastructure/docker/compose.prod.yaml config`; nginx `-t` in container; `curl` over self-signed TLS: HTTP→HTTPS redirect, 429 after burst on agent turn | manual |
| AC27 | `pnpm audit --audit-level=high` | automated |
| AC28 | `cd apps/ai-service && uv run pip-audit` (once added) | automated |
| AC29 | Full validation command set below | automated |

## New or changed tests

| Test | Covers | File |
| --- | --- | --- |
| security headers e2e | AC5 | `apps/commerce-api/test/security-headers.e2e.test.ts` (new) |
| security headers unit | AC5 | `apps/commerce-api/src/common/http/security-headers.middleware.test.ts` (new) |
| env production rules | AC7, AC10 | `apps/commerce-api/src/config/env.schema.test.ts` |
| readiness | AC6 | `apps/commerce-api/src/health/health.controller.test.ts`, `health.service.test.ts` (new), `*.db.test.ts` |
| order race | AC8 | `apps/commerce-api/src/modules/order/order.service.test.ts`, `order-placement.db.test.ts` (existing DB suite file or new) |
| bootstrap failure | AC9 | `apps/commerce-api/src/main.test.ts` (new) |
| turn deadline / concurrency | AC11, AC12 | `apps/ai-service/tests/test_agent_service.py`, `test_agent_api.py` |
| readiness | AC13 | `apps/ai-service/tests/test_health.py` |
| uvicorn settings | AC14 | `apps/ai-service/tests/test_main.py` |
| security headers | AC15 | `apps/ai-service/tests/test_security_headers.py` (new) |
| config vars | AC11–14 | `apps/ai-service/tests/test_config.py` |
| header builder, URL guard | AC16, AC17 | `apps/web/src/lib/security/headers.test.ts` (new) |
| proxy case/encoding variants | AC19 | `apps/web/src/lib/api/proxyPath.test.ts`, `src/middleware.test.ts` |
| panel gating | AC18 | `apps/web/src/app/page.test.tsx` (existing route test or new) |
| error pages, health route | AC20, AC21 | `apps/web/src/app/not-found.test.tsx`, `global-error.test.tsx`, `error.test.tsx`, `api/health/route.test.ts` |
| TTS watchdog | AC22 | `apps/web/src/lib/voice/browserTextToSpeech.test.ts`, `useVoiceSession.test.tsx` |
| malicious commands (extra keys, `__proto__`) | §4 | `apps/web/src/lib/commands/dispatch.test.ts` |
| 429 / 504 copy | §8 | `apps/web/src/lib/api/userMessages.test.ts` |

## Validation commands

Only commands this project declares (`package.json`, `apps/ai-service/README.md`,
`docs/development/getting-started.md`).

| Check | Command | Expected |
| --- | --- | --- |
| lint (TS) | `pnpm lint` | PASS |
| types (TS) | `pnpm typecheck` | PASS |
| test (TS) | `pnpm test` | PASS |
| build (TS) | `pnpm build` | PASS |
| test (DB) | `pnpm --filter commerce-api db:up && pnpm --filter commerce-api test:db` | PASS |
| lint (Py) | `cd apps/ai-service && uv run ruff check .` | PASS |
| format (Py) | `cd apps/ai-service && uv run ruff format --check .` | PASS |
| types (Py) | `cd apps/ai-service && uv run mypy` | PASS |
| test (Py) | `cd apps/ai-service && uv run pytest` | PASS |
| format (TS) | — | NOT_CONFIGURED (no prettier/format script) |
| npm audit | `pnpm audit --audit-level=high` | PASS (after OD8) — currently FAIL: 2 high (postcss), run during planning |
| Py audit | `cd apps/ai-service && uv run pip-audit` | NOT_CONFIGURED until OD9 lands |
| containers | `docker build -f apps/<app>/Dockerfile .` | NOT_CONFIGURED until Phase 4 lands |
| CI | `.github/workflows/ci.yml` | NOT_CONFIGURED; will not be executed remotely in this phase (no push) |

## Manual checks

1. **Proxy traversal live probe (AC19).** `pnpm --filter web build && next start`
   with a recording stand-in on :3001/:3002. Probe at minimum:
   `/api/commerce/v1/../health`, `/API/COMMERCE/v1/../health`,
   `/Api/Commerce/v1/..%2fhealth`, `/api/commerce/v1/%2e%2e/health`,
   `/api/commerce/v1/x/../../../ai/v1/agent/turns`, `/api/commerce/v1/..\\health`,
   `/API/AI/v1/agent/turns` (must still reach only `/v1/agent/turns`),
   `/api/commerce/v1/cart` (must still work). Record what the stand-in received.
2. **Headers (AC16, AC5, AC15).** `curl -sI` each service root and a 404; confirm
   CSP/HSTS (prod only)/nosniff/Referrer-Policy; no `X-Powered-By`, no `server:
   uvicorn`. Load `/`, `/cart`, `/checkout` in a browser: no CSP violations in
   console; voice button still works.
3. **Order race (AC8, live).** Against a running commerce-api with a non-empty
   cart: two parallel `curl` `POST /v1/orders` with the same key → identical bodies.
4. **Containers (AC23, AC26).** Build, non-root, no `.env`, compose config valid,
   nginx config test, TLS redirect, 429 after burst.
5. **Performance baseline (§12).** `curl -w '%{time_total}'` loops (100 requests)
   for menu, cart (1 and 10 lines), agent turn; `next build` route table. Record
   p50/p95 and the machine in `docs/operations/performance-baseline.md`.
6. **Voice (V-8, AC22).** Clean browser profile: microphone not active before a
   press (Phase 16 NOTE 7); TTS watchdog behaviour if reproducible.

## Not covered

- **Real multi-user isolation** — impossible until B1; the checklist marks it BLOCKED.
- **Real model latency, token usage, prompt injection** — dependency D2.
- **Voice latency** on real hardware/voices if unavailable on the test machine —
  reported NOT MEASURED rather than estimated.
- **CI execution on GitHub** — the workflow is written, not pushed (no push without
  explicit request).
- **Load testing** — no load-test tool is declared; the baseline is sequential
  latency only. A load test is a follow-up if OD5 needs it.
- **Actual backups/restore** — operator dependency (B4); cannot be verified here.
- **Firefox/Safari/mobile voice** — as in Phase 16.
