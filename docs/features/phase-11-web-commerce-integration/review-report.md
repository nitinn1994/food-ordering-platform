# Review Report — phase-11-web-commerce-integration

**Reviewed:** `requirements.md` (AC1–AC21), `plan.md` (§1–§26, OD1–OD14),
`test-plan.md`, then the full uncommitted diff: 54 modified, 8 deleted and
15 untracked paths in `apps/web/`, `pnpm-lock.yaml` and `docs/`. Two passes:
this review, and an independent read-only pass by the
`implementation-reviewer` agent, which returned APPROVE with one LOW and two
NOTEs. Both passes' findings are merged below.
**Path:** Full

## Verdict

Sound against the approved plan. There are no BLOCKER or HIGH findings.
One MEDIUM (#1, a stale-response race in the cart provider) was found and
has since been **fixed** (see "Resolutions after review"). Everything else
is LOW or NOTE.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM | `apps/web/src/lib/state/cartStore.tsx:84-95` (`load`), `:121` (`mutate`); `apps/web/src/components/menu/MenuItemCard.tsx:40` | **A late cart response can overwrite a newer one.** `load()` applies whatever `GET /v1/cart` returns, unconditionally. "Add to cart" is disabled only while a *mutation* is pending, not while the initial load is in flight. Scenario: the page hydrates, the initial GET is sent, and the user clicks "Add to cart" before it returns. The POST's response is applied, then the older GET response arrives and replaces it. The screen then shows a cart without the item the backend has just confirmed, until the next action or reload. Responses on separate connections are not guaranteed to arrive in order. The same shape applies to any `refresh()` that overlaps a mutation. It is rare (the click must land inside the GET's latency), but it breaks "display the latest backend-confirmed state". **Not reproduced;** reasoned from the code, which applies both responses with no ordering check. No test covers overlapping load and mutation. The independent reviewer did not raise it. | Apply a response only if it is the newest issued. Keep a request counter in a ref, capture it per `getCart`/mutation call, and ignore any response whose number is older than the last one applied. Alternatively, disable cart-mutating controls while `status === "loading"`. The counter is more robust, because it also covers `refresh()`. Add a test: a deferred initial GET, then a POST that resolves first; assert the POST's cart remains. |
| 2 | LOW | `apps/web/src/components/checkout/CheckoutFlow.tsx` (`handlePlaceOrder`, after `ORDER_PLACED`) with `cartStore.tsx` `load()` | If the post-order `refresh()` fails, the provider keeps the pre-order cart (by design: a cart on screen stays). The nav and `CartPanel` then show the items that were just ordered and emptied server-side, until the next successful read. The confirmation itself is correct. | Optional: after `ORDER_PLACED`, retry the refresh once. Or accept this and document it next to the "a cart on screen stays" rule. |
| 3 | LOW | `apps/web/src/lib/api/client.ts` (`RequestOptions`), plan §6 / §16 | *(independent reviewer)* The plan's `request()` has an optional caller `signal`, combined with the timeout via `AbortSignal.timeout`. The implementation has no `signal` option and uses its own `AbortController` + `setTimeout`. No caller needs cancellation and no AC depends on it, but the planned API was narrowed without saying so. | Record it in the implementation report / PR description. Add `signal` when a caller first needs cancellation. |
| 4 | NOTE | `apps/web/src/components/cart/CartLine.tsx`, `QuantityStepper.tsx` | *(independent reviewer)* AC8's wording says the *increase* control is disabled for an unavailable line. The code disables increase **and** decrease. That is correct behaviour: `commerce-api`'s `setItemQuantity` rejects any re-quantify of an unavailable item (422), so decrease would always fail. The code comment says so. | None. Optionally align the wording of AC8 in the PR. |
| 5 | NOTE | `apps/web/src/lib/state/cartStore.tsx` (`mutate` catch → `load`) | *(independent reviewer)* When a mutation fails **and** the recovery re-read fails, the cart stays on screen with the second error's message and a "Dismiss" button, not "Try again". This is tested ("keeps the last confirmed cart on screen when the re-read also fails") and consistent with §10/§11, which do not specify this double failure. | None required. It is a UX trade-off to revisit if it matters. |
| 6 | NOTE | `apps/web/src/lib/api/userMessages.ts` (`COMMERCE_ERROR_CODES`) | commerce-api's error codes are re-declared as strings in `apps/web`, as planned (§15; the codes live in commerce-api, which `apps/web` must not import). A code renamed in commerce-api would silently fall through to the generic copy. | None now. If it recurs, move the domain codes into `@contracts/api-contracts`, which is a contract change for a later phase. |
| 7 | NOTE | Security, for the specialised review | Not defects, but these are the items the security reviewer should confirm: (a) the rewrite forwards only `/api/commerce/v1/*`. `/health` and `/v2` returned 404 live, but `..`-segment traversal (for example `curl --path-as-is`) was **not** tested. commerce-api serves only `/health` and `/v1` today, so any exposure is small. (b) Cross-site request forgery: the proxy is unauthenticated (as is commerce-api, single-user by design). A cross-site HTML form cannot send `application/json`, and commerce-api rejects any non-JSON body with 415, so a forged simple request fails. This was reasoned, not tested. (c) `COMMERCE_API_URL` is server-only. `.env.example` holds no secret. | Security review to verify (a) and (b) explicitly. |

The deviations reported during implementation were re-checked and are
handled as described: `force-dynamic` on `/`, `next.config.ts`'s production
fallback, the proxy returning 500 when commerce-api is down (recorded
follow-up), `error.tsx` refresh + reset, the form's focus on mount, and
`/checkout` dropping `getMenu()` in 11.3. They are not re-flagged.

## Resolutions after review

The human approved fixing #1. #2–#7 are unchanged; #2 is deferred as a
follow-up.

- **#1 — FIXED.** `cartStore.tsx` now numbers every cart request (load or
  mutation) when it is sent. A response, success or failure, is applied
  only if no later-sent request's response has already been applied.
  - Two tests were added to `cartStore.test.tsx` under "response ordering
    (review finding #1)":
    - a late initial GET arriving after an "Add to cart" POST must not
      replace the newer cart;
    - a late *failure* of that GET must not surface an error.
  - **Both tests failed before the fix.** Observed: the cart lines went from
    `tiramisu×1` to empty, and the error became "Something went wrong on our
    side…". So the finding is now reproduced rather than only reasoned. Both
    pass after the fix.
  - Targeted re-validation (`pnpm --filter web test` / `typecheck` /
    `lint`): PASS, 39 files, 279 tests.

## Acceptance criteria

AC1–AC21 are satisfied by code and tests, not merely adjacent to them.
Both passes checked this. AC2 is satisfied as reworded (with the human's
agreement). AC8 is satisfied, with the stricter behaviour in #4. AC21 was
executed live in sub-phase 11.5, and the walk found the `error.tsx` bug,
which was fixed and re-verified.

Two gaps in test coverage against the ACs:

- No test covers a failed post-order refresh (#2).
- Overlapping load and mutation (#1) is now covered.

## Scope check

| Changed file(s) | Serves plan phase | In scope? |
| --------------- | ----------------- | --------- |
| `apps/web/package.json`, `pnpm-lock.yaml`, `next.config.ts`, `.env.example` | 11.1 | yes |
| `src/lib/api/{config,errors,client,userMessages}.ts` + tests | 11.1 | yes |
| `src/lib/cart/cartService.ts`, `src/lib/checkout/{orderService,idempotencyKey}.ts` + tests | 11.1 | yes |
| `src/test/fetchStub.ts`, `src/test/fixtures/menu.ts` | 11.1 / 11.2 | yes |
| `src/test/cart.tsx`, `src/test/order.ts` | 11.3 / 11.4 | yes. Test helpers not named in plan §18, but plan §17's test approach needs them |
| `src/lib/menu/{menuSource,filter}.ts` + tests; menu components (type imports); menu component tests | 11.2 | yes |
| `src/lib/fixtures/menu.ts` (deleted) | 11.2 | yes |
| `src/app/{page,error}.tsx`, `error.test.tsx` | 11.2 (`error.tsx` retry fix: 11.5, required by AC3) | yes |
| `src/lib/state/cartStore.tsx`, `cartStore.test.tsx` (new), `cartStore.test.ts` (deleted), `cartStore.navigation.test.tsx` | 11.3 | yes |
| `src/components/cart/*` (incl. new `CartErrorMessage` + CSS), `nav/SiteNav.tsx`, `menu/MenuItemCard.tsx` + tests (`MenuItemCard.test.tsx` new) | 11.3 | yes |
| `src/lib/cart/pricing.ts` + test (deleted), `src/app/cart/page.tsx` | 11.3 | yes |
| `src/app/checkout/page.tsx` | 11.4 (landed in 11.3, reported) | yes |
| `src/lib/checkout/{checkoutReducer,types}.ts` + test; `components/checkout/{CheckoutFlow,CheckoutReview,OrderConfirmation,OrderSummary}.tsx` + tests + CSS | 11.4 | yes |
| `src/lib/checkout/{order,orderId}.ts` + tests (deleted) | 11.4 | yes |
| `components/checkout/CustomerDetailsForm.tsx` (focus on mount), `CustomerDetailsForm.test.tsx` (new action field) | 11.4. Not listed in plan §19; needed so AC13's return-to-details is accessible; reported | yes, small and reported |
| `src/lib/checkout/validation.ts` (comment only), `idempotencyKey.ts` (comment) | Docs made wrong by the approved work (scope-control rule) | yes |
| `docs/architecture/*`, `docs/api/commerce-api.md`, `docs/product/*`, `docs/development/getting-started.md` | 11.5 (plan §19) | yes |
| `docs/features/phase-11-web-commerce-integration/*` | plan / approval / AC2 rewording | yes |

Nothing is unattributable. `apps/commerce-api/**` and
`packages/contracts/**` have no diff.

## Not reviewed

- **Behaviour of #1:** reasoned, not reproduced. No test or live run
  exercised overlapping requests.
- **Security items #7(a) and #7(b):** not tested; flagged for the
  specialised security review.
- **Test files read only in part.** In this pass: `CartAnnouncer.test.tsx`,
  `SiteNav.test.tsx`, `MenuList.test.tsx`, `OrderSummary.test.tsx`,
  `CategoryFilter.test.tsx`, `ItemDetailPanel.test.tsx`. Their changes were
  written during implementation and pass, but were not re-read line by line
  here.
- **Doc changes:** checked for accuracy against the code where they state
  behaviour (ADR-0018, getting-started, MVP §17). Not proof-read for style.
- **Accessibility:** not re-verified with a screen reader. The live walk
  confirmed the live-region text and focus moves through the accessibility
  tree only.
- **Performance:** not reviewed. Plan §24 marks it not needed; one request
  per action at single-user scale.
- **Validation:** not re-run by this review. The `/validate` run
  immediately before it (all PASS, 815 + 111 tests) is the evidence.

---

## Specialised security review (Full Path)

**Performed:** 2026-09-26, by hand, because the `security-review` skill needs
a git remote (`origin/HEAD`) and this repository has none. Static checks ran
on the diff and the build output. Live probes ran against `next start` (a
fresh build) + `commerce-api` dev + PostgreSQL.

**Security verdict: CHANGES RECOMMENDED → PASS after S1 and S2 were fixed** (see "Security resolutions" below). Original verdict: CHANGES RECOMMENDED. There are two MEDIUM findings,
both about how far the new proxy reaches. Neither leaks data today. Both
defeat a control this phase claims to have. The other checked items pass.

| # | Severity | Where | Finding | Evidence | Suggested fix |
| - | -------- | ----- | ------- | -------- | ------------- |
| S1 | MEDIUM | `apps/web/next.config.ts` (rewrite) | **Dot segments escape the `/v1`-only scope.** Next matches `/api/commerce/v1/:path*` before normalising, and forwards a `..` segment (plain or `%2e%2e`). The destination then resolves outside `/v1`. ADR-0018, plan §14 and the rewrite's own comment all say only `/v1` is forwarded; that is false for dot segments. | `curl --path-as-is`: `/api/commerce/v1/../health`, `/api/commerce/v1/%2e%2e/health` and `/api/commerce/v1/menu/../../health` each returned `200 {"status":"ok"}`, and commerce-api logged the `GET /health` hits. `..%2f`, `%2e%2e%2f` and `..%252f` stayed inside `/v1` (404 `ROUTE_NOT_FOUND`). | Reject dot segments before proxying. Either add a small `middleware.ts` matched to `/api/commerce/:path*` that returns 404 when any decoded segment is `.` or `..`, or replace the rewrite with a Route Handler (`app/api/commerce/v1/[...path]/route.ts`) that validates segments and forwards explicitly. Add a test for the rule. Today's exposure is only `/health` (liveness, no data), but any future non-`/v1` route on commerce-api would be reachable. |
| S2 | MEDIUM | `apps/web/package.json` (`next dev` / `next start`), with `next.config.ts` | **The proxy widens commerce-api's network exposure from loopback to the LAN.** Next listens on all interfaces by default, while commerce-api is deliberately bound to `127.0.0.1` (`env.schema.ts` `HOST`; Phase 10 bound Postgres to localhost for the same reason). Through the proxy, any host on the network can read and change the single shared cart and place orders. Order reads need an unguessable UUIDv4. There is no authentication by design (CLAUDE.md, single user), which is exactly why the loopback binding was the control. | `ss -ltn`: `127.0.0.1:3001` (commerce-api) vs `*:3000` (web). | Bind `apps/web` to loopback by default: `next dev -H 127.0.0.1` and `next start -H 127.0.0.1`, with a documented override. Or, at minimum, document the exposure in `getting-started.md` and ADR-0018. The binding change is the smaller, safer fix. |

**Checked and passing**

| Area | Result | Evidence |
| --- | --- | --- |
| Cross-site request forgery | PASS | A cross-site page can send only "simple" requests without a preflight. Every body-carrying one reached commerce-api's JSON-only guard and got **415**: `text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`, including `POST /v1/orders`. `DELETE` and JSON `POST` need a browser preflight; the proxy answers `OPTIONS` with 404 and no `Access-Control-Allow-*` headers, so the browser blocks them. The cart was unchanged by every probe. Cross-site `GET`s are side-effect-free, and their responses are unreadable without CORS. |
| Host injection / request forgery via `:path*` | PASS | `/v1/%2F%2Fexample.com` and `/v1/@example.com` were answered by commerce-api (404). `/v1//example.com/x` got a same-origin 308. The destination host is fixed. |
| Server-only config | PASS | A build with `COMMERCE_API_URL=http://secmarker-7f3a.internal:9999` left the marker in **0** files under `.next/static`. It appeared only in server-side `routes-manifest.json` and `required-server-files.json`. The client bundle contains `config.ts`'s code, which reads `env.COMMERCE_API_URL` at runtime (empty in the browser), and the dev default literal. No `NEXT_PUBLIC_` variable exists. |
| Secrets | PASS | `.env.example` holds only the dev URL. `apps/commerce-api/.env` (dev credentials copied from its `.env.example`) is gitignored (`.gitignore:27`). No new external dependency: only two `workspace:` links. |
| Backend / internal error text reaching users | PASS | Copy is chosen by `code`/`kind` only, and `ApiError` does not keep the backend `message`. `error.tsx` renders static text. Production HTML with the API down contained only a digest (11.2). Tests assert that backend messages never render. |
| Personal data in logs | PASS | No `console.*` in `apps/web/src`. The client never logs request bodies. The 11.5 walk found no customer name or phone in the browser console or in five server logs. |
| XSS sinks | PASS | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `apps/web/src`. React escapes all backend strings. |
| Response trust | PASS | Every 2xx body is validated against the strict `@contracts/api-contracts` schema before use. A mismatch becomes `invalid-response`. |
| Idempotency keys | PASS | `crypto.randomUUID`, falling back to `crypto.getRandomValues` (128 bits). Not predictable. |

**Not covered:** rate limiting or abuse (none exists anywhere, by design);
TLS (local development only); dependency CVE scanning (no external
dependency added; no scanner configured).

### Security resolutions

The human approved fixing both findings.

- **S1 — FIXED.** New `apps/web/src/lib/api/proxyPath.ts`
  (`isForwardableProxyPath`) and `apps/web/src/middleware.ts` (matcher
  `/api/commerce/:path*`, runs before the rewrite). A request is answered
  404 unless its path is under `/api/commerce/v1/` and no decoded segment
  is `.` or `..` or contains `/` or `\`. The middleware checks both Next's
  parsed pathname and the raw request path.
  - Tests: `proxyPath.test.ts` (18 cases) and `middleware.test.ts` (7 cases,
    node environment).
  - **Live re-probe on `next start`:** `/v1/../health`, `/v1/%2e%2e/health`,
    `/v1/%2E%2e/health`, `/v1/menu/../../health`, `/v1/..%2fhealth` and
    `/v1/%2e%2e%2fhealth` all returned 404. commerce-api logged **0**
    `/health` hits during the probes (before the fix, three proxied probes
    reached it). Normal traffic (`/v1/cart`, `/v1/menu`, the server-rendered
    menu) was unaffected.
  - Observed detail: `/v1/./cart` returned 200. Live, the middleware
    receives Next's *normalised* pathname (`/api/commerce/v1/cart`). A
    single dot that stays inside `/v1` therefore passes, and commerce-api
    resolves it to `/v1/cart`. This is harmless: a path normalises to inside
    `/v1` exactly when its destination resolves to inside `/v1`. The
    raw-segment check is defence in depth.
- **S2 — FIXED.** `apps/web/package.json`: `"dev": "next dev -H 127.0.0.1"`
  and `"start": "next start -H 127.0.0.1"`.
  - **Live:** `ss -ltn` shows `127.0.0.1:3000` (was `*:3000`). A request to
    the machine's LAN address `:3000` is refused. `http://localhost:3000`
    still answers 200.
  - Docs updated: ADR-0018 decision 1, the rewrite comment in
    `next.config.ts`, and `getting-started.md`.
- **Validation after the fixes (targeted, `apps/web`):**
  `pnpm --filter web test` PASS (41 files, 304 tests: 279 plus 25 new);
  `typecheck` PASS; `lint` PASS; `pnpm --filter web build` PASS (the route
  table now also lists `ƒ Middleware`).

