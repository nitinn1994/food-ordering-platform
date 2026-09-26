# Security Review — Phase 15: AI → UI Commands & Business Intent Integration

**Flagged by:** `plan.md` "Specialised review needed? security: yes" (Full
Path), for two reasons:

- a new trust boundary: agent output now reaches the browser;
- a new browser → ai-service network path through the web proxy.

**Reviewed:** the uncommitted Phase 15 changes after `/review`
(`review-report.md`), with no fixes applied since.

- The trust-boundary code was read: `middleware.ts`, `proxyPath.ts`,
  `next.config.ts`, `agentService.ts`, `dispatch.ts`, `ChatInput.tsx`,
  `agentTurn.ts`, `ui_commands/`, `tools/intents.py`, `agents/nodes.py` and
  `agents/service.py`.
- The proxy was probed through the **real Next.js dev server** (15.5.25) over
  real sockets. Recording stand-ins sat on ai-service's port (3002) and on
  commerce-api's port (3001), so every request that got past the proxy was
  logged with its method, path, headers and body.
- Hostile ai-service bodies were fed into the **real page** in an isolated
  browser profile (turn 1). The remaining hostile bodies went through the
  **real web code path** by script (`sendAgentTurn` → `lib/api/client.ts` →
  `parseAgentTurnResponse` → `dispatchBatch`), with only `fetch` faked to
  return the raw bytes. The human chose this after a third party began using
  the browser window mid-probe (see "Process note").
- A **hostile scripted model** was run through the real ai-service app with
  `APP_ENV=production` and JSON logging at `DEBUG`. The captured output was
  searched for sentinels.
- Cross-site request forgery was probed against the **real ai-service**
  behind the real proxy.
- The lockfiles and manifests were compared with HEAD.

The probe scripts lived in the session scratchpad and are not committed.
Middleware was swapped to HEAD's version, and once instrumented, only
temporarily to attribute findings. It was restored byte-for-byte, which was
verified.

**Method:** done by hand. The built-in `/security-review` skill could not
run: it diffs against `origin/HEAD`, which is not set in this clone, and the
work is uncommitted. This is the same limitation Phase 14 recorded.

**Date:** 2026-09-27

## Verdict

**One HIGH finding, a regression this phase introduced (S1). It is now FIXED**
(at the human's request, 2026-09-27) and re-verified live. There is also
one MEDIUM **pre-existing** bypass from Phase 11 (S2), to record as a
follow-up.

Everything else holds under hostile input:

- AI output never executes, never navigates, and cannot touch commerce state
  from the browser.
- Invalid commands drop one by one.
- Prototype pollution is rejected.
- Nothing a customer or model says reaches the logs.
- Cross-site requests are refused.

`/review` (finding 2) judged the middleware's rule selection "correct, only
hard to read". That was wrong. Its unit tests pass, but they build a
`NextRequest` from the raw URL, while at runtime Next hands middleware an
already-normalized URL. Only the live probe found it.

## Findings

| # | Severity | Where | Finding | Evidence | Suggested fix |
| - | -------- | --------- | ------- | -------- | ------------- |
| S1 | **HIGH — Phase 15 regression — FIXED** (at the human's request) | `apps/web/src/middleware.ts:12-16` | **The commerce proxy's `/v1` confinement (Phase 11, finding S1) is broken for one path shape.** At runtime Next 15.5 hands middleware an **already-normalized** URL: `request.url` and `nextUrl.pathname` are both normalized, so the "raw path" check never sees `..`. For `/api/commerce/v1/../../ai/v1/agent/turns`, middleware sees `/api/ai/v1/agent/turns`, picks the AI rule, and allows it. The **commerce** rewrite then matches the original path and forwards the traversal. **Impact today:** normalization pins the target, so the only commerce-api path reachable this way is `/ai/v1/agent/turns`, which does not exist (404). No data is exposed, but a shipped security invariant ("the proxy never forwards outside `/v1`") no longer holds. | Recording stand-in on :3001. Phase 15 middleware: `commerce<- /ai/v1/agent/turns`. HEAD middleware, same request: nothing forwarded. An instrumented middleware logged `url` and `pathname` both as `/api/ai/v1/agent/turns`. | **Restore `middleware.ts` exactly to HEAD** (matcher `/api/commerce/:path*`, the commerce rule only). Remove `isForwardableAiPath` and its middleware and proxy-path tests. The AI rewrite needs no middleware: its `source` is one exact path and its destination is fixed. **Verified live** with HEAD middleware plus the Phase 15 rewrite: the traversal is blocked, only `/v1/agent/turns` reaches ai-service, every other `/api/ai/*` variant probed (dot segments, encoded, double-encoded, backslash, `;`, `/health`, `/docs`, `/openapi.json`) is a 404 from Next, and the commerce proxy still works. Then correct the docs that say middleware guards `/api/ai` (ADR-0022 §7, `ai-service.md` §1, `system-architecture.md` §2, `getting-started.md`). AC17's observable property (only the turn path is forwarded) still holds, by a different mechanism. **Done:** `middleware.ts`, `middleware.test.ts`, `proxyPath.ts` and `proxyPath.test.ts` are byte-identical to HEAD, and `isForwardableAiPath` and its 26 tests are removed. The `next.config.ts` comment, ADR-0022 §7, `ai-service.md` §1, `system-architecture.md` §2 and `test-plan.md` AC17 are corrected. **Re-probed live** (27 paths through `next dev` with both stand-ins): both traversal shapes (`/api/commerce/v1/../../ai/…` and `/api/commerce/v1/x/../../../ai/…`) reach nothing, only `/v1/agent/turns` reaches ai-service, and only the legitimate `/v1/cart` reaches commerce-api, except S2's pre-existing case variant. All four `turbo` checks (`--force`) and the full ai-service set pass. Web now has 338 tests, 364 minus the 26 removed. |
| S2 | MEDIUM — **pre-existing (Phase 11), not caused by Phase 15** | `apps/web/src/middleware.ts` (matcher) + `next.config.ts` (commerce rewrite) | **A case-variant bypasses the commerce middleware.** Next's rewrite matches case-insensitively, but the middleware matcher is case-sensitive. So `/API/COMMERCE/v1/../health` skips middleware entirely and the rewrite forwards the traversal. The same probe also shows Phase 11's "check the raw path too" defence is ineffective at runtime (see S1): its protection came from the normalized-path check alone. **Impact today:** commerce-api serves only `/health` (public) outside `/v1`, so nothing sensitive is reachable. It becomes real if commerce-api ever exposes anything outside `/v1`. | Probed with **both** HEAD and Phase 15 middleware: `/API/COMMERCE/v1/../health` gives `commerce<- /health` in both. | FOLLOW-UP (not done), separate from Phase 15. Options: a case-insensitive matcher (regex form) with a lowercased check, or replace the wildcard commerce rewrite with a Route Handler that builds the upstream path from validated segments. Either should be verified by a runtime probe, not only by unit tests. |
| S3 | NOTE | `next.config.ts` (AI rewrite) | Uppercase variants (`/API/AI/v1/agent/turns`) reach ai-service. This is harmless: the destination is fixed to `/v1/agent/turns`, the intended endpoint. | Stand-in received `POST /v1/agent/turns` for three case variants. | None. |
| S4 | NOTE | both proxies | A query string is forwarded (`?x=1` arrived at ai-service). `POST /v1/agent/turns` ignores unknown query parameters. The same is true of the commerce proxy (pre-existing). | Stand-in received `/v1/agent/turns?x=1`. | None now. Strip queries in a Route Handler if S2 is fixed that way. |
| S5 | NOTE | both proxies | **All client headers are forwarded to ai-service,** including `Cookie`, `Origin` and `X-Forwarded-*`. ai-service never logs headers (`ai-service.md` §7) and has no authentication, so nothing is exposed today. | Stand-in saw `cookie: session=victim` and `origin: https://evil.test`. | When authentication arrives, forward only an allowlist of headers, in line with ADR-0021's identity rule (the end user's own credential, never ambient cookies by accident). |
| S6 | NOTE | ai-service + proxy | **Cross-site request forgery is refused.** A cross-site `text/plain` or form POST gets **415** from ai-service's JSON guard before any turn runs. A cross-site JSON `fetch` needs a preflight, which gets **405 with no `Access-Control-*` headers**, so the browser blocks it. GET gets 405. The cart was unchanged. This depends on ai-service keeping its `application/json` guard. | Probed against the real ai-service through the real proxy. | Keep the JSON guard. If the proxy moves to a Route Handler (S2), keep enforcing `application/json`. |
| S7 | NOTE | allowlist design | **A prompt-steered model can move the UI, within the allowlist only.** It can pass an unknown `categoryId` (the menu filters to empty, recoverable) or put any text of 200 characters or fewer into the search box (rendered escaped). It cannot run code, navigate, open checkout, show an order, or change the cart from the browser. | Hostile model: the one valid call recorded carried the sentinel `categoryId`. | This is the follow-up already recorded (unknown category). |
| S8 | NOTE | `ChatInput.tsx`, `apps/web` | **Browser XSS contained.** A reply containing `<img onerror>` and `<script>` rendered as literal text: no `<img>` or script element, and `document.title` unchanged. A `SearchMenu` query with markup reaches only an input `value` and a JSX text node. There is no `dangerouslySetInnerHTML` or `innerHTML` anywhere in `apps/web`. | Live browser, turn 1. Grep of `apps/web/src`. | None. |
| S9 | NOTE | `agentTurn.ts`, `dispatch.ts` | **Hostile command batches drop per command.** `Navigate`, `ShowOrderConfirmation`, a smuggled `AddItemToCart`, `execute` keys and `javascript:` ids were each rejected, and valid siblings still applied. With 11 commands the envelope was rejected. `__proto__` at the top level rejected the response. `__proto__` or `constructor.prototype` inside a command rejected that command. `Object.prototype` was not polluted. An HTML body, a reply over 4000 characters, and a non-string reply each gave `invalid-response`. | Real web path script, 8 hostile bodies. | None. |
| S10 | NOTE | `ui_commands/`, `agents/nodes.py`, logging | **The hostile model gets nothing past validation, and nothing leaks.** Lookalike names (trailing space, a Cyrillic `ѕ`, uppercase) got `UNKNOWN_TOOL` and were logged as `<unregistered>`. A smuggled `type`, a nested object, a 5000-character query and a path-like id got `INVALID_TOOL_ARGUMENTS` and recorded nothing. There were zero commerce requests. At `DEBUG` in production mode, the logs held neither the customer message nor any argument or reply sentinel. | ai-service probe, captured JSON logs. | None. |
| S11 | NOTE | lockfiles | No new dependency. `pnpm-lock.yaml`, `uv.lock`, `pyproject.toml` and every `package.json` are unchanged from HEAD. | `git diff --stat`. | None. |

## Process note

During the live browser probe, the shared cart was changed by someone other
than the reviewer: three quantity changes, a removal and an add, logged by
commerce-api. The page was also interacted with. The browser portion was
stopped. At the human's direction, turns 2–6 were run by script through the
real web code path instead of the page. The cart ended in the same state as
at the start of the probe (1 × Garlic Bread). All probe processes were
stopped, and the local database was brought down with `db:down`, which keeps
its data.

## Not covered

- **The remaining browser-level turns (2–6)** were checked at the parser and
  dispatcher level, not rendered in the page. Rendering safety is covered by
  turn 1 plus the grep for raw HTML sinks.
- **A production build (`next start`)** was not probed. All proxy probes
  used `next dev`. Normalization and case handling should be re-probed on
  `next start` once S1 is fixed.
- **A real model provider:** none exists. The hostile scripted model stands
  in for a prompt-injected one.
- **Network-level exposure:** all services bind to loopback, as in Phase 14.
  Anything beyond loopback needs S2, S5 and the carried per-turn deadline
  first.
