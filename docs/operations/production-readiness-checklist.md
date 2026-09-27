# Production Readiness Checklist

State after Phase 18 (2026-09-27; ADR-0024; evidence in
`docs/features/phase-18-production-hardening/plan.md`, "As built", and
`security-review.md`).

**Statuses**

- **READY:** implemented and verified in Phase 18 or earlier.
- **NEEDS WORK:** partly in place; the gap is named.
- **BLOCKED:** cannot be closed without new product capability or an outside
  party. The owner is named.

**Verdict: not ready for public multi-user traffic.** B1 (identity) blocks
it. B4 (backups) and the operator items in "Operations" must be done by
whoever hosts it.

## Release blockers and dependencies

| # | Item | Status | Owner / next step |
| --- | --- | --- | --- |
| B1 | Identity: every caller shares one cart and order space, and an order's customer details can be read by anyone who knows its id | **BLOCKED** | A dedicated identity phase replaces `CartOwnerResolver`'s binding (ADR-0015, ADR-0024 rule 1) |
| B2 | Deployment artifacts: images, reverse proxy, TLS | READY (artifacts) | Operator provisions a host, DNS and certificates (runbook §4) |
| B3 | CI gate | NEEDS WORK | `.github/workflows/ci.yml` exists but has never run on GitHub. Push and confirm green, then make it a required check. |
| B4 | Backups and restore | **BLOCKED** | Operator: managed PostgreSQL with PITR plus a restore drill (runbook §7). Nothing here takes backups. |
| D2 | Real model: timeout, token budget, prompt-injection tests, egress path | BLOCKED (dependency) | Real-model phase. The model is simulated today. |
| D3 | Idempotency key on `POST /v1/cart/items` | BLOCKED (dependency) | Real-model phase (OD12). Nothing retries it today. |
| D4 | Production menu loading | READY (interim) | `dist/seed.js --allow-production` loads the in-code menu. A real menu-management path is product work. |
| D5 | Customer PII retention and erasure policy | BLOCKED | Business / legal |
| D6 | RPO / RTO targets | BLOCKED | Business. Placeholders ≤ 5 min / ≤ 1 h. |
| — | Payments | NOT APPLICABLE | Not in the roadmap. Orders are `placed` only. |

## Security

| Item | Status | Evidence |
| --- | --- | --- |
| Secrets protected | READY | No real `.env` ever committed (`git log --diff-filter=A`). No `NEXT_PUBLIC_` variables. Config errors never print values. `.dockerignore` excludes `.env*`, and images were checked to contain none. `DATABASE_URL` is required from the environment at runtime. |
| Production secret mechanism | NEEDS WORK | Documented (runbook §3: host secret store or a 0600 env file). The operator must choose and provision one. |
| Authentication / authorization verified | **BLOCKED** | B1. There is none. |
| API validation | READY | Strict zod and pydantic schemas, unknown keys rejected, 16 KB JSON bodies (both APIs), 32 KB cap at the proxy |
| CORS | READY | None needed: the browser only talks to web's origin. Cross-site JSON is refused: no CORS headers, JSON-only bodies. |
| Security headers | READY | web: CSP (OD3), X-Frame-Options, nosniff, Referrer-Policy, HSTS (production), microphone Permissions-Policy. APIs: CSP `default-src 'none'`, nosniff, no-referrer, no-store. No `X-Powered-By` or `server` banner. Verified live through the proxy. |
| Proxy path confinement | READY | Phase 15 S2 closed: the case-insensitive matcher was verified live on `next start`, the standalone server and nginx |
| AI tool allowlist | READY (simulated model) | 5 commerce and 5 presentation tools in literal registries. Strict arguments. No ids or URLs under model control. Loop caps. |
| UI command allowlist | READY | 5 commands, strict schemas, explicit handlers, no eval or navigation. Hostile payloads are tested in contracts and web. |
| Rate limiting | READY (behind nginx) | nginx per-client limits (agent 10/min, orders 5/min, writes 60/min, reads 300/min), case-insensitive, verified live. Backstop: ai-service concurrency cap and deadline. Assumes nginx is the edge (runbook §1). |
| Sensitive logging review | READY | No bodies, headers, query strings, messages, replies, tool arguments, audio or transcripts in any log (tests in both APIs). The proxy logs client address and path. |
| Voice privacy | READY (with disclosure) | Browser speech only. No audio reaches any server. The microphone is requested only on press, re-verified in a clean browser context (Phase 16 NOTE 7 not reproduced). The disclosure is shown. |
| Dependency vulnerabilities | READY | `pnpm audit --audit-level=high`: 0 high or critical. `pip-audit`: none. 2 moderate (vitest, dev-only) are a follow-up. |
| Container hardening | READY | Non-root app images pinned by digest, read-only root filesystems, `cap_drop: ALL`, `no-new-privileges`, no published app ports. ai-service has no route to the database. |

## Reliability

| Item | Status | Evidence |
| --- | --- | --- |
| Timeouts | READY | DB connect 5 s and statement 10 s (configurable). ai→commerce 3 s. Turn deadline 20 s (504). web client 8, 15 and 30 s. Proxy 35 s. |
| Retries | READY | Selective. web retries only GETs and the idempotent order POST, on network, timeout or 503. Cart writes and agent turns are never retried. ai-service never retries. |
| Idempotency | NEEDS WORK | Orders are idempotent, including an overlapping same-key retry (race fixed, DB-tested). The cart add is not (D3). |
| Graceful failure | READY | DB down gives 503 plus readiness `not_ready`, with automatic recovery. Busy gives 503 `AGENT_BUSY`, timeout gives 504 `AGENT_TIMEOUT`. Fixed user copy. Cart re-read after every turn. TTS watchdog. |
| Health checks | READY | Liveness without dependencies in all apps. commerce-api readiness checks the DB within 1 s. Container `HEALTHCHECK`s. |
| Graceful shutdown | READY (idle) | All services exit 0 on SIGTERM in under 1 s (verified). uvicorn has a 25 s drain and compose a 30 s grace period. In-flight draining was not exercised. |
| Startup failure | READY | Invalid configuration, database down or port in use each give one structured line and exit 1. `migrate` failure stops the rollout. |

## Performance

| Item | Status | Evidence |
| --- | --- | --- |
| Database indexes | READY | PK and UNIQUE indexes cover every current query. No order listing exists to need more. |
| Query performance | READY (at current scale) | Menu p50 2.3 ms. A 5-line cart is about 0.5 ms more than 1 line (N+1 bounded by menu size). Batching was deferred by measurement (OD5). |
| Frontend performance | READY | 103–145 kB first-load JS. `/` p50 7.8 ms server-side. No images. |
| AI latency | NOT MEASURED (dependency) | Graph overhead 4–14 ms p50 on the simulated model. Real model latency is D2. |
| Voice latency | NOT MEASURED | Browser engines; no voices on the test machine |
| Load / throughput | NOT MEASURED | No load-test tool is declared. Sequential baseline only. |

## Observability

| Item | Status | Evidence |
| --- | --- | --- |
| Structured logs | READY | JSON lines in both APIs and the proxy |
| Request / correlation ids | READY | `X-Request-Id` (server-generated) and `X-Correlation-Id` (propagated ai→commerce) on every line and response |
| Metrics | NEEDS WORK | Log-derived only (OD10). There is no metrics endpoint. The operator's log system must build the dashboards (runbook §8). |
| Error tracking | NEEDS WORK | Structured error logs only (OD11). Alerts must come from the log system. |
| AI / tool metrics | READY (as log fields) | Per-turn outcome (ok, failed, timeout, busy), duration, tool calls and rounds. Per-tool outcome, error code and duration. |
| DB metrics | NEEDS WORK | Pool loss warnings and readiness only. No pool utilisation figures. |

## Operations

| Item | Status | Evidence |
| --- | --- | --- |
| Deployment | READY (artifacts) / operator | `compose.prod.yaml`, smoke-tested end to end, including an off-network database. Host provisioning is operator work. |
| Migrations | READY | `dist/migrate.js` one-shot before the API, Kysely lock, forward-only in production |
| Backups | **BLOCKED** | B4 |
| Restore | **BLOCKED** | B4: procedure documented, never drilled |
| Rollback | READY (procedure) | Redeploy the previous `RELEASE_TAG` against an expand/contract schema (runbook §6). Not exercised. |
| Environment configuration | READY | Every variable documented (runbook §2). Production fails closed: DB TLS mode required, loopback DB refused (including canonicalised spellings), web image build requires service URLs. |
| Incident response | READY (runbook) | Runbook §9 |
