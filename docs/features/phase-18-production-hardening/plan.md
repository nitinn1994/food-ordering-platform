# Plan — Phase 18: Production, Security, Performance & Reliability Hardening

**Approval Status:** APPROVED (2026-09-27, OD1–OD15 as recommended)

## Approach

Harden what exists; do not redesign it. The four boundaries in
`system-architecture.md` §4 hold, and every change here follows existing
patterns. Examples: zod env schema and `AllExceptionsFilter` in commerce-api,
pydantic `Settings` and `request_limits` middleware in ai-service,
`next.config.ts` headers and `src/lib/api/` in web. No new service, broker,
cache or datastore is added. Gaps that need new product capability
(identity), a real provider (model, voice, payments) or operator action
(hosting, backups, secrets store) are recorded as blockers or dependencies.
They are not faked.

Sources: four read-only audits of every app plus direct verification of the
highest-ranked claims (commit `90b9dac`, 2026-09-27). **No check was
executed during planning, and no performance was measured** (§12).

### Finding labels

| Label | Meaning |
| --- | --- |
| **[F]** | Verified fact: the code or file was read, or a command was run, in this planning session |
| **[O]** | Observed implementation: behaviour derived from reading the code, not exercised |
| **[M]** | Missing capability |
| **[R]** | Recommendation |
| **[A]** | Assumption: not verified |

Severity: **CRITICAL** (blocks production) · **HIGH** · **MEDIUM** · **LOW**.

---

## 1. Current production architecture

As built. It matches the expected architecture except where noted.

```text
Browser ──HTTPS?──> apps/web (Next.js 15.5.25, next start -H 127.0.0.1)
  │  Web Speech API STT/TTS in-browser (no audio reaches any server)
  │
  ├─ /api/commerce/v1/*  ──rewrite──> commerce-api :3001 (NestJS 12, 127.0.0.1)
  │                                      └─ PostgreSQL 18 (Kysely, pg pool)
  └─ /api/ai/v1/agent/turns ──rewrite──> ai-service :3002 (FastAPI, uvicorn, 1 proc)
                                           └─ LangGraph (SimulatedChatModel)
                                                └─ 5 commerce tools ──HTTP──> commerce-api
```

- [F] There is no "Voice Layer" service. Voice is a browser adapter over the
  text turn (ADR-0023). The expected diagram's separate voice box does not
  exist, and none is needed.
- [F] Deployment infrastructure does not exist: no Dockerfile, no CI, no
  reverse proxy, no TLS. The only container is local-dev Postgres
  (`infrastructure/docker/compose.yaml`, bound to 127.0.0.1).
- [F] There is no Phase 17. No commit, doc or ADR mentions it.
- [F] The browser only talks to web's origin. commerce-api and ai-service are
  never called cross-origin (ADR-0018/0022).

## 2. Production readiness scorecard

| Area | Status | Why (details in the numbered section) |
| --- | --- | --- |
| Identity / authN / authZ | **BLOCKED** | One shared cart and order space for all callers (§6). Needs its own phase (OD1) |
| Real AI provider controls | **BLOCKED** (dependency) | Simulated model: no model timeout or token budget can be set or tested (§4) |
| Real voice provider | NOT APPLICABLE | Browser speech only, by design (ADR-0023) |
| Payments | BLOCKED (dependency) | Not implemented (`CLAUDE.md`) |
| App security headers / CSP | NEEDS WORK | Only `Permissions-Policy` on web; none on the APIs (§3) |
| Proxy confinement | NEEDS WORK | Phase 15 S2 case-variant bypass open (§3) |
| Input validation | READY | Strict zod/pydantic everywhere, 16 KB body limits on both APIs (§3, §8) |
| UI command safety | READY | Allowlist, strict schemas, explicit handlers, no eval (§4) |
| AI tool constraints | READY (for simulated model) | Allowlist, strict args, no URL/ID control, loop caps (§4) |
| AI cost / abuse controls | NEEDS WORK | No deadline, concurrency cap or rate limit (§9) |
| Rate limiting | NEEDS WORK | None anywhere (§8) |
| Secrets | READY (for current state) | No secrets exist; none committed; no `NEXT_PUBLIC_` vars (§7) |
| Secrets management (prod) | NEEDS WORK | No mechanism defined (§7) |
| Timeouts / retries | NEEDS WORK | Mostly sound; no per-turn deadline; idempotency race (§9) |
| Health / readiness | NEEDS WORK | Liveness only on both APIs; none on web (§18) |
| Graceful shutdown | NEEDS WORK | commerce-api OK; ai-service has no drain timeout (§9) |
| Database schema / constraints | READY | Named PK, UNIQUE, CHECK and FK constraints; snapshots (§11) |
| Database ops (TLS, roles, backups) | NEEDS WORK / BLOCKED | No TLS option; one role; no backups (§11, §19) |
| Performance | NOT MEASURED | No baseline exists (§12) |
| Caching | READY (conservative) | No caching of mutable state; menu uncached (§13) |
| Observability | NEEDS WORK | Good structured logs and correlation IDs; no metrics or error tracking (§14) |
| Deployment | BLOCKED | No artifacts; loopback-bound start scripts (§15) |
| CI/CD | BLOCKED | None (§16) |
| Dependency security | NEEDS WORK | 2 HIGH (postcss via next); Python unscanned (§17) |
| Containers | BLOCKED | No app containers (§18) |
| Backup / recovery | BLOCKED | None implemented; operator dependency (§19) |
| Production configuration | NEEDS WORK | Localhost fallbacks in the web build; no prod rules in commerce-api (§20) |
| Documentation | NEEDS WORK | No production docs (§21) |

## 3. Security findings (application)

| # | Sev | Finding | Label | Evidence |
| --- | --- | --- | --- | --- |
| S-1 | HIGH | web sends no CSP, HSTS, `frame-ancestors`/X-Frame-Options, nosniff or Referrer-Policy. Checkout can be framed (clickjacking) | [F] | `apps/web/next.config.ts:35-42` (only `Permissions-Policy`) |
| S-2 | MEDIUM | commerce-api and ai-service send no security headers. They are JSON-only and internal, so impact is low; defence in depth | [F] | `apps/commerce-api/src/configure-app.ts:36-83`; ai-service `main.py` |
| S-3 | MEDIUM | **Phase 15 S2 is still open.** The case-variant `/API/COMMERCE/v1/../health` skips the case-sensitive middleware matcher, and the case-insensitive rewrite forwards the traversal. Today it reaches only public `/health` | [F] matcher unchanged since Phase 11; [O] bypass, from the Phase 15 live probe | `apps/web/src/middleware.ts:19-21`; `docs/features/phase-15-ai-ui-commands/security-review.md` S2 |
| S-4 | MEDIUM | `CommandLogPanel` ("Development-only") renders in production and reveals command types and rejection reasons | [F] | `apps/web/src/app/page.tsx:43`; `components/dev/CommandLogPanel.tsx:5-7` |
| S-5 | LOW | `X-Powered-By: Next.js` is sent (`poweredByHeader` not disabled). commerce-api disables its own | [O] | `next.config.ts`; `configure-app.ts:41` |
| S-6 | LOW | uvicorn sends a `server: uvicorn` header by default. Carried from Phase 12 security review | [O] | `apps/ai-service/ai_service/__main__.py:32-42` |
| S-7 | READY | Validation: strict zod (`z.strictObject`) and pydantic `extra="forbid"`; bounded ids, quantities and strings; error messages never echo input | [F] | `packages/contracts/*/src`; `common/validation/validation.ts:24-45` |
| S-8 | READY | Error leakage: 5xx bodies are generic; stacks are logged server-side only; DB errors are reduced to SQLSTATE | [F] | `all-exceptions.filter.ts:50-60`; `persistence.errors.ts`; ai-service `request_context.py:99-114` |
| S-9 | READY | XSS: no `dangerouslySetInnerHTML`, `innerHTML` or `eval`; replies render as text nodes. Live-probed in Phase 15 (S8) | [F] grep | `apps/web/src` |
| S-10 | READY | CSRF: no cookies exist. Both APIs require `application/json` (415 otherwise), which forces a preflight, and no CORS headers are sent. Probed in Phase 15 (S6) | [F] | `json-body.middleware.ts:40-44`; `request_limits.py` |
| S-11 | READY | Injection: SQL only through Kysely with parameters; path params are re-validated before URL building in ai-service | [O] | `clients/commerce/client.py:50-52,154-159` |
| S-12 | LOW | `correlationIdSchema` in commerce-api accepts control characters (Phase 12 F1, unverified) | [A] | Phase 12 security review |
| S-13 | NOTE | All client headers, including `Cookie`, are forwarded by the proxy to ai-service. Harmless without auth; must be an allowlist once auth exists (Phase 15 S5) | [O] | `next.config.ts` rewrites |

- [R] S-1: static headers in `next.config.ts` (OD3). S-2: a tiny
  headers middleware in each API, with no new dependency. S-3: make the
  matcher case-insensitive and lowercase-check the path, then verify it with
  a live probe against `next start` (memory note: unit tests missed a
  traversal regression here before). S-4: render only when
  `process.env.NODE_ENV !== "production"` (OD4). S-5/S-6: disable both.

## 4. AI security findings

| # | Sev | Finding | Label | Evidence |
| --- | --- | --- | --- | --- |
| AI-1 | READY | Tool allowlist: 5 commerce and 5 presentation tools, as literal `MappingProxyType` registries. A duplicate name refuses the build; an unknown name gets `UNKNOWN_TOOL` and is logged as `<unregistered>` | [F] | `tools/registry.py:88-147`; `ui_commands/registry.py:87-121`; `agents/graph.py:61-63` |
| AI-2 | READY | Arguments: strict frozen pydantic; slug ids `^[a-z0-9]+(-[a-z0-9]+)*$` ≤64 chars; qty 1–99; write calls re-validated as intents | [F] | `tools/schemas.py:33-34`; `tools/intents.py:52-58` |
| AI-3 | READY | Model-generated identifiers: no tool can name a cart, owner, session or URL. The cart is resolved server-side | [F] | `tools/schemas.py:9-10` |
| AI-4 | READY | Arbitrary URLs: routes are constants, `follow_redirects=False`, `trust_env=False`, base URL comes only from config | [F] | `clients/commerce/client.py:39-42,79-89` |
| AI-5 | READY | LLM ↛ DB: no DB driver dependency or DB-URL setting, enforced by `tests/test_boundaries.py`. It is **not** enforced by network or credentials (arch gap #2) | [F] test / [M] network | `system-architecture.md` §8.2 |
| AI-6 | READY | Loops: `MAX_TOOL_ROUNDS=4`, 8 calls/turn, 16/message, `recursion_limit=12` on every invoke | [F] | `agents/nodes.py:37-46`; `service.py:71-73` |
| AI-7 | HIGH | **No per-turn deadline.** The worst case is bounded only indirectly (8 × 3 s commerce timeout ≈ 24 s plus model time), which races web's 30 s client timeout and Next's 30 s proxy default | [F] | `agents/service.py:71` |
| AI-8 | HIGH | **No concurrency cap or rate limit** on turns. This becomes a cost-abuse path once a real model exists | [F] | ai-service has no semaphore or limiter |
| AI-9 | READY | No order-placement tool; order creation is unreachable by the agent | [F] | `tools/registry.py:10-12` |
| AI-10 | MEDIUM | Prompt injection (direct, or indirect via menu text): only prompt guidance ("tool results are data"). Adversarial tests would be meaningless on a regex model. Blast radius is limited to the allowlist (cart add/set/remove on the shared cart; UI moves) | [F] / [A] real-model behaviour | `agents/prompts.py:20`; Phase 14 S2 |
| AI-11 | READY | Leakage: messages, replies and tool args are never logged; tool errors use this layer's text, never commerce-api's | [F] | `agents/service.py:85-111`; `tools/results.py:9-12` |
| AI-12 | LOW | The last-resort handler logs a full traceback, which could carry content if a future exception message includes user data | [O] | `core/request_context.py:104` |
| AI-13 | NOTE | Tracing to LangSmith is refused at startup (fail-closed) | [F] | `config.py:98-108,151-169` |
| AI-14 | BLOCKED (dep) | Model timeout, token limits and cost budget cannot exist without a provider. `build_chat_model()` takes no settings | [F] | `llm/__init__.py:18-19` |

**UI command security (Phase 15 re-verification):** [F]
- Explicit allowlist: `UI_COMMAND_TYPES`, a strict discriminated union of 5
  commands.
- Batch cap of 10; `SearchMenu.query` ≤200 characters.
- Handlers are an explicit `switch` into `uiStore` only.
- `dispatch.ts` is barred by ESLint from importing cart state.
- No `eval`, `new Function`, `window.open`, `location.*` or
  `router.push/replace` anywhere in `apps/web/src`.
- No navigation or network command exists.
- Malicious payloads are tested in `dispatch.test.ts:57-85`: unknown type,
  smuggled `AddToCart`, non-objects, missing fields. Phase 15 S9 live-probed
  `__proto__`, `javascript:` ids and an 11-command batch.
- [M] There is no web-side test for extra keys or prototype pollution inside
  a command. The contracts package covers it.
- [R] Add those tests (§27).

- [R] AI-7: `asyncio.timeout(AGENT_TURN_TIMEOUT_SECONDS)` around
  `graph.ainvoke`, default 20 s, returning 504 `AGENT_TIMEOUT`. AI-8: a
  process-wide `asyncio.Semaphore` with non-blocking acquire, default 16,
  returning 503 `AGENT_BUSY`. Per-client rate limiting belongs at the edge
  (OD2). AI-10: the prompt-injection threat model and tests become an entry
  criterion of the real-model phase (dependency D2).

## 5. Voice security findings

| # | Sev | Finding | Label | Evidence |
| --- | --- | --- | --- | --- |
| V-1 | READY | No audio reaches any server of ours. There is no `getUserMedia`/MediaRecorder; Web Speech API only | [F] | `lib/voice/browserSpeechToText.ts:3-8,95-96` |
| V-2 | NOTE | Chromium's `SpeechRecognition` may send audio to the browser vendor's cloud service. This is a third-party flow outside our control, accepted in Phase 16 OD2 with a disclosure | [F] | ADR-0023 |
| V-3 | READY | Microphone limited to our origin (`Permissions-Policy: microphone=(self)`). The permission prompt appears only on a user press | [F] | `next.config.ts:35-42` |
| V-4 | NEEDS WORK | Secure transport: speech APIs need a secure context. Production must serve HTTPS, which does not exist yet (§15) | [O] | — |
| V-5 | READY | Transcripts go through the same length-checked `submit` as text and are never logged; no provider credentials exist | [F] | `useVoiceSession.ts:371,380` |
| V-6 | READY | Session isolation and replay: there is no voice session server-side, so nothing can be replayed or hijacked beyond the (shared) text turn. Isolation depends on B1 | [F] | ADR-0023 |
| V-7 | MEDIUM | No TTS watchdog: a browser that never fires `end`/`error` leaves the state at `speaking` | [O] | `lib/voice/browserTextToSpeech.ts:226-266` |
| V-8 | MEDIUM | **The Phase 16 required security and privacy review was never performed** (no `security-review.md`). Phase 16 NOTE 7 (the microphone seen listening before a press) is unresolved | [F] | `docs/features/phase-16-voice-interaction/` |

- [R] V-7: a watchdog of about 60 s, or reply-length-based, that cancels
  and returns to `idle`. V-8: perform it inside this phase's security
  review (OD15), including a clean-profile re-check of NOTE 7.

## 6. Authentication / authorization findings

- [F] **No authentication exists** in any app: no session, cookie, token or
  API key.
- [F] The cart owner is a constant `"local-dev-owner"`
  (`apps/commerce-api/src/modules/cart/infrastructure/single-user-cart-owner.resolver.ts:7,18-20`).
  Orders reuse it (`order/infrastructure/cart-owner.adapter.ts:17-19`).
- [O] **Every visitor shares one cart. Anyone who knows an order UUID can
  read that order's customer name, phone and email.** The owner-scoped queries
  are structure, not access control, with one owner (ADR-0016).
- [F] There is no service-to-service authentication: anything that can reach
  :3001 or :3002 can call them. Loopback binding is the only protection.
- [F] The web sends only `{message}` to ai-service. ADR-0021 records the rule
  for later: forward the end user's credential, never a service credential.
- [M] Identity, sessions, expiry and identity propagation to ai-service and
  commerce-api.
- **Release blocker B1.** The `CartOwnerResolver` port is the single binding
  to replace (ADR-0015). [R] A dedicated phase designs it (OD1). This phase
  does not invent it.
- [R] Until B1 is closed, the service-to-service risk is contained by network
  topology: only web is published, and the APIs sit on a private network
  (§15). This does not substitute for identity.

## 7. Secrets findings

- [F] No real `.env` has ever been committed (`git log --diff-filter=A`). Only
  the three `.env.example` files are tracked.
- [F] Local `apps/commerce-api/.env` is untracked and identical to
  `.env.example`, which holds dev placeholder credentials. Values were not
  printed.
- [F] No private keys or `sk-` tokens are in tracked files. The pattern hits
  are the dev-only compose password and example URLs, labelled as such.
- [F] No `NEXT_PUBLIC_*` variables exist. Service URLs are server-only.
- [F] ai-service config errors name the variable, never the value, and
  future secrets must be `SecretStr` (`config.py:8-11,141-145`). commerce-api
  does the same (`env.schema.ts`, `main.ts:28-33`).
- [F] The only secret the system will have today is `DATABASE_URL`.
- [M] A production secret mechanism.
- [R] Inject secrets as runtime environment variables from the host's secret
  store: the platform secret manager, or Docker Compose `secrets:`/env-file
  with 0600 permissions on the host. Never bake them into images or the
  build.
- [R] Enforce this with `.dockerignore` excluding `.env*`.
- [R] Split `DATABASE_URL` into app and migrator roles (§11).
- [A] The operator has a secret store; which one depends on OD6.

## 8. API security findings

| Topic | commerce-api | ai-service | web proxy |
| --- | --- | --- | --- |
| Body size | [F] 16 KB, JSON-only (`json-body.middleware.ts:11`) | [F] 16 KB, buffered (`request_limits.py:39`) | [F] none (relies on upstream) |
| Validation | [F] strict zod | [F] strict pydantic | n/a |
| Rate limiting | [M] none | [M] none | [M] none |
| Timeouts | [F] `statement_timeout` 10 s, pool connect 5 s; [M] no HTTP request timeout | [F] commerce client 3 s; [M] no turn deadline | [F] client 8/15/30 s |
| Pagination | [F] not needed: the only list is the full menu (small, seeded); no order listing exists | n/a | n/a |
| CORS | [F] none, correct: same-origin via proxy | [F] none, correct | n/a |
| Error envelope | [F] `{code,message,field?}` | [F] same | [F] backend message dropped |

- [R] Rate-limit values (per client IP, enforced at the reverse proxy per OD2):
  - `POST /api/ai/v1/agent/turns`: 10 requests/min, burst 5.
  - `POST /api/commerce/v1/orders`: 5/min, burst 2.
  - Other `POST|PATCH|DELETE /api/commerce/v1/*`: 60/min, burst 20.
  - `GET /api/commerce/v1/*`: 300/min, burst 50.
  - Rejections return 429 with `Retry-After`.
- [R] In-process backstops: the ai-service concurrency cap and deadline (AI-7/8).
- [R] Keep web's proxy body-size reliance on upstream limits, but add
  `client_max_body_size 32k` at the reverse proxy.
- [A] One instance per service, so no distributed limiter is needed.

## 9. Reliability findings

| # | Sev | Finding | Label | Evidence |
| --- | --- | --- | --- | --- |
| R-1 | HIGH | **Order idempotency race.** The idempotency lookup runs before the transaction. The web client retries `POST /v1/orders` on a timeout or 503 (`orderService.ts:62`). A retry that overlaps a still-running first attempt gets 409 `CART_CONFLICT` instead of a replay. A unique-constraint hit throws `OrderAlreadyExistsError` (a plain `Error`) and becomes a 500 | [F] | `order.service.ts:68-99`; `order.errors.ts:82`; `postgres-order.repository.ts:97` |
| R-2 | READY | Selective retries: web retries only GETs plus the idempotent order POST, on network, timeout or 503, 2 attempts at 250/750 ms. Cart mutations and agent turns are never retried. ai-service never retries | [F] | `lib/api/client.ts:22`; `errors.ts:57-63` |
| R-3 | HIGH | Cart add is non-idempotent (a delta). Safe today only because nothing retries it. A real model may repeat it. Arch gap #3 | [F] | ADR-0015/0021 |
| R-4 | READY | Failure propagation: a lost write response becomes `COMMERCE_OUTCOME_UNKNOWN`; web re-reads the cart after every turn, success or failure | [F] | `client.py:146-150`; `useAgentTurn.ts:269` |
| R-5 | MEDIUM | `void bootstrap()` has no catch, so startup failure is an unhandled rejection | [F] | `apps/commerce-api/src/main.ts:62` |
| R-6 | READY | commerce-api fails fast on a DB `select 1` at boot. `enableShutdownHooks` destroys the pool on shutdown | [F] | `database-client.ts:137-148`; `configure-app.ts:82` |
| R-7 | MEDIUM | ai-service: single uvicorn process with no `timeout_graceful_shutdown`. The lifespan closes the httpx client | [F] | `__main__.py:32-42`; `main.py:65-71` |
| R-8 | LOW | Next `start` handles SIGTERM | [A] (verify during Phase 4) | — |
| R-9 | NOTE | Voice connections: none server-side, so there is nothing to drain | [F] | ADR-0023 |

- [R] R-1: in `placeOrder`, on `CartConflictError` or `OrderAlreadyExistsError`
  re-run `findByIdempotencyKey`. If an order with the same details exists,
  replay it; if details differ, return `IDEMPOTENCY_KEY_REUSED`; otherwise
  rethrow. Map any remaining `OrderAlreadyExistsError` to 409. There is no
  schema change.
- [R] R-3: deferred to the real-model phase as blocker D3 (OD12).
- [R] Service start order: DB → commerce-api (ready when its DB check passes)
  → ai-service → web. Compose uses `depends_on: condition: service_healthy`.

## 10. Resilience findings (behaviour matrix)

| Failure | Timeout | Retry | Fallback / user-facing | Recovery | Status |
| --- | --- | --- | --- | --- | --- |
| DB unavailable | pool connect 5 s, statement 10 s [F] | none server-side | 503 `SERVICE_UNAVAILABLE` [F] (`persistence.errors.ts:70-153`); web shows fixed server-error copy | pool reconnects on the next request [O]; readiness goes 503 (new) | NEEDS WORK (readiness) |
| commerce-api unavailable | web 8 s / 15 s; ai client 3 s [F] | web GET + order POST ×2 on 503/network [F] | web error copy; agent tool error mapped to fixed text [F] | automatic on the next request | READY |
| AI provider unavailable | n/a (simulated) | — | `AGENT_FAILED` static message [F] | — | BLOCKED (dep D2): provider timeout and error mapping arrive with the provider |
| STT unavailable | 15 s listen cap [F] | none | closed error-code set; typing still works [F] | user retries | READY |
| TTS unavailable | [M] no watchdog | none | reply is still shown as text [F] | stuck at `speaking` possible (V-7) | NEEDS WORK |
| web's upstream API unavailable | as above | as above | route-level `error.tsx` (menu-specific copy [F]); no `global-error` | reload | NEEDS WORK |
| agent turn slow | [M] none (after fix: 20 s → 504) | never retried [F] | fixed "assistant unavailable" copy | — | NEEDS WORK |

- [R] No circuit breakers. With one instance per service and short timeouts,
  a breaker adds state without benefit [A].

## 11. Database findings

- [F] Schema (`migrations/0001_initial_schema.ts:29-182`): `menu_categories`,
  `menu_items` (FK RESTRICT), `carts` (PK owner_id), `cart_lines` (FK
  CASCADE), `orders` (UNIQUE `(owner_id, idempotency_key)`), `order_lines` (FK
  RESTRICT). CHECKs cover qty 1–99, `line_subtotal = unit × qty`,
  `total = subtotal` and `status IN ('placed')`.
- [F] Price consistency: order lines snapshot the name and unit price
  (`order.create.ts:64-65`). The cart is consumed at the priced version in one
  transaction with the order insert (`order.service.ts:96-99`), and cart
  writes use optimistic versioning (`postgres-cart.repository.ts:88-113`).
- [O] Pricing reads happen before the transaction. A menu price change
  between load and commit is accepted at the priced value, which is the
  snapshot semantics ADR-0016 intends. This is not a defect.
- [F] Indexes: only those behind PKs and UNIQUEs. There is no order listing,
  so no `created_at` index is needed today.
- [R] Add none until a query needs one.
- [F] Migrations: Kysely Migrator with a lock table. They never run at boot.
  `db:migrate:down` drops everything and is dev-only.
- [M] A production migration runner: `db:migrate` needs `vite-node`, a
  devDependency.
- [M] A production rollback policy.
- [R] Build a `dist/migrate.js` entry with the existing vite build and run it
  as a one-shot container before the app starts. Adopt a forward-only policy
  with expand/contract migrations, where rollback means deploying the
  previous app version against a backward-compatible schema. Record this in
  ADR-0024.
- [F] Pool: `max` from `DATABASE_POOL_MAX` (1–50, default 10), connection
  timeout 5 s, hard-coded `statement_timeout` 10 s.
- [M] `idleTimeoutMillis` is unset, and there are **no TLS options**.
- [R] Add `DATABASE_SSL` (`disable|require|verify-full`) and pass it to `pg`.
  Production requires it to be set explicitly (OD14).
- [M] One DB role.
- [R] Document separate roles: `commerce_migrator` owns the DDL, and
  `commerce_app` gets DML only on the six tables. The operator creates them;
  the app consumes `DATABASE_URL` only.
- [F] Seeding: `db:seed` refuses to run in production (`cli/seed.ts:23-26`).
- [M] A production menu-loading path.
- [R] Dependency D4. For go-live, the operator runs the seed through a
  documented one-shot using the built artifact with an explicit override
  flag, or loads the menu with SQL. OD14 decides which.
- [F] PII: orders hold the customer's full name, phone and email.
- [M] There is no retention or erasure policy (ADR-0017). This is a legal
  and business dependency (D5).

## 12. Performance findings

**Nothing has been measured.** Every item below is an observation from the
code, not a measurement. Per the request, no optimisation is proposed
without a baseline.

- Frontend: [F] runtime dependencies are only next, react, react-dom and
  zod; there are no images. [F] 27 client components; the whole menu tree is
  client-side. [F] `/` is `force-dynamic` with `no-store`, so every page
  view makes two commerce-api menu queries.
- commerce-api: [F] **N+1 in cart pricing.** Each read or write does one
  `menu_items` query per cart line (`cart.service.ts:161-167` →
  `menu-catalog.adapter.ts:18-19`). [O] It is bounded by the number of
  distinct menu items, which is small.
- AI: [F] the simulated model costs near nothing. The worst-case tool fan-out
  is 8 sequential commerce calls. The system prompt is a constant.
- Voice: [M] STT, TTS and end-to-end latency cannot be measured here. Phase
  16 recorded that the machine has no voices. This is a manual measurement.
- [R] Phase 1 records a baseline in `docs/operations/performance-baseline.md`:
  - web: the `next build` route size table
  - `curl -w` timings over 100 sequential requests for `GET /v1/menu` and
    `GET /v1/cart` with 1 and 10 lines, and for `POST /v1/agent/turns`, with
    p50/p95 reported
  - voice: a manual browser measurement if hardware allows, otherwise
    NOT MEASURED
  - Batched menu lookup (ADR-0017's recorded follow-up) and menu caching are
    done only if the baseline shows they matter (OD5).

## 13. Caching findings

- [F] No cache exists anywhere: no `Cache-Control`, no in-memory cache, and
  web fetches with `no-store`.
- [R] Keep cart, orders, prices and availability uncached. Add explicit
  `Cache-Control: no-store` on the cart and order routes (AC5) so no
  intermediary caches them.
- [R] The menu is the only candidate for short caching: a `Cache-Control:
  public, max-age=60` on `GET /v1/menu`, or Next `revalidate: 60` on `/`.
  This is safe for authority because cart pricing always re-reads live menu
  prices server-side (ADR-0015). Adopt it only if the baseline justifies it
  (OD5).
- [R] No Redis.

## 14. Observability findings

- [F] Structured JSON logs in both APIs, with a server-generated
  `X-Request-Id` and a propagated `X-Correlation-Id`. ai-service forwards the
  correlation id to commerce-api (ADR-0021).
- [F] One request line per request (method, path, status, duration) in both.
- [F] ai-service logs one line per turn (outcome, duration, tool
  calls/rounds, UI command count) and one per tool call (tool, outcome,
  error code, commerce status, duration). These are log-derived AI metrics.
- [F] No bodies, headers, messages or tool args are logged.
- [F] In commerce-api pretty mode, request and correlation ids are missing
  (`logger.ts:58-60`). Dev only.
- [M] No metrics endpoint, no error tracking, and no DB pool metrics.
- [M] web has no server-side logging and no client error reporting.
- [R] Log-derived metrics (OD10): add pool stats to the readiness log line,
  and an `event` field to turn and tool log lines so a log backend can count
  them. Document queries for the metrics listed in the request.
- [R] Token usage: dependency D2.
- [R] Voice metrics: client-side only, with no transport to a server today.
  NOT IMPLEMENTED, recorded.
- [R] External error tracker: no (OD11).

## 15. Deployment findings

- [F] There is no deployment artifact of any kind. `start` scripts bind to
  127.0.0.1 (web `next start -H 127.0.0.1`; commerce-api `HOST` default;
  ai-service `HOST` default). HOST is configurable in the two APIs, but web's
  bind address is hard-coded in the script.
- [F] Web rewrites are baked in at build time. The upstream URLs must be
  known at image build, which makes a web image environment-specific [O].
- [R] The simplest production architecture (OD6):

```text
Internet ─443─> reverse proxy (nginx: TLS, HSTS, rate limits, body cap)
                   │ (only published service)
                   ▼
                 web :3000 ──private network──> commerce-api :3001 ──> managed PostgreSQL (TLS, PITR)
                   └──────────────────────────> ai-service  :3002 ──> commerce-api
          one-shot: commerce-api migrate (before app start)
```

- [R] One container per app on one host, orchestrated by Docker Compose.
  Postgres is managed, which is where backups and PITR come from; a
  self-hosted Postgres would need a backup job.
- [R] Scaling: vertical first. Every app is stateless apart from the DB, so
  running multiple replicas later requires only moving the edge rate limits
  to a shared LB [A].
- [R] No Kubernetes, mesh or brokers.
- [R] Web needs `HOSTNAME`/`-H` configurable: use `output: "standalone"` and
  run `node server.js`, which honours `HOSTNAME` and `PORT`.

## 16. CI/CD findings

- [F] There is no CI of any kind (`.github/` is absent; nothing else exists).
  `getting-started.md` calls this "ADR-0002's residual risk, now real".
- [F] The remote is GitHub (`origin git@github-nitin:nitinn1994/...`).
- [F] ai-service is outside turbo, and its checks are separate `uv run`
  commands.
- [R] `.github/workflows/ci.yml` on `pull_request` and `push` to main:
  1. **ts job:** `pnpm install --frozen-lockfile`, then `pnpm lint`,
     `pnpm typecheck`, `pnpm test`, `pnpm build`.
  2. **db job:** a Postgres 18 service, `pnpm --filter commerce-api db:migrate`
     and `test:db`.
  3. **py job:** `uv sync --locked`, `ruff check`, `ruff format --check`,
     `mypy`, `pytest`.
  4. **security job:** `pnpm audit --audit-level=high` and the Python audit
     (OD9).
  5. **images job:** `docker build` ×3, no push.

  Deployment stays manual and out of CI in this phase (OD7). Actions are
  pinned by commit SHA, with `permissions: contents: read`.

## 17. Dependency security findings

- [F] `pnpm audit` (run in planning): 0 critical, **2 high**, 4 moderate.
  - HIGH: `postcss` via `apps/web > next > postcss`, two advisories:
    arbitrary file read via `sourceMappingURL` (≤8.5.11), and path traversal
    in source-map loading (≤8.5.17).
  - Moderate: `postcss` ×2; `vitest`/`@vitest/mocker` path traversal
    (`>=2.1.0 <4.1.11`, dev only). The installed vitest is 3.x.
- [O] The postcss advisories concern build-time processing of attacker-
  controlled CSS or source maps. This repository compiles only its own CSS,
  so real exposure is low.
- [R] OD8: add a `pnpm.overrides` entry pinning postcss to a patched version
  and verify with `next build`, else document the accepted risk. Fixing
  vitest needs a major upgrade: FOLLOW-UP, out of scope.
- [F] Python: `uv.lock` has 73 packages. **No vulnerability scanner is
  configured.** `langsmith`, `requests` and `websockets` are transitive and
  forbidden as imports (Phase 13/14).
- [F] `next: ^15.0.0` is a loose range (15.5.25 installed; the lockfile
  governs).
- [F] Node `.nvmrc` 24 vs `engines >=20.9.0`; Python pinned to 3.12.
- [F] `@contracts/agent-intents` is a devDependency of commerce-api but
  imported at runtime (`request-context.middleware.ts`) [O].
- [R] Verify the vite build bundles it, else move it to `dependencies`.
- [F] Unused dependencies: none identified. A full unused-dependency sweep
  was not run.

## 18. Container findings

- [F] No application containers exist.
- [F] The dev Postgres image is `postgres:18-alpine`, pinned by tag, not
  digest. It has a healthcheck and is bound to 127.0.0.1.
- [R] Three multi-stage Dockerfiles:
  - `node:24-bookworm-slim` for web and commerce-api, and
    `python:3.12-slim-bookworm` with uv for ai-service. Each is pinned to a
    minor tag plus digest.
  - Non-root `USER`, read-only root filesystem where possible (Next needs a
    writable `.next/cache`, which gets a tmpfs), a single `EXPOSE` and a
    `HEALTHCHECK` against the liveness route.
  - A `.dockerignore` excluding `.env*`, `node_modules`, `.git` and
    `docs/features`.
  - Build web with `output: "standalone"`; use `pnpm deploy --prod` for
    commerce-api.
- [R] The production compose publishes only the reverse proxy's 80 and 443.

## 19. Backup / recovery findings

- [F] **No backups, no restore procedure and no DR plan exist.** The dev
  Compose volume is the only storage.
- [M] Backup strategy, restore drill, RPO and RTO.
- [R] Use managed PostgreSQL with automated daily snapshots and PITR, with
  7-day retention as a starting point. Document a restore drill (restore to
  a new instance, point `DATABASE_URL` at it, verify readiness).
- [R] Migration rollback: forward-only (§11).
- [A] Data-loss tolerance: **RPO ≤ 5 min and RTO ≤ 1 h are placeholders**;
  the business must set them (dependency D6).
- The checklist marks backups and restore BLOCKED until an operator verifies
  a real backup and a restore drill. This repository cannot verify it.

## 20. Configuration findings

| # | Sev | Finding | Label | Evidence |
| --- | --- | --- | --- | --- |
| C-1 | HIGH | A web production build silently falls back to `http://127.0.0.1:3001` and `:3002` for rewrites. Runtime env cannot fix it | [F] | `apps/web/next.config.ts:13-27` |
| C-2 | READY | web Server Components throw in production if `COMMERCE_API_URL` is unset | [F] | `lib/api/config.ts:24-35` |
| C-3 | HIGH | commerce-api has no production rules. `NODE_ENV` is unused except by the seed; a localhost `DATABASE_URL` and no TLS are both accepted | [F] | `config/env.schema.ts:10-28` |
| C-4 | READY | ai-service requires `COMMERCE_API_URL` in production and serves docs only in development | [F] | `config.py:72-73`; `main.py:50,76-78` |
| C-5 | MEDIUM | `statement_timeout` is hard-coded at 10 s; the pool has no idle timeout | [F] | `database-client.ts:17-18` |
| C-6 | NOTE | Logging: `LOG_LEVEL`/`LOG_FORMAT` exist in both APIs with JSON defaults, which is correct for production | [F] | `.env.example` files |
| C-7 | NOTE | Model configuration: none exists (dependency D2) | [F] | — |

- [R] C-1: throw when `NODE_ENV=production` and a URL is unset.
- [R] C-3: production refuses a loopback DB host unless it is explicitly
  allowed, and requires `DATABASE_SSL`.
- [R] Rate limits live in the reverse-proxy config. Timeouts and concurrency
  are env-configurable with safe defaults.

## 21. Documentation gaps

- [M] No production configuration reference, deployment guide, health-check
  reference, migration or rollback procedure, backup/restore document,
  incident response or troubleshooting guide. `README.md` is empty (0 bytes).
- [F] Stale: the `health.service.ts:7-10` comment ("no database"), and
  `system-architecture.md` §7, which will change with this phase.
- [R] New: `docs/operations/production-runbook.md`,
  `docs/operations/production-readiness-checklist.md` and
  `docs/operations/performance-baseline.md`.
- [R] Update: `getting-started.md` (new env vars, Docker, CI),
  `commerce-api.md` / `ai-service.md` (health, headers, new error codes),
  `system-architecture.md` §2/§7/§8, and ADR-0024.
- [R] `README.md` stays out of scope unless you want it (FOLLOW-UP).

## 22. Critical blockers

These block public production. This phase **records** B1 and the
dependencies; it resolves only what is marked "this phase".

| # | Blocker | Owner / resolution |
| --- | --- | --- |
| B1 | No identity: shared cart; orders readable by UUID, exposing PII | Separate phase (OD1) |
| B2 | No deployment artifacts, TLS or reverse proxy | This phase, Phase 4 (OD6) |
| B3 | No CI gate | This phase, Phase 4 (OD7) |
| B4 | No backups or restore | Operator (managed DB); documented here |
| D2 | Real model: timeout, token budget, prompt-injection tests | Real-model phase |
| D3 | Cart-add idempotency key before any retrying or real-model caller | Real-model phase (OD12) |
| D4 | Production menu-loading path | OD14, then the operator |
| D5 | PII retention and erasure policy | Business / legal |
| D6 | RPO/RTO targets | Business |
| — | Payments | Not implemented; out of roadmap scope |

## 23. High-priority fixes (this phase)

1. The R-1 order idempotency race.
2. Web security headers and CSP (S-1); `poweredByHeader: false` (S-5).
3. The Phase 15 S2 proxy bypass, with a live probe (S-3).
4. The web build failing on missing service URLs (C-1).
5. The ai-service per-turn deadline and concurrency cap (AI-7, AI-8).
6. commerce-api production config rules and `DATABASE_SSL` (C-3).
7. Readiness endpoints (§2, §10; AC6, AC13, AC21).
8. Dockerfiles, reverse proxy with rate limits and TLS, and CI (B2, B3).
9. The postcss HIGH advisory (§17).

## 24. Medium-priority improvements (this phase)

- API security headers (S-2).
- `CommandLogPanel` hidden in production (S-4).
- The unhandled `bootstrap` rejection (R-5).
- Graceful-shutdown and uvicorn settings (R-7, S-6).
- The TTS watchdog (V-7).
- `not-found` / `global-error` pages and neutral error copy.
- `TRUST_PROXY` config.
- Configurable statement timeout and pool idle timeout (C-5).
- Log-derived metric fields (§14).
- Python vulnerability audit (OD9).
- The Phase 16 security review (V-8).
- Performance baseline (§12).
- Production docs (§21).

## 25. Files to modify

### commerce-api (`apps/commerce-api/`)

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts` | modified | catch `bootstrap()` rejection (R-5) |
| `src/configure-app.ts` | modified | security-headers middleware, `trust proxy` (S-2, AC10) |
| `src/common/http/security-headers.middleware.ts` (+test) | new | headers and `no-store` on cart/order (AC5) |
| `src/config/env.schema.ts` (+test) | modified | `DATABASE_SSL`, `ALLOW_LOOPBACK_DATABASE`, `TRUST_PROXY`, `DATABASE_STATEMENT_TIMEOUT_MS`, production rules (AC7) |
| `src/database/database-client.ts` (+test) | modified | SSL options, configurable timeouts, `ping(timeoutMs)` for readiness |
| `src/health/health.controller.ts`, `health.service.ts` (+tests) | modified | `GET /health/ready`; fix the stale comment (AC6) |
| `src/modules/order/order.service.ts` (+test, +db test) | modified | idempotency race handling (AC8) |
| `src/modules/order/domain/order.errors.ts` | modified | map `OrderAlreadyExistsError` to a domain error, never a 500 |
| `src/database/cli/migrate.ts`, `vite.config.ts` | modified | production `dist/migrate.js` entry (AC24) |
| `package.json` | modified | `start:migrate` script; move `@contracts/agent-intents` if needed |
| `.env.example` | modified | new vars |
| `Dockerfile`, `.dockerignore` | new | AC23 |

### ai-service (`apps/ai-service/`)

| File | Change | Why |
| --- | --- | --- |
| `ai_service/config.py` (+test) | modified | `AGENT_TURN_TIMEOUT_SECONDS`, `AGENT_MAX_CONCURRENT_TURNS`, `FORWARDED_ALLOW_IPS`, `SHUTDOWN_TIMEOUT_SECONDS` |
| `ai_service/__main__.py` (+test) | modified | uvicorn `server_header=False`, graceful timeout, proxy headers (AC14) |
| `ai_service/agents/service.py`, `agents/errors.py` (+tests) | modified | deadline and concurrency gate (AC11, AC12) |
| `ai_service/api/agent.py` | modified | map `AGENT_TIMEOUT` → 504 and `AGENT_BUSY` → 503 |
| `ai_service/api/health.py` (+test) | modified | `/health/ready` (AC13) |
| `ai_service/core/security_headers.py` (+test), `main.py` | new / modified | AC15 |
| `pyproject.toml`, `uv.lock` | modified | `pip-audit` dev dependency (OD9) |
| `.env.example`, `README.md` | modified | new vars and commands |
| `Dockerfile`, `.dockerignore` | new | AC23 |

### web (`apps/web/`)

| File | Change | Why |
| --- | --- | --- |
| `next.config.ts` | modified | headers and CSP, `poweredByHeader: false`, `output: "standalone"`, production URL guard (AC16, AC17) |
| `src/lib/security/headers.ts` (+test) | new | testable header builder used by `next.config.ts` |
| `src/middleware.ts`, `src/lib/api/proxyPath.ts` (+tests) | modified | case-insensitive confinement (AC19) |
| `src/app/page.tsx` | modified | gate `CommandLogPanel` (AC18) |
| `src/app/not-found.tsx`, `src/app/global-error.tsx` (+tests) | new | AC20 |
| `src/app/error.tsx` (+test) | modified | route-neutral copy |
| `src/app/api/health/route.ts` (+test) | new | AC21 |
| `src/lib/voice/browserTextToSpeech.ts`, `useVoiceSession.ts` (+tests) | modified | TTS watchdog (AC22) |
| `src/lib/commands/dispatch.test.ts` | modified | extra-key and prototype-pollution cases |
| `src/lib/api/userMessages.ts` (+test) | modified | 429 and 504 copy |
| `package.json` | modified | `start` honours `HOSTNAME` (standalone) |
| `Dockerfile`, `.dockerignore` | new | AC23 |

### Root, infrastructure, docs

| File | Change | Why |
| --- | --- | --- |
| `package.json`, `pnpm-lock.yaml` | modified | `pnpm.overrides` postcss (OD8) |
| `.github/workflows/ci.yml` | new | AC25 |
| `infrastructure/docker/compose.prod.yaml` | new | production reference topology (AC26) |
| `infrastructure/docker/nginx/nginx.conf` | new | TLS, redirect, rate limits, body cap (AC26) |
| `docs/operations/production-runbook.md` | new | AC3 |
| `docs/operations/production-readiness-checklist.md` | new | AC2 |
| `docs/operations/performance-baseline.md` | new | §12 |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0024 |
| `docs/architecture/system-architecture.md` | modified | §2, §7, §8 |
| `docs/api/commerce-api.md`, `docs/api/ai-service.md`, `docs/development/getting-started.md` | modified | new routes, codes, env vars, commands |
| `docs/features/phase-18-production-hardening/security-review.md` | new | Full-path specialised review, including Phase 16's |

Not touched: `packages/contracts/*`. The new error codes fit the existing
`contractErrorSchema` pattern [F: `common/src/errors.ts`, code is a
pattern]. There is no DB migration.

## 26. Infrastructure changes (justified)

| Change | Justification | Not doing instead |
| --- | --- | --- |
| Three Dockerfiles | There is no other way to produce a reproducible, non-root runtime artifact; B2 | Kubernetes manifests |
| `compose.prod.yaml` | The smallest orchestrator for 3 stateless services on one host | Swarm/K8s |
| nginx reverse proxy | TLS termination (required for speech APIs, HSTS), per-client rate limits with built-in `limit_req`, body cap, single public entry | API gateway, service mesh |
| GitHub Actions CI | The remote is GitHub; closes B3 | Deployment automation |
| Managed PostgreSQL (documented, not provisioned) | Backups and PITR without running a backup service | Self-hosted backup cron (documented alternative) |

No Redis, broker, tracing collector or metrics stack.

## 27. Tests to add

- **commerce-api:**
  - security headers e2e (all routes; `no-store` on cart/order)
  - env schema production rules (loopback refused, SSL required, override
    flag)
  - `/health/ready` unit tests (ok / DB fail / slow DB → 503 within 1 s)
  - **DB test: concurrent identical order POSTs → both 201, same id, one row**
  - DB test: unique violation → replay, not 500
  - bootstrap failure exit
- **ai-service:**
  - deadline exceeded → 504 with no further tool calls
  - concurrency cap → 503, with the graph not invoked
  - `/health/ready`
  - security headers
  - uvicorn kwargs (server header, graceful timeout, proxy headers)
  - config validation of the new vars
- **web:**
  - header builder (CSP directives, HSTS only in production)
  - production URL guard (unit-test the extracted function)
  - case-variant and encoded traversal cases in `proxyPath`/`middleware`
    tests
  - `CommandLogPanel` hidden in production
  - `not-found`, `global-error` and `api/health`
  - TTS watchdog
  - dispatch extra-key and `__proto__` cases
  - 429/504 user copy
- **Live probes (manual, recorded in the test plan):** proxy traversal matrix
  against `next start`; response headers via `curl -I`; the order race with
  parallel `curl`; container non-root (`docker run … id -u`).

## 28. Validation commands

Only commands declared in the repository (`package.json` scripts,
`apps/ai-service/README.md`, `getting-started.md`).

| Check | Command |
| --- | --- |
| TS lint | `pnpm lint` (turbo) |
| TS typecheck | `pnpm typecheck` |
| TS test | `pnpm test` |
| TS build | `pnpm build` |
| DB tests | `pnpm --filter commerce-api db:up` then `pnpm --filter commerce-api test:db` |
| Py lint | `cd apps/ai-service && uv run ruff check .` |
| Py format | `cd apps/ai-service && uv run ruff format --check .` |
| Py types | `cd apps/ai-service && uv run mypy` |
| Py test | `cd apps/ai-service && uv run pytest` |
| npm audit | `pnpm audit --audit-level=high` (the pnpm built-in, run in planning) |

Commands added by this phase and declared when they land: the Python audit
(`uv run pip-audit`, OD9), `docker build -f apps/<app>/Dockerfile .`, and
`pnpm --filter commerce-api start:migrate`. Until they are added, their status
is NOT_CONFIGURED.

## 29. Acceptance criteria

AC1–AC29 in `requirements.md`.

## 30. Open decisions (all need approval)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| OD1 | Identity (B1) | (a) record as release blocker; separate auth/session phase · (b) add an anonymous per-browser session cookie → owner id in this phase | **(a)**. (b) is a new trust-boundary design (cookie security, CSRF, session fixation, ai-service propagation) and deserves its own Full-path plan |
| OD2 | Rate limiting and readiness placement | (a) per-client limits at the reverse proxy; in-app backstops only (ai-service deadline and concurrency cap); ai-service readiness does not check commerce-api · (b) in-process per-IP limiters in each service (needs trusted `X-Forwarded-For` through Next) | **(a)**. Services see only web's IP; a proxy limit is simpler and correct for one host |
| OD3 | Web CSP | (a) static CSP with `script-src 'self' 'unsafe-inline'` (Next inline hydration), `'unsafe-eval'` only in dev · (b) nonce-based CSP via middleware on every route | **(a)**. XSS sinks are verified absent (S-9); (b) forces dynamic rendering and widens the middleware surface that already had a traversal bug |
| OD4 | `CommandLogPanel` in production | (a) hide when `NODE_ENV=production` · (b) keep | **(a)** |
| OD5 | Performance work | (a) measure first; implement batched menu lookup and/or 60 s menu caching only if the baseline shows p95 or load is material · (b) implement both now | **(a)** |
| OD6 | Deployment target | (a) provider-neutral images + `compose.prod.yaml` + nginx on one host, managed Postgres · (b) a PaaS per service (you name it) · (c) defer deployment artifacts to a Phase 18B | **(a)**, **your call**: the hosting choice is a business decision |
| OD7 | CI | (a) GitHub Actions as in §16, no deploy job · (b) defer | **(a)** |
| OD8 | postcss HIGH advisory | (a) `pnpm.overrides` to a patched postcss, verified by `next build` · (b) accept and document (build-time only, own CSS) | **(a)**, falling back to (b) if the build breaks |
| OD9 | Python vulnerability scanning | (a) add `pip-audit` as a dev dependency and a CI step · (b) leave NOT_CONFIGURED | **(a)** |
| OD10 | Metrics | (a) log-derived metrics only · (b) Prometheus `/metrics` endpoints | **(a)** for current scale |
| OD11 | Error tracking | (a) none this phase; structured error logs · (b) Sentry or similar | **(a)**. An external tracker is a new third-party data flow |
| OD12 | Cart-add idempotency key | (a) defer as D3, entry criterion for the real-model phase · (b) implement now (additive `Idempotency-Key` on `POST /v1/cart/items` + key store) | **(a)**. Nothing retries it today |
| OD13 | Turn limits | 20 s deadline → 504 `AGENT_TIMEOUT`; 16 concurrent → 503 `AGENT_BUSY` | **As stated**; tune with the real model |
| OD14 | DB production config and menu load | (a) require `DATABASE_SSL` in production, refuse a loopback DB unless `ALLOW_LOOPBACK_DATABASE=true`; menu loaded by an explicit one-shot seed with `--allow-production` · (b) TLS optional; menu by operator SQL | **(a)** |
| OD15 | Phase 16's missing security/privacy review | (a) fold into this phase's security review · (b) separate | **(a)** |

## 31. Implementation order (phases)

This is five phases, at the `/plan` limit. Phase 4 is separable: if you
choose OD6 (c), it becomes Phase 18B with its own approval.

### Phase 1 — Baseline and commerce-api hardening
- [ ] Record the performance baseline (§12) before any change.
- [ ] Security-headers middleware; `trust proxy` config; bootstrap catch.
- [ ] Env rules: `DATABASE_SSL`, loopback guard, timeouts; pool SSL.
- [ ] `/health/ready` with a DB ping; fix the stale comment.
- [ ] Order idempotency race fix, with a concurrent DB test.
- **Done when:** AC5–AC10 pass; `pnpm test`, `test:db`, `lint` and
  `typecheck` pass for commerce-api.

### Phase 2 — ai-service hardening
- [ ] Turn deadline and concurrency gate with error mapping.
- [ ] `/health/ready`; security headers; uvicorn settings; config vars.
- **Done when:** AC11–AC15 pass; `pytest`, `ruff`, `format --check` and
  `mypy` pass.

### Phase 3 — web hardening
- [ ] Header builder and CSP; `poweredByHeader`; production URL guard;
  standalone output.
- [ ] S2 fix plus a **live probe against `next start`**.
- [ ] Panel gating; `not-found`/`global-error`/neutral `error`;
  `/api/health`; TTS watchdog; dispatch tests; 429/504 copy.
- **Done when:** AC16–AC22 pass; root lint, typecheck, test and build pass.

### Phase 4 — Deployment artifacts, CI, dependencies (OD6/OD7/OD8/OD9)
- [ ] Dockerfiles and `.dockerignore` ×3; `dist/migrate.js`;
  `compose.prod.yaml`; nginx config.
- [ ] `.github/workflows/ci.yml` (not run remotely; no push).
- [ ] postcss override; `pip-audit`.
- **Done when:** AC23–AC28 pass locally (`docker build` ×3, non-root check,
  audits).

### Phase 5 — Docs, checklist, specialised reviews
- [ ] Runbook, checklist, baseline doc, ADR-0024, architecture and API docs.
- [ ] Security review (including Phase 16's), performance review and data
  review → `security-review.md`.
- [ ] Full validation run.
- **Done when:** AC1–AC4 and AC29 pass. Then `/final-review`.

## Risks

| Risk | Impact | How it is handled |
| --- | --- | --- |
| The CSP breaks hydration or dev tooling | Blank page | `'unsafe-eval'` in dev only; live check of `next start` in Phase 3 |
| The production env rules break an existing local flow | Dev friction | Rules apply only when `NODE_ENV=production`; tests cover dev defaults |
| The S2 fix is verified only by unit tests again | A false sense of safety | AC19 requires a live probe (memory note) |
| The postcss override breaks `next build` | Build fails | OD8 fallback (b) |
| The 20 s deadline cuts legitimate slow turns | User sees an error | Configurable; the simulated model is fast; retune with the real model |
| Rate limits live only in the nginx config | Bypassed if the APIs are exposed directly | The APIs are never published; the ai-service concurrency cap is a backstop |
| Scope size | Long review | Five phases, each independently reviewable; Phase 4 separable |
| Readers mistake "hardened" for "production-ready" | Premature launch | B1–B4 are BLOCKED in the checklist |

## Assumptions

- [A] One instance per service at launch; no distributed state is needed.
- [A] Hosting will provide managed PostgreSQL with PITR (OD6).
- [A] Next 15.5 `next start` and the standalone server handle SIGTERM
  gracefully. Verify in Phase 4.
- [A] The vite build bundles workspace contracts, so the devDependency
  placement of `@contracts/agent-intents` is harmless. Verify in Phase 1.
- [A] A patched postcss exists that is compatible with next 15.5. Verify in
  Phase 4.
- [A] RPO/RTO placeholders (≤5 min / ≤1 h) until the business sets them.

## Not doing

- Authentication, sessions or per-user carts (B1, OD1).
- A real model, voice provider or payments.
- Cart-add idempotency (OD12).
- Metrics backend, tracing or an external error tracker.
- Actual deployment, DNS, certificates or secret-store provisioning.
- vitest major upgrade; a mass dependency refresh.
- Batched menu lookup and menu caching, unless the baseline justifies them
  (OD5).
- `README.md` content.

## Follow-up (not done)

```text
FOLLOW-UP (not done): packages/contracts (vitest ^3) — moderate dev-only path-traversal advisory — upgrade to vitest >=4.1.11 in a dedicated change — LOW
FOLLOW-UP (not done): apps/commerce-api/src/database/migrations — destructive dev-only down migration — keep; forward-only policy documented — LOW
FOLLOW-UP (not done): README.md is empty — add a project overview — LOW
FOLLOW-UP (not done): Phase 15 LOW items (duplicate formatIssues, unknown categoryId empties menu) — as recorded there — LOW
FOLLOW-UP (not done): network/credential enforcement of "AI service ↛ DB" (arch gap #2) — separate DB network and roles in the deployment — MEDIUM (partly addressed by the private network in Phase 4)
```

## Specialised review needed?

- security: **yes.** Headers, CSP, proxy confinement, rate limits,
  container and CI supply chain, secrets handling, plus Phase 16's
  outstanding voice privacy review.
- performance: **yes.** Baseline, the effect of the deadline and concurrency
  cap, and the OD5 decision.
- data / migration: **yes.** Order idempotency race behaviour, DB TLS and
  role split, the migration runner, backup and rollback policy. There is no
  schema change.

## As built

### Phase 1 — Baseline and commerce-api hardening (2026-09-27)

- Baseline recorded before any code change:
  `docs/operations/performance-baseline.md`. **OD5 outcome: no batched menu
  lookup and no menu caching.** A 5-line cart (the maximum today) costs
  about 0.5 ms more than a 1-line cart at p50, and the menu is 2.3 ms at p50.
- Deviations from the plan text. Each is within the approved intent:
  - `TRUST_PROXY` is named `TRUST_PROXY_HOPS`, an integer from 0 to 5 hops
    (0 is off). A hop count cannot mean "trust everything" by accident. Note
    that nothing in commerce-api reads `req.ip` or `req.protocol` today, so
    the setting has no consumer yet.
  - `Cache-Control: no-store` is set on **every** commerce-api response, not
    only on cart and order routes. No path spelling can miss it, and the
    menu is uncached anyway (OD5). AC5 is a subset of this.
  - `OrderAlreadyExistsError` stays a plain `Error`. The race is handled by a
    second key lookup in `OrderService.placeOrder`, so a unique-key hit on
    `(owner_id, idempotency_key)` replays. Only an order-id collision (a bug)
    is still a 500.
  - `CartEmptyError` is also treated as a lost same-key race. This is the
    other interleaving: the retry's lookup misses, the first attempt
    completes, and the retry then loads an empty cart. The plan named only
    the 409 and 500 outcomes.
  - An extra env rule: when `DATABASE_SSL` is set, `DATABASE_URL` must not
    carry `sslmode`, because pg lets the URL's value silently override the
    `ssl` option.
  - The pool idle timeout is not configurable. pg-pool's default of 10 s is
    verified in `pg-pool/index.js:98-99` and documented in
    `database-client.ts`.
  - There is no separate security-headers unit test. The e2e test covers 9
    response kinds (2xx, 400, 404 ×2, 413, 415).
  - The production migration entry (`dist/migrate.js`) moved to Phase 4 with
    the Dockerfiles, following the phase order.
- Assumption verified: `@contracts/*` are bundled inline by the vite build
  (`vite.config.ts` `external()`), so `@contracts/agent-intents` as a
  devDependency is harmless. No change.

### Phase 2 — ai-service hardening (2026-09-27)

- New settings, with their defaults: `AGENT_TURN_TIMEOUT_SECONDS=20`,
  `AGENT_MAX_CONCURRENT_TURNS=16`, `FORWARDED_ALLOW_IPS=""` (trusts none) and
  `SHUTDOWN_TIMEOUT_SECONDS=25`.
- **Deadline.** The deadline is `asyncio.timeout` around `graph.ainvoke`.
  Only this turn's own deadline maps to 504 `AGENT_TIMEOUT`, checked with
  `expired()`; a `TimeoutError` raised inside the graph stays
  `AGENT_FAILED`. Cancelling the graph cancels an in-flight commerce request,
  so a write may or may not have landed. That is the same "outcome unknown"
  the client already handles, and apps/web re-reads the cart after every
  turn.
- **Capacity.** A turn over capacity is refused before the graph runs, with
  503 `AGENT_BUSY`. The counter is in-process; with a single event loop
  there is no race.
- **Readiness.** `/health/ready` is static and checks no dependency (OD2).
- **uvicorn settings.** `server_header=False`,
  `timeout_graceful_shutdown=SHUTDOWN_TIMEOUT_SECONDS`, and
  `proxy_headers=False` unless `FORWARDED_ALLOW_IPS` is set. Verified in
  `uvicorn.Config`: uvicorn 0.54's own default is `proxy_headers=True`,
  trusting 127.0.0.1.
- **Deviation.** Security headers are skipped on `/docs` and `/redoc`,
  which exist only in development and need scripts. There, only the CSP is
  omitted; the other headers still apply.
- **Not changed.** The request header-size limit stays at uvicorn's h11
  default. Verified: `uvicorn.Config(h11_max_incomplete_event_size=None)`
  falls back to h11's `DEFAULT_MAX_INCOMPLETE_EVENT_SIZE = 16 * 1024`, and
  httptools is not installed, so h11 is the parser in use. The Phase 12
  review note is met by that default. No new setting was added.

### Phase 3 — web hardening (2026-09-27)

- **Scope change, decided by the human: AC17 amended.** `next build` always
  runs with `NODE_ENV=production` (`next/dist/bin/next:48,68`), so the
  guard is opt-in instead. `WEB_REQUIRE_SERVICE_URLS=true` makes a missing
  `COMMERCE_API_URL` or `AI_SERVICE_URL` fail the build, and the Phase 4
  Dockerfile must set it. A production build made without the flag still
  falls back silently. That residual risk is recorded.
- **S2 closed, verified live.** Two changes:
  - The middleware matcher is now case-insensitive, using ASCII character
    classes because Next's matcher takes no flags.
  - `isForwardableProxyPath` compares its prefix case-insensitively.

  The same 17-path probe matrix ran against a recording stand-in, before and
  after the fix:
  - Before, on `next start` with the HEAD code: 5 variants escaped the
    middleware, and 4 of them reached commerce-api's `/health`.
  - After, on both `next start` and the standalone `server.js`: nothing
    outside `/v1` reached any upstream. `/api/commerce/v1/cart`,
    `/API/COMMERCE/V1/cart` (forwarded to `/v1/cart`) and the AI turn path
    still work.
- **Headers.** They are built in `src/lib/security/headers.ts`, which has
  no imports so Next's config loader can load it.
  - The CSP follows OD3. There is no `upgrade-insecure-requests`: it would
    upgrade same-origin assets on a plain-HTTP local `next start`, and HSTS
    at the proxy covers the production case.
  - `Referrer-Policy: strict-origin-when-cross-origin` is used, the web
    default, not the APIs' `no-referrer`.
  - `X-Frame-Options: DENY` is added alongside `frame-ancestors`.
- **Browser check** (Chrome, production build, real services):
  - `/` and `/checkout` render and hydrate with no CSP violation.
  - A chat turn changes the UI through the same-origin proxy.
  - Framing is refused by `frame-ancestors 'none'`.
  - The custom 404 is served.
  - Voice was **not** exercised: the microphone permission and speech
    engines were not driven.
- **Deviations.**
  - The `CommandLogPanel` gate is inside the component, not `page.tsx`. It
    is simpler to test and has the same effect.
  - `package.json` `start` is unchanged (`next start -H 127.0.0.1`). With
    `output: "standalone"`, `next start` still serves but logs a warning.
    The production image will run `node server.js` (Phase 4).
  - The TTS watchdog lives in the adapter (`browserTextToSpeech.ts`): after
    a budget of 10 s plus 100 ms a character, the utterance is cancelled and
    reported as `playback-failed`, and the existing reducer maps that to
    `error`. `useVoiceSession.ts` is unchanged.
- **Baseline correction.** The Phase 1 `web GET /` row had timed an error
  page, because `COMMERCE_API_URL` was unset under `next start`. It was
  re-measured, and the correction is noted in
  `docs/operations/performance-baseline.md`. The OD5 conclusion is
  unchanged.

### Phase 4 — Deployment artifacts, CI, dependencies (2026-09-27)

- **commerce-api one-shot commands (AC24).**
  - `vite.config.ts` builds `dist/migrate.js` and `dist/seed.js` next to
    `dist/main.js`, so no `vite-node` is needed at runtime. They run as
    `pnpm start:migrate` and `pnpm start:seed`.
  - `migrate.js down` refuses to run with `NODE_ENV=production`: the
    forward-only policy is enforced in code, not only documented.
  - `seed.js` runs in production only with `--allow-production` (OD14). It
    is the D4 menu-loading path.
- **Images (AC23).** There are three multi-stage Dockerfiles with the
  repository root as build context and one root `.dockerignore` excluding
  `.env*`, `node_modules`, build output, `.git`, `docs` and `.claude`. Base
  images are pinned by tag and digest: `node:24.19.0-bookworm-slim`,
  `python:3.12.14-slim-bookworm` and `ghcr.io/astral-sh/uv:0.12.19`.
  - Users: commerce-api and web run as `node` (uid 1000), ai-service as
    `app` (uid 10001).
  - Application code is owned by root, so it is read-only to the process.
  - A `HEALTHCHECK` in each image calls its liveness route.
  - The images contain no `.env` file. ai-service has no dev tools.
  - Web bakes in its service URLs as build args, with
    `WEB_REQUIRE_SERVICE_URLS=true`. A build without them fails, as
    verified.
- **`compose.prod.yaml` and nginx (AC26), smoke-tested end to end.**
  - Setup: the `local-db` profile, a self-signed certificate, the built
    images.
  - HTTP→HTTPS returns 301. The menu renders through TLS, and web's
    security headers arrive through the proxy. `Server: nginx` shows no
    version.
  - Traversal and case variants return 404.
  - The APIs, web and the database are not published on the host.
  - A 40 KB body returns 413.
  - Agent turns: 6 of 8 rapid turns returned 200, then 429 with a
    `RATE_LIMITED` JSON body and `Retry-After: 60`. `/API/AI/v1/agent/turns`
    shares the same limit.
  - Reads stayed allowed for the throttled client.
  - The root filesystem is read-only in all three app containers.
  - `migrate` ran once and exited 0 before commerce-api started.
  - **Network isolation:** ai-service cannot resolve `postgres`. This makes
    §4.1 structural in the reference topology and partly closes gap #2.
  - SIGTERM: all four services exit 0 in under 1 s. R-8 is verified for idle
    shutdown; in-flight draining was not exercised.
- **Deviations.**
  - nginx uses the official image, which runs its master as root, with
    `cap_drop: ALL` plus only CHOWN, SETGID, SETUID and NET_BIND_SERVICE, a
    read-only root filesystem and `no-new-privileges`. It is not a non-root
    image; the three app images are.
  - The `app` network is `internal`, so ai-service has **no internet
    egress**. That is correct today. A real model provider (D2) will need a
    deliberate egress path, recorded as part of D2.
  - Rate-limit locations are case-insensitive regexes. nginx matches
    locations case-sensitively, while web's rewrites match without regard to
    case.
  - The reference stack sets no `TRUST_PROXY_HOPS` or `FORWARDED_ALLOW_IPS`:
    neither API is reached through nginx directly, and neither reads the
    client address.
- **CI (AC25).** `.github/workflows/ci.yml` has five jobs: typescript,
  database, python, security and images.
  - Every action is pinned to a commit SHA: checkout v7.0.1, setup-node
    v7.0.0, pnpm/action-setup v6.1.0, setup-uv v10.2.0. Inputs were checked
    against each pinned `action.yml`.
  - `permissions: contents: read`, no secrets, no deploy.
  - **Not run on GitHub:** nothing was pushed. `actionlint` is
    NOT_CONFIGURED; the YAML was parsed and reviewed by hand.
- **Dependencies.**
  - OD8: a `next>postcss` override to `^8.5.23`, resolved to 8.5.28. The
    lockfile change is exactly that package. `pnpm audit --audit-level=high`
    passes with 0 high or critical findings. 2 moderate remain (vitest,
    dev-only, needs 4.x), a FOLLOW-UP.
  - OD9: `pip-audit` is a dev dependency, declared in the ai-service
    README, and allowlisted in `tests/test_boundaries.py`, which gates dev
    dependencies. `uv run pip-audit` finds no known vulnerabilities.
- **Local images left behind:** `food-ordering-platform/{web,ai-service,
  commerce-api}:latest` were built *before* the postcss override and need a
  rebuild before any use.

### Phase 5 — Docs, checklist, specialised reviews (2026-09-27)

- **Docs.**
  - New: `docs/operations/production-runbook.md`,
    `production-readiness-checklist.md` and `performance-baseline.md` (the
    last from Phase 1).
  - ADR-0024 added to `architecture-decisions.md`.
  - Updated: `system-architecture.md` (§2 production topology; §7; §8 gaps
    2, 3 and 4), `docs/api/commerce-api.md` (readiness, security headers,
    order retry semantics), `docs/api/ai-service.md` (readiness,
    `AGENT_BUSY`/`AGENT_TIMEOUT`, headers, log outcomes) and
    `getting-started.md` (CI state, `pip-audit`, the Phase 18 build and
    image commands).
- **Specialised reviews:** `security-review.md`.
  - An independent read-only agent reviewed the full diff and found one
    HIGH: the `data` network was internal, so a managed database was
    unreachable and the stack could never start in production.
  - That HIGH was reproduced, fixed (`data` made routable) and re-verified
    live: `migrate` reaches an off-network database, and ai-service still
    reaches neither it nor the internet.
  - One LOW, loopback-guard bypasses, was fixed test-first.
  - The rest were accepted with documentation, or recorded as follow-ups.
- **Phase 16's missing voice privacy review** is done (`security-review.md`,
  "Voice security and privacy"). NOTE 7 was not reproduced in a clean,
  instrumented browser context.
- **Final full validation.** Every declared check passed. Details are in the
  implementation report.
- **Supersedes the Phase 4 note on stale images:** the three
  `food-ordering-platform/*:latest` images were rebuilt from the final tree,
  with postcss 8.5.28 confirmed in the web image.
