# Requirements — Phase 11: Next.js → NestJS Commerce API Integration

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-25 (in conversation, "approved", given after the full plan including OD1–OD14 and a recommendation on each; the recommendations are therefore the decisions)
**Risk:** HIGH
**Path:** Full

## Problem

`apps/commerce-api` has owned the menu (Phase 7), the cart (Phase 8) and
order creation (Phase 9), persisted in PostgreSQL since Phase 10. Nothing
calls it. `apps/web` still runs four pieces of scaffolding that
`docs/product/food-ordering-frontend-mvp.md` §7 marks as temporary:

1. `src/lib/fixtures/menu.ts`, a fixture menu read through `getMenu()`.
2. `src/lib/state/cartStore.tsx`, a client-side cart (`useReducer`).
3. `src/lib/cart/pricing.ts`, client-side totals.
4. `src/lib/checkout/order.ts` and `orderId.ts`, which build a simulated order
   with a made-up `ORD-XXXXXX` id. This is the knowing violation of the
   authority model recorded in ADR-0011.

Items 3 and 4 contradict `system-architecture.md` §5: prices, totals and
order identity must come from the backend. Every phase since 7 has recorded
this integration as "still out of scope". The `commerce-api` menu seed is
also a second copy of the frontend fixture, and it stays one until the
fixture is deleted.

## Goal

`apps/web` reads the menu, reads and changes the cart, and places orders only
through `commerce-api`, using one API-client layer. It shows only
backend-confirmed commerce state. The four temporary modules above are
deleted. The user journey (browse → add → adjust → checkout → confirmation)
looks and behaves the same, apart from the loading, pending and error states
that real network calls now need.

## Risk assessment (Full Path)

- **Classification: HIGH.** Three dimensions set it:
  - Scope: cross-cutting across `apps/web`, its build config and the docs.
  - Security: a new browser → server trust boundary (a same-origin proxy),
    and customer personal data now crosses the network.
  - User/business impact: commerce-state authority moves out of the browser,
    and orders become real, persisted records.
- **Blast radius:** every route in `apps/web`. If the API client or the
  proxy is wrong, the menu does not load, cart actions fail, or checkout
  cannot place orders. `apps/commerce-api` and `packages/contracts` are
  **not changed** under the recommended decisions (plan OD1, OD3).
- **Reversibility:** revertible with care. The change is confined to
  `apps/web` and docs. Reverting the phase restores the simulation. Orders
  placed during testing remain in the local dev database, which is harmless.
- **Detection:**
  - Unit and component tests with a stubbed `fetch` cover every error class.
  - The build output must show the three routes as dynamic.
  - A manual click-through runs against a live `commerce-api` + PostgreSQL.

## In scope

- A frontend API-client layer: config, a request function, error
  normalisation, response validation against `@contracts/api-contracts`,
  timeouts and a narrow retry policy.
- Service functions for Menu (`GET /v1/menu`), Cart (`GET /v1/cart`,
  `POST /v1/cart/items`, `PATCH`/`DELETE /v1/cart/items/:itemId`) and Orders
  (`POST /v1/orders`).
- A same-origin proxy (Next.js `rewrites`) from `/api/commerce/v1/*` to
  `commerce-api`, configured by one server-only env var (plan OD1).
- The menu comes from the API through the existing `getMenu()` seam and is
  rendered dynamically (never prerendered at build).
- The cart provider is rebuilt as a holder of the last backend-confirmed
  `CartResponse`, with no local reducer and no client pricing.
- Checkout is wired to `POST /v1/orders` with an idempotency key, and the
  confirmation renders the `OrderResponse`.
- Consistent loading, pending, error and recovery states for menu, cart and
  checkout.
- Deleting the fixture, the client pricing, the simulated order and the
  local order-id modules, and replacing or retargeting the tests that
  covered them.
- An `apps/web/.env.example` and updated docs:
  - a new ADR-0018;
  - an update to ADR-0011 (the violation closes);
  - `food-ordering-frontend-mvp.md` §17;
  - `getting-started.md`;
  - `commerce-api.md` §14.

## Out of scope

- Everything in the brief's exclusion list: Python AI, LangChain, LangGraph,
  OpenAI, RAG, voice, MCP, payments, authentication, advanced authorization,
  notifications, delivery tracking, Redis, Kafka, RabbitMQ, microservices,
  Kubernetes, production deployment, and any major redesign.
- **Any change to `apps/commerce-api` or `packages/contracts`** under the
  recommended decisions. In particular there is no CORS (OD1) and no
  `DELETE /v1/cart` (OD3).
- A new state-management or data-fetching library (OD2), MSW, and
  Playwright or any browser e2e harness (OD14).
- Optimistic cart updates (OD7).
- An idempotency key for `POST /v1/cart/items`. This is
  `system-architecture.md` §8 gap 3, a backend change. It is handled on the
  frontend by never retrying a cart mutation automatically.
- Order history, an order-lookup page, and reading `GET /v1/orders/:orderId`
  after a page reload.
- The chat/command simulation (`simulate.ts`) and the UI-command pipeline,
  which stay unchanged.

## Acceptance criteria

Menu

- [ ] AC1: `getMenu()` calls `GET /v1/menu` and returns the validated
  `categories`. No module in `apps/web/src` (outside `src/test/`) contains
  menu data or imports a menu fixture. `src/lib/fixtures/menu.ts` is deleted.
- [ ] AC2: `pnpm turbo run build` succeeds **with `commerce-api` not
  running**. Its route table shows `/` as dynamic (`ƒ`), not prerendered.
  `/cart` and `/checkout` fetch nothing on the server, because the cart
  loads in the browser, so they may prerender as static shells.
  *(Reworded 2026-09-26 during 11.3, with the human's agreement. The
  original text required all three routes to be dynamic, which assumed they
  would keep awaiting `getMenu()`.)*
- [ ] AC3: If the menu request fails for any reason (network, timeout,
  non-2xx, invalid body), `/` shows the existing error boundary with a
  static, friendly message and a working "Try again". `error.message` is
  never rendered.

Cart

- [ ] AC4: On load, the cart UI (nav count, `CartPanel`, `CartList`) shows a
  loading state, then the result of `GET /v1/cart`. Every figure shown
  (names, unit prices, line subtotals, item count, subtotal) comes from a
  `CartResponse`. `src/lib/cart/pricing.ts` is deleted, and no component
  multiplies or sums prices.
- [ ] AC5: The operations map to the API as follows:
  - "Add to cart" → `POST /v1/cart/items {itemId, quantity: 1}`.
  - Increase → `PATCH /v1/cart/items/:itemId {quantity: q+1}`.
  - Decrease → `PATCH … {quantity: q-1}`. The control is disabled at 1, as
    today.
  - Remove → `DELETE /v1/cart/items/:itemId`.

  After each operation, the displayed cart is exactly the response body.
- [ ] AC6: Nothing changes on screen before the backend confirms. While a
  cart mutation is in flight, every cart-mutating control is disabled and
  marked `aria-busy`. A second click cannot start a second concurrent
  mutation.
- [ ] AC7: The cart handles backend errors as follows:
  - `CART_CONFLICT` (409): the client re-fetches the cart and shows a
    "cart was updated, please try again" message.
  - `MENU_ITEM_UNAVAILABLE`, `MENU_ITEM_NOT_FOUND`,
    `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` (422/404): a specific friendly
    message, and the cart is re-fetched.
  - `CART_ITEM_NOT_FOUND` on remove: treated as already removed, and the
    cart is re-fetched.

  None of these errors is retried automatically.
- [ ] AC8: A cart line with `available: false` is marked "Unavailable" and
  its increase control is disabled. "Proceed to checkout" and "Place order"
  are disabled with an explanation while any line is unavailable.
- [ ] AC9: `src/lib/state/cartStore.tsx` has no reducer that computes cart
  contents. Its only commerce state is the last `CartResponse` (or `null`
  before the first load), plus request status. `dispatch.ts` still does not
  import it.

Checkout / orders

- [ ] AC10: "Place order" sends exactly one
  `POST /v1/orders {idempotencyKey, customer}`:
  - `customer` values are trimmed.
  - `email` is omitted when blank.
  - No items, prices or totals are sent.

  Double-activating the button sends one request.
- [ ] AC11: On 201, the confirmation renders only from the `OrderResponse`
  (`orderId`, `placedAt`, customer, items, `totalCents`), and the cart is
  re-fetched from the backend, which is now empty. The confirmation is not
  lost when the cart empties (the existing guard order is kept).
  `src/lib/checkout/order.ts` and `orderId.ts` are deleted.
- [ ] AC12: The idempotency key is created once per review of a given set of
  customer details. It is reused for every retry of that submission, and
  replaced when the user goes back and edits their details.
- [ ] AC13: On an order failure, the user stays on the review step with a
  friendly message and can retry:
  - network error, timeout or 503: "Try again" resends the **same** key;
  - `CART_EMPTY`, `MENU_ITEM_UNAVAILABLE`, `CART_CONFLICT`: the cart is
    re-fetched and the message explains what changed;
  - `INVALID_PAYLOAD` with a `customer.*` field: the user returns to the
    details step with that field's error shown;
  - `IDEMPOTENCY_KEY_REUSED`: a new key is issued and the user is asked to
    retry.
- [ ] AC14: The confirmation screen still contains a plain-language
  disclosure that **no payment was taken** (ADR-0011 marks this as
  load-bearing). The wording is updated to be true for a real, persisted
  order (OD10).

API client

- [ ] AC15: No React component or page calls `fetch` directly. All HTTP
  goes through `src/lib/api/client.ts`, via the menu, cart and order
  service functions.
- [ ] AC16: The client normalises every failure into one `ApiError` type
  with a `kind` field: `network` | `timeout` | `http` | `invalid-response`.
  For `http` errors it also carries `status`, plus `code` and `field` when
  the body parses as a `ContractError`. Every successful body is validated
  against its `@contracts/api-contracts` schema. User-facing text is chosen
  from `code` or `kind`, never taken from the backend's `message` or
  `error.message`.
- [ ] AC17: Every request has a timeout. Only safe requests are retried
  automatically: `GET` and `POST /v1/orders` with the same key, on
  `network`, `timeout` or 503, with a bounded count and backoff. Cart
  mutations are never retried automatically.
- [ ] AC18: The browser only calls the same-origin path
  `/api/commerce/v1/*`. The `commerce-api` URL comes from `COMMERCE_API_URL`
  (server-only, not `NEXT_PUBLIC_`). An `apps/web/.env.example` documents
  it, and no secret is committed.

Boundaries and regression

- [ ] AC19: `git diff --stat -- apps/commerce-api packages/contracts` is
  empty. `apps/web` still does not import `@contracts/agent-intents`
  (enforced by lint).
- [ ] AC20: `pnpm turbo run typecheck`, `lint`, `test` and `build` all
  pass, and `pnpm --filter commerce-api test:db` still passes. Every
  deleted or rewritten pre-existing test is listed in the implementation
  report with the reason.
- [ ] AC21: A manual walk against a live `commerce-api` (dev) + PostgreSQL
  is recorded:
  - the menu loads;
  - add, increase, decrease and remove work;
  - the cart survives a page reload and an API restart;
  - an order is placed, and the confirmation shows a UUID `orderId`;
  - the cart is empty afterwards;
  - `GET /v1/orders/:id` via curl returns the same order;
  - adding `gelato` shows the unavailable message;
  - stopping `commerce-api` shows friendly errors, and restarting recovers.

## Open questions

See `plan.md` §24 (OD1–OD14). Each has a recommendation. Approving the plan
approves the recommendations unless you say otherwise.
