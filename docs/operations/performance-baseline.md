# Performance Baseline

Recorded before any Phase 18 code change
(`docs/features/phase-18-production-hardening/plan.md` §12). It is a
sequential-latency baseline, **not a load test**: the repository declares no
load-testing tool.

## Conditions

| | |
| --- | --- |
| Date | 2026-09-27 |
| Commit | `90b9dac` (HEAD before Phase 18) |
| Machine | Intel Core i5-1135G7 (8 threads), Linux, all services and PostgreSQL on one host |
| Runtimes | Node v24.19.0, Python 3.12 (uv 0.12.19), PostgreSQL 18 (`postgres:18-alpine`, local Compose) |
| Services | commerce-api `pnpm start` (built, `LOG_LEVEL=warn`); ai-service `uv run python -m ai_service` (`LOG_LEVEL=WARNING`, simulated model); web `pnpm start` (`next start`, production build) |
| Data | Seeded menu: 3 categories, 6 items (5 available) |
| Method | `curl -s -o /dev/null -w '%{time_total}'` in a sequential loop over loopback, after a warm-up; p50/p95/max of n requests |

## Results

| Request | n | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| commerce-api `GET /health` | 200 | 0.6 ms | 0.7 ms | 0.8 ms |
| commerce-api `GET /v1/menu` | 200 | 2.3 ms | 2.8 ms | 7.1 ms |
| commerce-api `GET /v1/cart` (1 line) | 200 | 2.3 ms | 3.0 ms | 3.7 ms |
| commerce-api `GET /v1/cart` (5 lines; the maximum, all available items) | 200 | 2.8 ms | 3.5 ms | 6.0 ms |
| commerce-api `PATCH /v1/cart/items/:id` (5-line cart) | 100 | 9.1 ms | 13.6 ms | 20.4 ms |
| ai-service `POST /v1/agent/turns` "hello" (no tool) | 100 | 3.7 ms | 4.5 ms | 6.7 ms |
| ai-service turn "show my cart" (presentation tool only) | 100 | 4.2 ms | 6.3 ms | 7.9 ms |
| ai-service turn "add tiramisu" (commerce write tool) | 30 | 14.0 ms | 22.3 ms | 44.4 ms |
| web `GET /` (server-rendered, fetches the menu) — see correction below | 100 | 7.8 ms | 9.4 ms | 12.7 ms |
| web `GET /cart` (static shell) | 100 | 1.4 ms | 1.7 ms | 1.9 ms |
| web `GET /api/commerce/v1/cart` (proxy → commerce-api) | 100 | 4.4 ms | 5.7 ms | 69.8 ms |

**Correction (2026-09-27, Phase 3).** The first run of the `web GET /` row
(p50 4.2 ms, p95 5.8 ms) timed an error page, not the menu. `next start`
had been started without `COMMERCE_API_URL`, and `src/lib/api/config.ts`
refuses to fall back in production, so the Server Component threw and
`error.tsx` rendered. The figures above were re-measured with
`COMMERCE_API_URL` and `AI_SERVICE_URL` set and the menu verified in the
response, on the Phase 3 build rather than `90b9dac`. Phase 3 changed only
headers and the dev panel on this route. The `/cart` and proxy rows were
unaffected: they do not render the menu server-side.

### Frontend bundle (`next build`, Next.js 15.5.25)

| Route | Size | First Load JS |
| --- | --- | --- |
| `/` (dynamic) | 7.24 kB | 144 kB |
| `/cart` (static) | 1.66 kB | 139 kB |
| `/checkout` (static) | 4.49 kB | 142 kB |
| `/_not-found` | 992 B | 104 kB |
| Shared by all | — | 103 kB |
| Middleware | 34.2 kB | — |

## Not measured

- **Voice.** STT, TTS and end-to-end spoken-turn latency. These run in the
  browser's own speech engines, and this machine has no speech voices
  (Phase 16 review). NOT MEASURED.
- **Real model latency and token usage.** The model is simulated (dependency
  D2). The agent timings above measure graph and tool overhead only.
- **Concurrency and throughput.** No load-test tool is declared.
- **Remote database or network latency.** Everything ran on loopback.

## Conclusions (OD5)

- The N+1 menu lookup in cart pricing (`cart.service.ts:161-167`) is bounded
  by the number of available menu items: 5 today. Going from 1 to 5 lines
  added about 0.5 ms at p50. **Batched lookup is not justified by this
  baseline.** It stays a recorded follow-up (ADR-0017) and should be revisited
  if the menu grows or the database moves off-host.
- The uncached menu costs about 2–3 ms per page view (commerce-api's
  `GET /v1/menu`), inside a 7.8 ms p50 server render. **Menu caching is not
  justified by this baseline.** Leaving it uncached keeps availability
  changes visible immediately.
- Agent turn overhead is small beside the real model latency still to come
  (D2). The 20 s turn deadline (OD13) sits well above everything measured.
