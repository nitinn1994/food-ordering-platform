# Requirements — Phase 18: Production, Security, Performance & Reliability Hardening

**Approval Status:** APPROVED (2026-09-27, OD1–OD15 as recommended)
**Approved by:** human reviewer, 2026-09-27 ("approved"; OD1–OD15 as recommended, including OD6 (a))
**Risk:** HIGH
**Path:** Full

## Risk justification

The highest dimension wins (`.claude/commands/forge.md`).

| Dimension | Level | Why |
| --- | --- | --- |
| Scope | **HIGH** | Cross-cutting: all three apps, contracts error codes, infrastructure, CI, docs |
| Security impact | **HIGH** | Security headers, proxy path confinement (Phase 15 S2), rate limiting, input-trust boundaries, secrets handling in CI and containers |
| Data impact | MEDIUM | No schema migration is proposed. Order-placement idempotency behaviour changes under concurrency; DB connection config (TLS) changes |
| API compatibility | MEDIUM | Additive only: new health/readiness routes, new error codes (`RATE_LIMITED`, `AGENT_BUSY`, `AGENT_TIMEOUT`), which `contractErrorSchema` already admits (code is a pattern, not an enum) |
| Infrastructure | **HIGH** | First Dockerfiles, a production Compose reference, a reverse-proxy config and the first CI workflow (`system-architecture.md` §7 classifies infrastructure work as HIGH) |
| User / business impact | **HIGH** | Availability; order placement correctness |
| Reversibility | MEDIUM | Code changes revert cleanly. Nothing is deployed by this phase |

Result: **HIGH → Full Path.** Specialised security, performance and data
reviews are required (see `plan.md`, "Specialised review needed?").

## Problem

Phases 0–16 built a working, well-bounded system for **local, loopback,
single-user** operation. There is no Phase 17: no commit, document or ADR
mentions one (verified by grep and `git log`). This plan treats Phases 0–16
as the baseline.

The inspection (`plan.md` §1–§24) found that the system cannot be operated
in production today:

- **Identity:** every caller shares one cart and one order space
  (`SingleUserCartOwnerResolver`, owner `"local-dev-owner"`). There is no
  authentication anywhere. This is a deliberate placeholder (ADR-0015/0016),
  not a bug, but it **blocks any multi-user deployment**.
- **Deployability:** there are no Dockerfiles, no CI, no production start
  configuration (web and commerce-api `start` bind `127.0.0.1`; ai-service
  defaults to `127.0.0.1`), no production migration runner (migrations need
  the `vite-node` devDependency), and no production menu-loading path.
- **Security gaps in what exists:** no security headers on web (no CSP, HSTS,
  frame-ancestors), none on the two APIs; an open MEDIUM proxy bypass
  (Phase 15 S2); a production web build silently falls back to
  `127.0.0.1` service URLs; a "development-only" panel ships to production;
  no rate limiting anywhere; `X-Powered-By: Next.js` exposed.
- **Reliability gaps:** no readiness probes; no per-turn deadline or
  concurrency cap in ai-service; an order-placement idempotency race returns
  409 instead of a replay when the web client's own retry overlaps the first
  attempt; unhandled `bootstrap()` rejection; no graceful-shutdown timeout in
  ai-service.
- **Operations:** no backups, restore, rollback policy, incident runbook or
  production configuration docs. No Python vulnerability scanning; one HIGH
  npm advisory (`postcss` via `next`).

## Goal

Every gap that can be closed **inside the current architecture and product
scope** is closed, verified and documented. Every gap that cannot is recorded
as an explicit, named **release blocker or dependency** with an owner-level
decision, so nobody can mistake "hardened" for "ready for public traffic".

## In scope

1. A written production-readiness assessment (the findings in `plan.md`) and
   a production-readiness checklist with READY / NEEDS WORK / BLOCKED status.
2. **commerce-api hardening:** security headers, readiness endpoint with a DB
   check, production config rules, DB TLS option, idempotency-race fix,
   bootstrap failure handling, configurable trust-proxy.
3. **ai-service hardening:** per-turn deadline, global concurrency cap,
   readiness endpoint, uvicorn production settings (graceful shutdown,
   server header, proxy headers off by default), security headers.
4. **web hardening:** security headers (CSP, HSTS in production,
   frame-ancestors, nosniff, Referrer-Policy), `poweredByHeader: false`,
   production build refuses missing service URLs, dev panel hidden in
   production, fix Phase 15 S2 (case-variant proxy bypass) with a live
   probe, `not-found` / `global-error` pages, a liveness route, TTS watchdog.
5. **Deployment and CI artifacts** (subject to OD6/OD7): one Dockerfile per
   app (non-root, pinned base), a production Compose reference with a
   reverse proxy that terminates TLS and applies per-client rate limits, a
   production migration entry point that needs no devDependencies, and a
   GitHub Actions CI workflow that runs the repository's existing checks
   plus dependency audits. **No deployment is performed.**
6. Dependency remediation limited to the one HIGH advisory (OD8) and adding
   Python vulnerability scanning (OD9).
7. Production documentation: environment variables, deployment, health
   checks, migrations, rollback, backup/restore expectations, incident
   response, troubleshooting. ADR-0024 recording the decisions.
8. Performance **baseline measurement** (bundle sizes, API latency, agent
   turn latency) recorded in the docs; optimisation only where the baseline
   justifies it (OD5).
9. The outstanding Phase 16 specialised security/privacy review, folded into
   this phase's security review (OD15).

## Out of scope

- **Authentication, user accounts, per-user carts or sessions** (OD1). This is
  new product capability and a trust-boundary design of its own. It is
  recorded as release blocker B1.
- Real AI model/provider integration, real voice provider, real payments
  (`CLAUDE.md` deferred list). Controls are built so they apply when these
  arrive; their provider-specific limits (token budgets, model timeouts) are
  recorded as dependencies.
- Cart-add idempotency key (OD12, recorded blocker for the real-model phase).
- Kubernetes, service mesh, Kafka, RabbitMQ, Redis, Elasticsearch, event
  sourcing, CQRS, distributed transactions, multi-region, autoscaling,
  distributed tracing infrastructure, new agents, RAG, new product features.
- Metrics backends (Prometheus/OTel) and external error trackers (OD10/OD11).
- Actual hosting provisioning, DNS, certificates, secret-store setup, backup
  jobs: documented as operator requirements, not implemented.
- Mass dependency upgrades; the dev-only `vitest` advisory (needs a major
  upgrade to 4.x).
- Least-privilege DB role creation (documented, performed by the operator).
- Pre-existing LOW follow-ups from Phases 15/16 not listed above.

## Acceptance criteria

### Assessment and documentation
- [ ] AC1: `plan.md` contains all 30 required assessment sections; each
  finding is labelled verified fact / observed implementation / missing
  capability / recommendation / assumption.
- [ ] AC2: `docs/operations/production-readiness-checklist.md` exists and
  gives every checklist item (Security, Reliability, Performance,
  Observability, Operations) a status of READY, NEEDS WORK or BLOCKED with
  evidence. B1 (identity) is listed as BLOCKED.
- [ ] AC3: `docs/operations/production-runbook.md` documents env vars per
  app, deployment, health/readiness, migrations, rollback, backup/restore
  requirements, incident response and troubleshooting, and describes no
  capability that does not exist.
- [ ] AC4: ADR-0024 is added to `architecture-decisions.md`; the
  `system-architecture.md` §7/§8 and the health-service comment that says
  "no database" are corrected.

### commerce-api
- [ ] AC5: Every response carries `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src
  'none'; frame-ancestors 'none'` and `Cache-Control: no-store` on
  `/v1/cart*` and `/v1/orders*`. Verified by e2e tests.
- [ ] AC6: `GET /health/ready` returns 200 `{status:"ready"}` when a
  `select 1` succeeds within 1 s and 503 `{status:"not_ready"}` otherwise;
  `GET /health` stays dependency-free. Verified by a unit test and a DB test.
- [ ] AC7: With `NODE_ENV=production`, startup fails (exit 1, variable named,
  value not printed) when `DATABASE_URL` points at a loopback host unless
  `ALLOW_LOOPBACK_DATABASE=true`, or when `DATABASE_SSL` is unset. A new
  `DATABASE_SSL` (`disable|require|verify-full`) is applied to the pool.
- [ ] AC8: Two concurrent `POST /v1/orders` with the same key and details
  both return 201 with the same order id and exactly one order row exists.
  A unique-constraint hit on `(owner_id, idempotency_key)` never produces a
  500. Verified by a DB test.
- [ ] AC9: A rejected `bootstrap()` logs one structured line and exits 1.
- [ ] AC10: `TRUST_PROXY` (default off) controls Express `trust proxy`.

### ai-service
- [ ] AC11: A turn exceeding `AGENT_TURN_TIMEOUT_SECONDS` (default 20, below
  the web client's 30 s) returns 504 `AGENT_TIMEOUT` with a static message;
  no further tool calls start after the deadline. Verified by a test with a
  slow scripted model.
- [ ] AC12: With `AGENT_MAX_CONCURRENT_TURNS` (default 16) turns in flight,
  the next turn gets 503 `AGENT_BUSY` immediately, without running the graph.
- [ ] AC13: `GET /health/ready` exists and does not call commerce-api or any
  model provider (OD2 recommendation); `GET /health` unchanged.
- [ ] AC14: uvicorn runs with `server_header=False`,
  `timeout_graceful_shutdown` set, and `proxy_headers` off unless
  `FORWARDED_ALLOW_IPS` is configured.
- [ ] AC15: Responses carry `nosniff`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store` and `frame-ancestors 'none'`.

### web
- [ ] AC16: Production responses carry the CSP from `plan.md` §4, HSTS
  (production only), `X-Content-Type-Options`, `Referrer-Policy`, and the
  existing `Permissions-Policy`; `X-Powered-By` is absent. Verified by a
  unit test of the headers function and a live probe of `next start`.
- [ ] AC17 (amended 2026-09-27, human decision "Opt-in flag"): `next build`
  with `WEB_REQUIRE_SERVICE_URLS=true` fails with a clear error when
  `COMMERCE_API_URL` or `AI_SERVICE_URL` is unset. The production image build
  sets the flag; an ordinary `pnpm build` still falls back to the dev URLs.
  *Why amended:* `next build` always runs with `NODE_ENV=production`
  (`next/dist/bin/next`), so the original wording would have failed every
  developer and CI build without the URLs, contradicting AC29.
- [ ] AC18: `CommandLogPanel` does not render when `NODE_ENV=production`.
- [ ] AC19: `/API/COMMERCE/v1/../health` and the other case/encoding variants
  in `test-plan.md` forward nothing outside `/v1`, **verified by a live
  probe against `next start`**, not only unit tests. Phase 15 S2 is closed.
- [ ] AC20: `not-found.tsx` and `global-error.tsx` exist; `error.tsx` copy
  is route-neutral.
- [ ] AC21: `GET /api/health` returns 200 without calling any upstream.
- [ ] AC22: If speech synthesis never settles within a bounded watchdog, the
  voice state returns to `idle` (or `error`) instead of staying `speaking`.

### Deployment and CI (subject to OD6/OD7)
- [ ] AC23: Each app has a Dockerfile that builds, runs as a non-root user,
  uses a version-pinned base image, contains no `.env` file and exposes one
  port; `docker build` succeeds for all three.
- [ ] AC24: A production migration entry point runs from the built
  commerce-api artifact without devDependencies.
- [ ] AC25: `.github/workflows/ci.yml` runs on pull requests: install with
  frozen lockfiles, lint, typecheck, test, build, `test:db` against a
  Postgres service, ai-service ruff/format/mypy/pytest, `pnpm audit
  --audit-level=high`, Python vulnerability audit, and Docker image builds
  without push. It contains no deploy step and no secrets.
- [ ] AC26: The reverse-proxy config terminates TLS, redirects HTTP→HTTPS,
  routes only to web, and applies per-client rate limits with the values in
  `plan.md` §10; the APIs are not published on host ports.

### Dependencies
- [ ] AC27: `pnpm audit --audit-level=high` reports 0 high/critical, or the
  accepted risk is documented per OD8.
- [ ] AC28: A Python vulnerability audit command is declared and its result
  recorded.

### Regression
- [ ] AC29: All existing checks pass: root `lint`, `typecheck`, `test`,
  `build`; `commerce-api test:db`; ai-service `pytest`, `ruff check`,
  `ruff format --check`, `mypy`.

## Open questions

See `plan.md` §30 (OD1–OD15). OD1 (identity), OD6 (deployment target) and
OD7 (CI) change the scope materially and need an answer before
implementation.
