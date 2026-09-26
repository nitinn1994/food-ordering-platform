# Test Plan — Phase 11: Next.js → NestJS Commerce API Integration

All automated tests run in the existing `apps/web` Vitest + Testing Library +
jsdom setup (ADR-0008). Tests use no network and no running API. `fetch` is
stubbed via `src/test/fetchStub.ts` (`vi.stubGlobal`). Retry backoff and the
idempotency-key source are injected, so tests are deterministic and never
sleep.

Live integration (AC21) is manual, against `commerce-api` dev + PostgreSQL.

## What will be tested

| AC | How it is verified | Type |
| --- | --- | --- |
| AC1 | `menuSource.test.ts`: `getMenu()` issues `GET …/v1/menu` with `cache: "no-store"` and returns `categories`. Also `grep -rn "fixtures/menu" apps/web/src` returns only `src/test/`, and `lib/fixtures/menu.ts` is absent | automated + grep |
| AC2 | `pnpm turbo run build` with commerce-api stopped; the route table shows `ƒ /`, and `/cart` and `/checkout` fetch nothing server-side (static is fine), output recorded | manual build check |
| AC3 | `menuSource.test.ts`: network, 500, invalid body → rejects with `ApiError`. `error.test.tsx`: renders static copy and never the thrown message; "Try again" calls `reset` | automated |
| AC4 | `cartStore.test.tsx`: loading → ready from the `GET` body. `CartList`/`CartPanel`/`SiteNav` tests: loading copy and figures equal the stub body's. `grep` for `priceCents *` or `* quantity` arithmetic in components → none; `pricing.ts` is absent | automated + grep |
| AC5 | `cartService.test.ts`: exact method, path and body for add/set/remove. Component tests: add → `POST {itemId, quantity: 1}`; + → `PATCH {quantity: q+1}`; − → `PATCH {quantity: q-1}`, disabled at 1; Remove → `DELETE`; the rendered cart equals each response | automated |
| AC6 | Provider and component tests: a deferred fetch keeps the old quantity visible (no optimistic change); controls are `disabled` and the container has `aria-busy`; a second click during pending records no second fetch call | automated |
| AC7 | Provider tests per code (`CART_CONFLICT`, `MENU_ITEM_UNAVAILABLE`, `MENU_ITEM_NOT_FOUND`, `CART_ITEM_QUANTITY_LIMIT_EXCEEDED`, `CART_ITEM_NOT_FOUND`): the expected message (none for `CART_ITEM_NOT_FOUND`), followed by exactly one `GET /v1/cart`, with no repeat of the mutation | automated |
| AC8 | `CartLine`/`CartList`/`CheckoutReview` tests with an `available: false` line: an "Unavailable" label, increase disabled, checkout link/button disabled with an explanation, Remove enabled | automated |
| AC9 | Code review of `cartStore.tsx` (no reducer computing lines). The existing `dispatch.ts` structural check is unchanged (it has no `cartStore` import) | review + grep |
| AC10 | `orderService.test.ts`: `toCreateOrderRequest` trims values and omits a blank email; the body has only `idempotencyKey` and `customer`. `CheckoutFlow.test.tsx`: a double-click on "Place order" → one `POST` | automated |
| AC11 | `CheckoutFlow.test.tsx`: after 201, the confirmation shows the stub's `orderId`, `placedAt` and lines, and a `GET /v1/cart` follows; with the refreshed cart empty, the confirmation is still shown. `OrderConfirmation.test.tsx` renders from `OrderResponse`. `order.ts` and `orderId.ts` are absent | automated |
| AC12 | `checkoutReducer.test.ts`: the key is set on details → review, kept on `PLACE_ORDER`/`ORDER_FAILED`, and cleared on `EDIT_DETAILS`. `CheckoutFlow.test.tsx`: network failure then "Try again" → both `POST`s carry the same key; edit details → the next `POST` has a different key | automated |
| AC13 | `CheckoutFlow.test.tsx`, one case per failure: network/timeout/503 (after auto-retries are exhausted) → alert + retry; `CART_EMPTY` → refresh → empty notice; `MENU_ITEM_UNAVAILABLE`, `CART_CONFLICT` → refresh + message; 400 `field: "customer.phone"` → details step with the phone error; `IDEMPOTENCY_KEY_REUSED` → a new key on the next attempt | automated |
| AC14 | `OrderConfirmation.test.tsx`: the disclosure text includes "No payment was taken" and not "simulated" | automated |
| AC15 | `grep -rn "fetch(" apps/web/src --include=*.tsx --include=*.ts` → only `src/lib/api/client.ts` (and `src/test/`) | grep |
| AC16 | `client.test.ts`: each `kind`; `ContractError` parsed to `code`/`field`; a non-JSON error body → `http` with `status` only; a schema mismatch and an empty 2xx → `invalid-response`. `userMessages.test.ts`: each §11 row. Component tests assert that the backend `message` string in a stub never appears in the DOM | automated |
| AC17 | `client.test.ts`: a timeout fires (fake timers); `GET` retried twice on network/503, not on 4xx; `POST /v1/cart/items` never retried; order `POST` retried with an identical body | automated |
| AC18 | `config.test.ts`: the browser base is `/api/commerce`; the server base is from `COMMERCE_API_URL`, with the dev default; production + missing → throws. Review of `next.config.ts` (only `/api/commerce/v1/:path*`). `grep -rn NEXT_PUBLIC apps/web` → none. `.env.example` has no secret | automated + review |
| AC19 | `git diff --stat -- apps/commerce-api packages/contracts` → empty; `pnpm turbo run lint` passes (the agent-intents ban is intact) | manual + automated |
| AC20 | Full validation table below; the implementation report lists every deleted or rewritten test with its reason | automated + report |
| AC21 | Manual walk (below), with evidence recorded in the implementation report | manual |

## Pre-existing tests that change

Listed here so nothing disappears silently.

| Test | Change | Why |
| --- | --- | --- |
| `lib/cart/pricing.test.ts` | deleted | module deleted (client pricing, §7 item 3) |
| `lib/checkout/order.test.ts`, `orderId.test.ts` | deleted | modules deleted (ADR-0011 closes) |
| `lib/state/cartStore.test.ts` | replaced by `cartStore.test.tsx` | reducer removed; the Phase 3 rules (merge, 99 cap, no zero) are now the backend's and are covered by commerce-api's cart tests; web tests cover the provider behaviour |
| `lib/state/cartStore.navigation.test.tsx` | rewritten | same journey (cart survives navigation), with a stubbed fetch |
| `lib/menu/menuSource.test.ts` | rewritten | the seam now calls the API |
| `lib/menu/filter.test.ts`, `components/menu/*.test.tsx` | import path only | fixture moved to `src/test/fixtures/menu.ts` |
| `components/cart/*.test.tsx`, `nav/SiteNav.test.tsx` | rewritten setup + new cases | the provider is API-backed; figures come from the response |
| `lib/checkout/checkoutReducer.test.ts` | extended; `ORDER_PLACED` payload type changes | new transitions and the key lifecycle |
| `components/checkout/CheckoutFlow.test.tsx`, `OrderConfirmation.test.tsx`, `OrderSummary.test.tsx`, `CheckoutReview.test.tsx` | rewritten setup + new cases | the order comes from the API |
| `app/error.test.tsx` | updated assertion | static copy replaces `error.message` |

Every other pre-existing test stays unchanged.

## Manual walk (AC21)

Setup, all commands already declared:

```text
pnpm --filter commerce-api db:up
pnpm --filter commerce-api db:migrate
pnpm --filter commerce-api db:seed
pnpm --filter commerce-api dev
pnpm --filter web dev
```

1. Open `/`. The menu renders the seeded items, and `gelato` shows
   "Unavailable".
2. Add Tiramisu twice from the menu (the second time after the first
   completes). The nav shows "Cart (2)".
3. `curl http://localhost:3000/api/commerce/v1/cart` matches the UI.
4. On `/cart`: increase, decrease, and remove a line. Figures match
   `curl`.
5. Reload the page, and the cart persists. Restart commerce-api, and the
   cart still persists.
6. Force an unavailable line with
   `UPDATE menu_items SET available=false …`, then refresh. The line is
   flagged and checkout is blocked. Restore it afterwards.
7. Go to `/checkout`, fill in the details, review, and place the order.
   The confirmation shows a UUID `orderId`, and the cart shows 0.
8. `curl http://127.0.0.1:3001/v1/orders/<id>` returns the same order.
9. Stop commerce-api. `/` shows the friendly error page, and cart actions
   show the friendly alert. Restart it, and "Try again" recovers.
10. The browser console and the web server log contain no customer
    details.

If the browser automation tool connects, steps 1, 2, 4, 6, 7 and 9 are
driven and recorded (with a GIF). If it doesn't, those UI steps are
performed by hand if possible. Anything not performed is reported as not
performed, never as passed.

## Validation commands

Only commands the repository declares.

| Check | Command | Expected when |
| --- | --- | --- |
| Web test (targeted) | `pnpm --filter web test` | each sub-phase |
| Web typecheck (targeted) | `pnpm --filter web typecheck` | each sub-phase |
| Web lint (targeted) | `pnpm --filter web lint` | each sub-phase |
| Type check (all) | `pnpm turbo run typecheck` | 11.5 |
| Lint (all) | `pnpm turbo run lint` | 11.5 |
| Test (all) | `pnpm turbo run test` | 11.5 |
| Build (all) | `pnpm turbo run build` (commerce-api stopped) | 11.2, 11.5 |
| commerce-api DB suite | `pnpm --filter commerce-api test:db` | 11.5 (regression; commerce-api is unchanged) |
| Browser e2e | — | `NOT_CONFIGURED` |
