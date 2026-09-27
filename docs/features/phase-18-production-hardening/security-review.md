# Specialised Reviews — Phase 18

Full Path specialised reviews (`plan.md`, "Specialised review needed?"):
security (including Phase 16's outstanding voice privacy review),
performance, and data / migration. Date: 2026-09-27.

## Method and independence

- **Independent security review.** A separate read-only agent reviewed the
  whole Phase 18 diff against HEAD `90b9dac`, adversarially, without
  editing anything. Its findings are S1–S8 below, each re-checked here.
  Where a finding was fixed, the fix was verified live or by a failing and
  then passing test.
- **The implementer's own live probes** during Phases 1–4 are recorded in
  `plan.md` "As built" and summarised here. They are evidence, not an
  independent review.
- Neither review is a substitute for a human security review before a
  public launch. That review cannot happen meaningfully until B1
  (identity) exists.

## Summary

**One HIGH finding (S1) and it is fixed.** In the production compose file,
the database network was internal, so commerce-api and `migrate` could not
reach a managed (off-host) database. The stack could never start in
production. It was missed because the smoke test used a throwaway database
on that same network.

One LOW finding (S2) is fixed. The other findings are accepted with
documentation or recorded as follow-ups. Nothing else found weakens a
Phase 18 control.

## Security findings

| # | Severity | Where | Finding | Status / evidence |
| - | -------- | ----- | ------- | ----------------- |
| S1 | **HIGH** | `infrastructure/docker/compose.prod.yaml` (`data` network) | The `data` network was `internal: true`, which has no route off the host. commerce-api and `migrate` could not reach managed PostgreSQL, so `migrate` failed and commerce-api never started. | **FIXED.** Reproduced first: `migrate` gave `getaddrinfo EAI_AGAIN host.docker.internal`. `data` is now a routable network. After the fix, `migrate` against an off-network database exits 0 (`Already up to date.`). ai-service is still on the internal `app` network only and still cannot reach that database or the internet (`gaierror` for both). ADR-0024, `system-architecture.md` §2 and the runbook are corrected. |
| S2 | LOW | `apps/commerce-api/src/config/env.schema.ts` (`hasLoopbackHost`) | The production loopback-database guard compared the host as written. `postgres:` is not a WHATWG special scheme, so `LOCALHOST`, `localhost.`, `0.0.0.0`, `[::]`, `[::ffff:127.0.0.1]`, `2130706433`, `0x7f000001` and `0177.0.0.1` all passed. It guards against accidents, not attackers. | **FIXED.** The host is re-parsed under `http:`, which lowercases it and canonicalises numeric IPv4 to dotted-decimal. A trailing dot is stripped. The unspecified and IPv4-mapped loopback forms are refused. A host that `http:` rejects falls back to a lowercased comparison instead of crashing. 8 new cases failed before the fix and pass after it, and non-loopback hosts are still accepted (`env.schema.test.ts`, 43 tests). |
| S3 | LOW | `env.schema.ts` (production rule) | `DATABASE_SSL=disable` satisfies "required in production". `require` does not verify the certificate. | **ACCEPTED, documented.** The rule makes the TLS mode an explicit decision, as OD14 approved. `disable` is legitimate on a network the operator controls. The runbook §2 now says what each mode does and does not protect. A stricter "refuse disable unless an extra flag" rule is a possible follow-up. |
| S4 | LOW | `apps/web/Dockerfile`, `apps/commerce-api/Dockerfile` | `npm install -g pnpm@12.3.4` pins the version but not its integrity. Base images and actions are pinned by digest or SHA. | **FOLLOW-UP.** Use Corepack with a `packageManager` hash (`pnpm@12.3.4+sha512…`). That changes the root `package.json` tooling contract, so it is left for a separate change. |
| S5 | NOTE | `infrastructure/docker/nginx/nginx.conf` (`limit_req_zone`) | Rate limits key on the peer address. A load balancer in front of nginx would make them global, and IPv6 clients can rotate within a /64. | **ACCEPTED, documented.** Runbook §1: nginx must be the edge; configure `set_real_ip_from` for a trusted balancer first. Keying IPv6 per /64 is a follow-up if abuse appears. |
| S6 | NOTE | `compose.prod.yaml`, `nginx.conf` headers | They referenced a runbook that did not exist yet. | **RESOLVED.** `docs/operations/production-runbook.md` now exists (Phase 5). |
| S7 | NOTE | `apps/web/src/lib/voice/browserTextToSpeech.ts` | If a browser fired `end` synchronously inside `speak()`, the watchdog would be armed after settling. | **NO CHANGE.** Harmless: `settle` is guarded by `settled`, so it reports nothing twice and cancels nothing it should not. |
| S8 | NOTE | `apps/commerce-api/src/database/database-client.ts` (`ping`) | During a database stall, an abandoned readiness `select 1` holds a pool connection for up to 5–10 s. A tight probe loop could fill the pool. | **FOLLOW-UP (LOW).** `/health/ready` is not reachable through web or nginx; only an operator's probe can call it. Share one in-flight ping if probes are frequent. The runbook's probe guidance is per deploy, not a tight loop. |

### Controls re-verified (independent review and live probes)

- **Proxy confinement (Phase 15 S2 closed):**
  - The case-insensitive matcher plus a case-insensitive prefix check; both
    the raw and the parsed path are checked.
  - Encoded prefixes, `%2e%2e`, `%2f` and `%5c` are refused.
  - JS `/i` without `u` never folds non-ASCII into ASCII.
  - Live 17-path matrix: before the fix, 5 variants escaped and 4 reached
    commerce-api's `/health`. After the fix, nothing outside `/v1` reached
    any upstream, on `next start`, on the standalone server, and through
    nginx.
- **Rate limits:**
  - Case-insensitive regex locations on nginx's normalised, decoded path;
    HEAD counts as a read.
  - Live: 6 of 8 rapid agent turns returned 200, the rest 429 with a
    `RATE_LIMITED` body. `/API/AI/...` shares the same limit.
- **CSP and headers.** No third-party origin and no eval in production.
  Framing is refused, verified in Chrome. No `X-Powered-By` or `server`
  banner.
- **CI.** It uses `pull_request`, not `pull_request_target`, with
  `contents: read`, `persist-credentials: false`, SHA-pinned actions, no
  secrets, and no `${{ github.event.* }}` interpolated into `run`.
- **Forwarded headers.** Trusted nowhere by default (`TRUST_PROXY_HOPS=0`;
  uvicorn `proxy_headers=False` unless configured).
- **Order idempotency re-lookup.**
  - It is scoped to `(ownerId, idempotencyKey)` and still enforces
    `isSameOrderRequest`.
  - A retry can replay only the caller's own order, under the same key,
    with the same customer details.
  - A different-key race still gets 409 or 422.
- **ai-service gate.**
  - The concurrency counter is incremented immediately before
    `try/finally`, with no await in between, so it is released on success,
    error and cancellation.
  - `deadline.expired()` distinguishes the turn's own timeout, and
    `CancelledError` still propagates.
- **Containers.**
  - Non-root: uid 1000 and 10001.
  - Code is root-owned; root filesystems are read-only (`touch` fails).
  - No `.env` in any image; ai-service has no dev tools.
  - Only the proxy publishes ports.
- **Secrets.** No real `.env` has ever been committed. The only runtime
  secret is `DATABASE_URL`, required from the environment. Config errors
  never print values.

## Voice security and privacy (Phase 16's outstanding review)

Phase 16's Full Path required a security and privacy review that was never
recorded (`plan.md` §5 V-8). Reviewed here:

| # | Finding | Status / evidence |
| - | ------- | ----------------- |
| V1 | Audio handling | **Holds.** No `getUserMedia` or `MediaRecorder`; the Web Speech API only. No audio reaches web's server, ai-service or commerce-api. Nothing is stored. |
| V2 | Third-party speech processing | **Accepted with disclosure** (Phase 16 OD2). Chromium's recognizer may send audio to its vendor. TTS prefers an on-device voice. The disclosure is shown before first use (seen in the Phase 3 browser check). |
| V3 | Microphone permission | **Holds.** It is requested only by the user's press. `Permissions-Policy: microphone=(self)` is on every route, and CSP `frame-ancestors 'none'` stops the page being framed at all. |
| V4 | Phase 16 NOTE 7 (the microphone seen listening before a press) | **Not reproduced.** Clean browser context: `SpeechRecognition.start`, `getUserMedia` and `speechSynthesis.speak` were instrumented before any page script ran. After 3 s idle plus other interaction, all counters were 0 and the permission state was still `prompt`. Pressing the microphone button gave exactly one recognition start, so the probe was live. |
| V5 | Transcript handling | **Holds.** A transcript is length-checked, sent through the same turn as typed text, and never logged. |
| V6 | Session isolation and replay | **Holds (no server state).** There is no voice session server-side to hijack or replay. Isolation between customers depends on B1. |
| V7 | Secure transport | **READY in the reference deployment.** Speech APIs need a secure context. nginx terminates TLS, HTTP redirects to HTTPS, and HSTS is sent. |
| V8 | Stuck playback | **FIXED in Phase 3.** A TTS watchdog (10 s plus 100 ms a character) cancels playback and reports `playback-failed`. |

**Not verified:** a real microphone and real speech output (the machine has
no voices), Firefox, Safari, mobile and screen readers, as in Phase 16.

## Performance review

Baseline: `docs/operations/performance-baseline.md`, measured before any
code change and corrected once.

- **OD5 resolved: no optimisation added.**
  - The N+1 in cart pricing is bounded by menu size: from 1 to 5 lines is
    about +0.5 ms at p50.
  - The menu costs about 2–3 ms per request.
  - Batching and caching would add complexity with no measured benefit.
    Revisit if the menu grows or the database moves off-host (the likely
    first change in production, since managed PostgreSQL adds network
    latency to every one of those per-line queries).
- **Deadline and cap versus measured latency.** Simulated turns take 4–14 ms
  at p50 and 44 ms at worst, so the 20 s deadline and 16-turn cap cannot
  trip in normal operation. Both must be re-tuned with the real model (D2).
- **New overhead from Phase 18.**
  - Per request: security-header middlewares, a handful of `setHeader`
    calls.
  - At runtime: the web CSP is a static string computed at build time.
  - The order-race fix adds one idempotency lookup, only on the failure
    path.
  - Not re-measured separately: none of it is on a loop or does I/O.
- **Not measured:** load and throughput (no tool declared), real-model
  latency, voice latency.

## Data / migration review

- **No schema change and no new migration.** The existing CHECK, UNIQUE and
  FK constraints are unchanged.
- **Order idempotency race.**
  - The fix is a second read on the failure path. It writes nothing, and
    the transaction boundary (consume cart plus insert order) is unchanged.
  - It was proven on PostgreSQL: two barrier-synchronised same-key
    placements both get 201 with the same id, and 6 unsynchronised same-key
    placements share one id and one row. Both new DB tests failed on the
    old code.
  - Live: 3 parallel same-key POSTs gave 3 × 201 with one order id.
- **Migration runner.**
  - `dist/migrate.js` is the same migrator and registry as `db:migrate`,
    built without `vite-node`, and runs under Kysely's migration lock.
  - `down` refuses with `NODE_ENV=production` (verified), making the
    forward-only policy mechanical.
  - A failed `migrate` blocks commerce-api from starting
    (`service_completed_successfully`).
- **Production seed.** `dist/seed.js` refuses in production without
  `--allow-production` (verified). It is an upsert of the in-code menu, so
  re-running it restores seeded names, prices and availability.
  Historical orders are unaffected, because they snapshot name and price.
- **Database TLS.**
  - `DATABASE_SSL` maps to pg's `ssl` option, and a conflicting `sslmode`
    in the URL is refused.
  - Verified: the config wiring and its tests. **Not verified:** a real TLS
    handshake against a certificate-presenting server, since no TLS
    PostgreSQL was available.
- **Roles.** A single database role is still in use. The migrator/app split
  is documented in runbook §3, not created (operator).
- **Backups, retention, PII.** Unchanged and BLOCKED: B4, D5, D6. Orders hold
  name, phone and email with no retention policy.

## Follow-ups (not done)

```text
FOLLOW-UP (not done): apps/{web,commerce-api}/Dockerfile — pnpm installed by version without integrity — Corepack with a packageManager sha512 hash — LOW
FOLLOW-UP (not done): apps/commerce-api/src/config/env.schema.ts — DATABASE_SSL=disable allowed in production — optionally require an explicit ALLOW_INSECURE_DATABASE flag — LOW
FOLLOW-UP (not done): apps/commerce-api/src/database/database-client.ts ping() — concurrent probes each hold a connection during a stall — share one in-flight ping — LOW
FOLLOW-UP (not done): infrastructure/docker/nginx/nginx.conf — IPv6 clients keyed per /128 — key per /64 if abuse appears — LOW
```
