# Plan — Phase 11: Next.js → NestJS Commerce API Integration

**Approval Status:** APPROVED

Sections 1–26 follow the order the brief asked for. Assumptions, Not doing
and Specialised review follow the template at the end.

### Findings from inspection that correct or sharpen the brief

1. **There is no `DELETE /v1/cart`, deliberately.** The brief asks for
   "Clear cart". Phase 8 (OD5) and ADR-0011 declined a user-facing
   clear-cart. The route returns 404 `ROUTE_NOT_FOUND`
   (`cart.controller.ts`, `commerce-api.md` §12). The only thing that
   empties a cart is a placed order, on the server. Today the frontend's
   only caller of `clearCart()` is the simulated checkout. → **OD3**:
   recommend not adding the route. After an order, the frontend re-fetches
   the cart instead of clearing it.
2. **There is no CORS.** `configure-app.ts` never calls `enableCors`, and
   `commerce-api.md` §14 says so. A browser on `:3000` cannot call `:3001`.
   → **OD1**: recommend a same-origin Next.js rewrite, so commerce-api is
   not changed at all.
3. **The Cart API has no increment operation.** `POST /v1/cart/items` adds
   a delta and is **not idempotent**: a retry double-counts (gap 3).
   `PATCH` is an absolute set and is idempotent. → **OD5**: the stepper
   uses `PATCH q±1`. Only "Add to cart" uses `POST`.
4. **Cart responses are already fully priced.** They carry `name`,
   `unitPriceCents`, `lineSubtotalCents`, `available`, `itemCount` and
   `subtotalCents`. The cart UI therefore no longer needs menu data at all,
   so `/cart` and `/checkout` stop calling `getMenu()`, and `pricing.ts`
   has nothing left to do.
5. **The menu contract is a superset of the fixture type.** The only extra
   field is `categoryId` per item. That was designed on purpose in Phase 7
   (`food-ordering-frontend-mvp.md` §13) so this switch changes one module.
6. **`next build` currently prerenders `/`, `/cart` and `/checkout`**
   (`getting-started.md`). If `getMenu()` fetched during prerender, the
   build would need a running API. The fetch must opt the route into
   dynamic rendering (§9).
7. **The web app has no data-fetching library.** State is React
   `useReducer` + context (`uiStore`, `cartStore`). → **OD2**: recommend
   staying dependency-free.
8. **Customer-detail rules already match.** The web validators
   (`validation.ts`) and `customerDetailsSchema` enforce the same D4 rules.
   The API additionally requires trimmed values and an omitted (not `""`)
   email, so request building must trim and omit (§5).
9. **ADR-0011's disclosure is load-bearing.** It says the "simulated order"
   notice "must survive any future redesign". Once the order is real,
   "simulated" becomes false, but "no payment was taken" stays true.
   → **OD10**.

---

## 1. Objective

Make `commerce-api` the only source of menu, cart, price and order state
for `apps/web`, through one API-client layer. The frontend is left owning
only UI, navigation, form and presentation state. The four temporary
modules in `food-ordering-frontend-mvp.md` §7 are deleted, which closes the
ADR-0011 violation. The user-facing journey is kept.

```text
React UI ──► services (menu/cart/order) ──► api client ──► /api/commerce/v1/* (Next rewrite)
                                                               │
                                                               ▼
                                             commerce-api /v1/* ──► domain ──► repository ──► PostgreSQL
Server component (menu) ──► getMenu() ──► api client ──► COMMERCE_API_URL/v1/menu (direct, server-side)
```

## 2. Current frontend/backend boundary [EXISTING, verified by reading]

| Concern | Today in `apps/web` | Backend equivalent (unused) |
| --- | --- | --- |
| Menu | `lib/fixtures/menu.ts` via `lib/menu/menuSource.ts#getMenu()` (async seam, awaited in `app/page.tsx`, `cart/page.tsx`, `checkout/page.tsx`) | `GET /v1/menu` → `MenuResponse` |
| Cart | `lib/state/cartStore.tsx`: `useReducer` over `{itemId, quantity}[]`, provider in `app/layout.tsx`, consumed by `SiteNav`, `CartAnnouncer`, `CartPanel`, `CartList`, `CartLine`, `MenuItemCard`, `CheckoutFlow` | `/v1/cart` routes → `CartResponse` |
| Pricing | `lib/cart/pricing.ts` (line and subtotal from fixture prices) | computed server-side on every cart read |
| Checkout | `checkoutReducer` (details → review → submitting → confirmed); `order.ts` builds a `SimulatedOrder`; `orderId.ts` mints `ORD-XXXXXX`; `clearCart()` on success | `POST /v1/orders` (idempotent, snapshot, empties the cart in one transaction) |
| UI state | `lib/state/uiStore.tsx` (category, search, highlight, detail, cart-panel open, command log) | none (stays frontend) |
| Transport | none; no `fetch` anywhere in `apps/web` | no CORS; served on `127.0.0.1:3001` under `/v1` |

## 3. Menu integration strategy

- **Keep the seam.** `getMenu()` in `lib/menu/menuSource.ts` stays the only
  entry point (the Phase 2 AC6 rule). Its body becomes
  `menuService.fetchMenu()`, which returns `MenuResponse.categories`.
  `findMenuItemIn` is kept.
- `app/page.tsx` stays an async Server Component and still passes
  `categories` down as a prop. `loading.tsx` and `error.tsx` keep covering
  the await.
- The fetch runs **server-side**, directly against `COMMERCE_API_URL`,
  with `cache: "no-store"` (OD4). This makes `/` dynamic, so the build
  never needs the API.
- `/cart` and `/checkout` stop calling `getMenu()` (finding 4). Their
  `categories` props are removed.
- Types: `MenuItem` and `MenuCategory` come from `@contracts/api-contracts`
  (type-only imports). `filter.ts`, `MenuList`, `MenuItemCard`,
  `CategoryFilter` and `ItemDetailPanel` change only their import line.
- Delete `lib/fixtures/menu.ts`. Its data moves, with `categoryId` added,
  to a test-only `src/test/fixtures/menu.ts` used by component tests. This
  also removes the second menu copy recorded in Phase 7: `commerce-api`'s
  `menu.seed.ts` becomes the only non-test copy.
- `app/error.tsx` shows a static message ("We couldn't load the menu right
  now.") instead of `error.message` (AC3).

## 4. Cart integration strategy

- `CartProvider` stays in `app/layout.tsx`, so the cart survives
  navigation (ADR-0010). Its internals are replaced. It holds:
  - `cart: CartResponse | null` — the last backend-confirmed body. It is
    never edited locally.
  - `status: "loading" | "ready" | "error"` — the initial or refresh load.
  - `pending: { op, itemId } | null` — the one in-flight mutation.
  - `error: ApiError | null` — the last failure, dismissible.
- It loads with `GET /v1/cart` on mount (client-side, through the proxy).
- The `useCart()` API is reshaped to:

  ```text
  { cart, status, pending, error, itemCount,
    addItem(itemId), setQuantity(itemId, q), removeItem(itemId),
    refresh(), dismissError() }
  ```

  `decrementItem` and `clearCart` are removed. Components call
  `setQuantity(id, q±1)`.
- Every mutation works the same way:
  1. Set `pending`.
  2. Call the service.
  3. On success, replace `cart` with the response body.
  4. On failure, set `error`, and `refresh()` for the codes in §11.
  5. Clear `pending`.
- A mutation is ignored while another is pending (OD6). Controls are
  disabled, and the guard is also in the provider, so a fast double-click
  is a no-op (the same pattern `CheckoutFlow.handlePlaceOrder` uses).
- **Clear cart (OD3).** There is no route and no function. After an order,
  `refresh()` shows the server-emptied cart.
- Component changes:
  - `CartList` renders `cart.items`, `CartTotal(cart.subtotalCents)` and
    the unavailable notice (AC8).
  - `CartLine` gets a `CartLine` (contract type) and uses
    `line.lineSubtotalCents`. Its "just changed" highlight stays and now
    fires on confirmed changes.
  - `CartPanel` shows `cart.itemCount` and `cart.subtotalCents`.
  - `SiteNav` shows "Cart (n)" when ready and "Cart" while loading or on
    error.
  - `QuantityStepper` gains a `disabled` prop.
  - `MenuItemCard` disables "Add to cart" while pending and shows
    "Adding…" on the item being added.
- `CartAnnouncer` announces item-count changes only after the first
  successful load, so the initial null → n does not announce.

## 5. Order integration strategy

- The `checkoutReducer` steps stay: details → review → submitting →
  confirmed, plus a new transition, submitting → review, carrying a
  `submitError`.
- New or changed actions:
  - `ORDER_PLACED { order: OrderResponse }`.
  - `ORDER_FAILED { error }`.
  - `SUBMIT_DETAILS` now also sets `idempotencyKey` when none is set.
  - `EDIT_DETAILS` clears it (OD12).
  - `RETURN_TO_DETAILS { fieldErrors }` is used for a server-side
    `customer.*` validation error.
- State gains `idempotencyKey: string | null`, `submitError: ApiError | null`
  and `order: OrderResponse | null`.
- `handlePlaceOrder` keeps its `state.step !== "review"` guard. It then:
  1. dispatches `PLACE_ORDER`;
  2. calls `orderService.placeOrder({ idempotencyKey, customer })`, where
     `toCreateOrderRequest(details, key)` trims the values and omits a
     blank email;
  3. on success, dispatches `ORDER_PLACED`, calls `cart.refresh()` and
     announces "Order placed. Your order number is …";
  4. on failure, dispatches `ORDER_FAILED` and follows §11.
- `CheckoutReview` renders `cart.items` and `cart.subtotalCents` from
  `useCart()`, which are live server prices. It shows `submitError` in a
  `role="alert"` region, and the button reads "Placing order…" while
  submitting. The step is now visibly real, where Phase 4 D9 had zero
  latency.
- `OrderConfirmation` takes `OrderResponse`. `placedAt` is parsed from ISO,
  and the `orderId` UUID is shown as-is. The disclosure is reworded
  (OD10).
- `OrderSummary`'s line prop becomes a minimal structural type
  `{ itemId, name, quantity, lineSubtotalCents }`, which both `CartLine`
  and `OrderLine` satisfy.
- Delete `lib/checkout/order.ts`, `orderId.ts` and their tests. Remove
  `SimulatedOrder` and `SimulatedOrderLine` from `types.ts`. The form's
  `CustomerDetails` type (with `email: string`) stays. It is a form-state
  type, distinct from the contract's.
- The guard order in `CheckoutFlow` (confirmed first, then empty cart) is
  kept. A new `cart.status === "loading"` state shows a loading notice
  instead of `EmptyCheckoutNotice`, so a hard reload of `/checkout` doesn't
  flash "empty".

## 6. API-client architecture

```text
src/lib/api/
  config.ts        — resolves base URL: server → COMMERCE_API_URL (default http://127.0.0.1:3001 outside production);
                     browser → "/api/commerce". Throws on a missing URL in production.
  errors.ts        — ApiError (kind, status?, code?, field?, requestId?); toApiError(); isRetryable()
  client.ts        — request<T>({ method, path, body?, schema, timeoutMs?, retry?, signal? }): Promise<T>
  userMessages.ts  — userMessageFor(error, context): string  (code/kind → friendly copy; generic fallback)
src/lib/menu/menuSource.ts     — getMenu() → client (existing seam)
src/lib/cart/cartService.ts    — getCart, addCartItem, setCartItemQuantity, removeCartItem
src/lib/checkout/orderService.ts — placeOrder, toCreateOrderRequest
src/lib/checkout/idempotencyKey.ts — createIdempotencyKey(random = crypto.randomUUID)
```

What `request()` does:

- Sends a JSON body only for `POST` and `PATCH`, with
  `Content-Type: application/json`. `GET` and `DELETE` carry no body and
  no content-type, which keeps `JsonContentTypeGuardMiddleware` happy.
- Sets `Accept: application/json`.
- Applies a timeout with `AbortSignal.timeout`, combined with the caller's
  signal.
- On 2xx: parses the body with `schema.safeParse`. A failure becomes
  `invalid-response`, as does an empty or unparseable body.
- On non-2xx: parses the body with `contractErrorSchema.safeParse` and
  builds an `http` error with `code` and `field` when that works. Otherwise
  it keeps `status` only.
- Reads `X-Request-Id` into `requestId`, for debugging only. It is never
  shown to the user.
- A `TypeError` or other fetch rejection becomes `network`. An abort from
  the timeout becomes `timeout`.
- Retries only when `retry` is passed (§13).
- Never logs request bodies, because customer details are personal data.

Components never import `client.ts`. They import services, or `useCart()`
(AC15).

## 7. Server-state strategy [OD2 — PROPOSED: no new library]

Server state has exactly two shapes here:

- **The menu:** read-only, fetched per request on the server and passed
  as props. React Server Components already are the "query layer" for it.
- **One cart:** every mutation returns the whole resource.

That pattern needs no key-based cache, no deduplication and no background
refetch. `CartProvider` becomes a thin **server-state holder**. It is not
an independent store: it only ever stores the last API response, and no
code path derives or edits cart contents locally. That satisfies the
brief's "Backend → API/query layer → React UI" and ADR-0005's
refetch-after-mutation, where the mutation response *is* the refetch.

Alternative: TanStack Query, a new dependency. It is justified once there
are many independently cached resources, pagination, background
revalidation or multi-device freshness. None exist yet. Adding it later is
a contained change behind `useCart()`.

## 8. Local-state strategy

| State | Owner | Notes |
| --- | --- | --- |
| Selected category, search, highlight, detail item, cart-panel open, command log | `uiStore` (unchanged) | UI commands keep reaching only this store |
| Checkout step, form fields, field errors, submit attempt, idempotency key, submit error, confirmed order snapshot | `checkoutReducer` (local to `CheckoutFlow`) | The confirmed `OrderResponse` is a backend response kept for display, not derived |
| Cart request status, pending op, cart error | `CartProvider` | request metadata, not commerce data |
| Line "just changed" highlight, announcer text | component state | presentation |
| Menu, cart contents, prices, totals, order identity and status | **backend only** | never computed client-side |

## 9. Caching strategy

- **Menu:** `fetch(..., { cache: "no-store" })` in the Server Component
  (OD4). The menu is fetched on every request to `/`. This is correct by
  construction: an availability or price change shows on the next load.
  It is also cheap at this scale (6 items, a local API). The alternative,
  `next: { revalidate: N }`, would reintroduce build-time prerendering,
  and with it a build-time API dependency and stale availability.
- **Cart:** there is no HTTP cache. The client uses `cache: "no-store"`.
  The only client copy is the `CartProvider` value, replaced wholesale by
  each response, and it lives for the page session. A full reload
  re-fetches.
- **Orders:** not cached. The confirmation keeps the one `OrderResponse` in
  checkout state.

## 10. Cache invalidation

| Event | Action |
| --- | --- |
| Any successful cart mutation | replace `cart` with the response body (no extra `GET`) |
| Cart mutation fails with `CART_CONFLICT`, `MENU_ITEM_UNAVAILABLE`, `MENU_ITEM_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` | `refresh()` (`GET /v1/cart`) |
| Cart mutation fails with network, timeout or 5xx | `refresh()` once; the server state is unknown, so re-read it rather than guess |
| Order placed (201) | `refresh()` → server-emptied cart |
| Order fails with `CART_EMPTY`, `MENU_ITEM_UNAVAILABLE`, `CART_CONFLICT` | `refresh()` |
| User presses "Try again" on a cart load error | `refresh()` |
| Menu | no client invalidation; every navigation to `/` re-renders server-side. `router.refresh()` is **not** added |

## 11. Error handling

One normalised `ApiError`. Copy is chosen from `code` first, then `kind`,
then a generic fallback. Backend `message` text is never displayed (AC16).

| Case | Detected as | User sees | Recovery |
| --- | --- | --- | --- |
| Network down / API stopped | `kind: network` | "We can't reach the restaurant right now. Check your connection and try again." | Try again; GETs auto-retry first |
| Timeout | `kind: timeout` | same as network | same |
| Server error | `http` 500 `INTERNAL_ERROR`, or any 5xx | "Something went wrong on our side. Please try again." | Try again |
| DB unavailable | `http` 503 `SERVICE_UNAVAILABLE` | same as server error | auto-retry (GET, order), then Try again |
| Validation (cart) | 400 `INVALID_PAYLOAD` | "That change couldn't be made." (a client bug; no raw details) | `refresh()` |
| Validation (order) | 400 `INVALID_PAYLOAD`, `field: customer.x` | a field error on the details step, in the same copy as the local validators | edit details |
| Product unavailable | 422 `MENU_ITEM_UNAVAILABLE` | "Sorry, that item is currently unavailable." / at checkout: "An item in your cart is no longer available. Please review your cart." | `refresh()`; checkout blocked by AC8 |
| Unknown item | 404 `MENU_ITEM_NOT_FOUND` | "That item is no longer on the menu." | `refresh()` |
| Quantity limit | 422 `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` | "You've reached the maximum quantity for this item." | `refresh()` |
| Line already gone | 404 `CART_ITEM_NOT_FOUND` | no error; treated as removed | `refresh()` |
| Cart conflict | 409 `CART_CONFLICT` | "Your cart was updated. Please check it and try again." | `refresh()` |
| Empty cart at order | 422 `CART_EMPTY` | "Your cart is empty." → `EmptyCheckoutNotice` after the refresh | `refresh()` |
| Key reused | 409 `IDEMPOTENCY_KEY_REUSED` | "Please review your details and place the order again." | new key |
| Empty / invalid 2xx body | `kind: invalid-response` | generic server-error copy | Try again |
| Menu load failure (server) | thrown from `getMenu()` | `app/error.tsx` static copy + "Try again" (`reset()`) | reset |

Errors render in `role="alert"`:

- Cart errors show in a new `CartErrorMessage` component, used by
  `CartPanel` and `CartList`, with a Dismiss button.
- Order errors show inside `CheckoutReview`.

## 12. Loading states

| Surface | State | Presentation |
| --- | --- | --- |
| Menu (`/`) | server fetch pending | existing `app/loading.tsx` ("Loading the menu…", `aria-busy`) |
| Menu | failed | `app/error.tsx` (static copy, Try again) |
| Cart (nav) | loading / error | "Cart" without a count |
| Cart (`CartPanel`, `CartList`) | loading | "Loading your cart…" (`role="status"`) |
| Cart | load error | `CartErrorMessage` + "Try again" (`refresh`) |
| Cart mutation | pending | all cart-mutating controls `disabled`; the container has `aria-busy="true"`; the clicked "Add to cart" reads "Adding…" |
| Checkout | cart loading | "Loading your cart…" instead of the empty notice |
| Checkout submission | `submitting` | "Place order" and "Edit details" disabled; button reads "Placing order…"; `aria-busy` on the review region |
| Order failure | back on `review` with `submitError` | alert + enabled "Place order" (same key) |
| Confirmation | done | focus moves to the heading (existing) |

No spinners or skeleton redesign. The existing text-and-disabled idiom is
kept.

## 13. Retry strategy [OD9 — PROPOSED]

| Request | Auto-retry? | Condition | Policy |
| --- | --- | --- | --- |
| `GET /v1/menu` (server) | yes | `network`, `timeout`, 503 | 2 retries, 250 ms then 750 ms |
| `GET /v1/cart` | yes | same | same |
| `POST /v1/orders` | yes | same | same, **same idempotency key**; safe by the Phase 9 replay guarantee |
| `POST /v1/cart/items` | **never** | — | not idempotent (gap 3); a retry double-counts |
| `PATCH`, `DELETE /v1/cart/items/:id` | never automatically | — | failure → `refresh()` + message; the user retries manually |
| any 4xx | never | — | a business answer, not a transient fault |

Timeouts: 8 s default and 15 s for `POST /v1/orders`. Both are named
constants in `client.ts`. The backoff delay is injectable, so tests don't
sleep.

## 14. Environment configuration

- There is one variable, **`COMMERCE_API_URL`**. It is server-only and is
  never `NEXT_PUBLIC_`.
- Read by:
  - `next.config.ts`, for the rewrite destination;
  - `lib/api/config.ts`, for server-side fetches.
- Values by environment:

| Environment | Value | Source |
| --- | --- | --- |
| Development | `http://127.0.0.1:3001` (commerce-api `.env.example` default) | `apps/web/.env.local` (gitignored) or the default when unset and `NODE_ENV !== "production"` |
| Test (vitest) | not read; `fetch` is stubbed and `config.ts` is injected or overridden | — |
| Production | **placeholder only**: must be set explicitly, and `config.ts` throws a clear error if it is missing | deployment is out of scope |

- The browser base path is the constant `/api/commerce`, and
  `next.config.ts` rewrites `/api/commerce/v1/:path*` →
  `${COMMERCE_API_URL}/v1/:path*`. Only `/v1` is proxied; `/health` is not.
- New `apps/web/.env.example` documents the variable. `.env*` files are
  already gitignored (root `.gitignore` lines 27–29). No secrets are
  involved.
- **Caveat:** `rewrites()` is evaluated when `next build` runs (and at
  `next dev` start), so the production URL must be present at build time.
  This is recorded in the docs.

## 15. Contract integration

- `apps/web` adds two workspace dependencies:
  - `@contracts/api-contracts`, for the menu, cart and order schemas and
    types;
  - `@contracts/common`, for `contractErrorSchema`, `ContractError` and
    `MAX_QUANTITY`, which replaces `pricing.ts`'s duplicate
    `MAX_LINE_QUANTITY = 99`.
- Both expose raw TypeScript source (`"exports": "./src/index.ts"`), the
  same way `@contracts/ui-commands`, already consumed by `apps/web`, does.
- Responses are validated with the contract schemas: `menuResponseSchema`,
  `cartResponseSchema` and `orderResponseSchema` (OD8).
- The order request is type-checked as `CreateOrderRequest`, and the
  service also runs `createOrderRequestSchema.safeParse` before sending.
  That turns a trimming bug into a local error rather than a 400.
- **No contract changes.** The error-code strings used by `userMessages.ts`
  are commerce-api codes (documented in `commerce-api.md` §6). They are not
  exported from a contracts package, because `api-error-codes.ts` lives in
  commerce-api. They are declared once in `userMessages.ts` as a local
  string union.
- The `apps/web` → `@contracts/agent-intents` ESLint ban stays and is
  untouched.

## 16. TypeScript types

- From `@contracts/api-contracts`:
  - `MenuItem`, `MenuCategory`, `MenuResponse`;
  - `CartResponse`, `CartLine`;
  - `CreateOrderRequest`, `OrderResponse`, `OrderLine`;
  - `CustomerDetails`, imported as `ApiCustomerDetails` to avoid a clash
    with the form type.
- From `@contracts/common`: `ContractError`.
- New, in `apps/web`:
  - `ApiError` (a class with
    `kind: "network" | "timeout" | "http" | "invalid-response"`,
    `status?`, `code?`, `field?`, `requestId?`);
  - `RequestOptions<T>` (with `schema: { safeParse(v): … }`, so
    `client.ts` doesn't need a direct `zod` import);
  - `CartStatus`, `PendingCartOp`;
  - `OrderSummaryLine`.
- Removed: the fixture's `MenuItem` and `MenuCategory`, `cartStore`'s
  `CartLine`, `CartState` and `CartAction`, and `SimulatedOrder` and
  `SimulatedOrderLine`.
- `strict`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax` from
  `tsconfig.base.json` stay in force. `apps/web` overrides
  `verbatimModuleSyntax: false`, which is unchanged.

## 17. Testing strategy

- **Tooling:** the existing Vitest + Testing Library + jsdom (ADR-0008).
  No MSW. A tiny `src/test/fetchStub.ts` helper queues canned `Response`s
  and records calls, installed with `vi.stubGlobal("fetch", …)`.
- **Unit tests:**
  - `client.ts`: success, schema mismatch, empty body, `ContractError`
    parsing, non-JSON error body, network, timeout, retry eligibility and
    counts, no body on GET/DELETE.
  - `errors.ts`, `userMessages.ts`: every row of §11.
  - `config.ts`: server vs. browser base URL, the production missing-URL
    error.
  - Services: exact method, path and body per operation; trimming and
    email omission.
  - `idempotencyKey.ts`.
  - `checkoutReducer`: new transitions, key lifecycle.
- **Provider tests** (`cartStore.test.tsx`, replacing the reducer tests):
  - initial load and loading state;
  - each mutation replaces state with the response;
  - pending blocks a second mutation;
  - conflict and unavailable paths trigger `refresh`;
  - network failure triggers `refresh`;
  - no automatic retry of `POST`.
- **Component tests:** updated to render inside a `CartProvider` with a
  stubbed fetch, or with a test `CartProvider` value. Coverage:
  - `CartList`, `CartLine`, `CartPanel`, `SiteNav`, `CartAnnouncer`
    (no announcement on the initial load);
  - `MenuItemCard` "Adding…";
  - `CheckoutFlow`: success, double-click sends one request, each failure
    in AC13, retry reuses the key, editing details changes the key,
    confirmation survives the cart emptying;
  - `OrderConfirmation` from `OrderResponse`, with the disclosure.
- **Menu:** `menuSource.test.ts` is rewritten to stub fetch (success,
  failure → throws, invalid body → throws). `filter.test.ts` and the menu
  component tests switch to `src/test/fixtures/menu.ts`.
- **Build check:** `pnpm turbo run build` with commerce-api down (AC2),
  inspecting the route table.
- **Manual integration** (AC21): both apps running live. Use the browser
  automation tool if it connects; this has been a recorded gap since
  Phase 4. Otherwise use curl through the proxy plus the recorded manual
  steps, and report the gap honestly.
- **Not added:** a browser e2e harness (OD14), and contract tests against a
  live API. The schemas are shared source, and commerce-api's own
  `*.contract-compat.test.ts` and e2e suites already hold the producer
  side.

## 18. Files to create

| File | Purpose |
| --- | --- |
| `apps/web/.env.example` | documents `COMMERCE_API_URL` |
| `apps/web/src/lib/api/config.ts` (+ `.test.ts`) | base-URL resolution |
| `apps/web/src/lib/api/errors.ts` (+ `.test.ts`) | `ApiError`, normalisation, retryability |
| `apps/web/src/lib/api/client.ts` (+ `.test.ts`) | the single request function |
| `apps/web/src/lib/api/userMessages.ts` (+ `.test.ts`) | code/kind → friendly copy |
| `apps/web/src/lib/cart/cartService.ts` (+ `.test.ts`) | cart operations |
| `apps/web/src/lib/checkout/orderService.ts` (+ `.test.ts`) | `placeOrder`, `toCreateOrderRequest` |
| `apps/web/src/lib/checkout/idempotencyKey.ts` (+ `.test.ts`) | key creation (injectable) |
| `apps/web/src/components/cart/CartErrorMessage.tsx` (+ `.test.tsx`, `.module.css`) | shared cart error/Try again UI |
| `apps/web/src/lib/state/cartStore.test.tsx` | provider tests (replaces `cartStore.test.ts`) |
| `apps/web/src/test/fixtures/menu.ts` | test-only menu data (moved from `lib/fixtures`) |
| `apps/web/src/test/fetchStub.ts` | test helper |
| `docs/features/phase-11-web-commerce-integration/{requirements,plan,test-plan}.md` | this plan |

## 19. Files to modify

| File | Change |
| --- | --- |
| `apps/web/package.json` | add `@contracts/api-contracts`, `@contracts/common` (`workspace:*`) |
| `apps/web/next.config.ts` | `rewrites()` for `/api/commerce/v1/:path*` |
| `apps/web/src/lib/menu/menuSource.ts` | `getMenu()` → API; types from contracts |
| `apps/web/src/lib/menu/filter.ts` (+ test) | type import only; test uses the test fixture |
| `apps/web/src/lib/state/cartStore.tsx` | rewritten as the server-state holder (§4) |
| `apps/web/src/lib/checkout/checkoutReducer.ts`, `types.ts` (+ reducer test) | new actions and state; remove the simulated types |
| `apps/web/src/app/page.tsx` | type import (unchanged behaviour) |
| `apps/web/src/app/cart/page.tsx`, `checkout/page.tsx` | drop `getMenu()` and the `categories` prop |
| `apps/web/src/app/error.tsx` (+ test if present) | static copy, no `error.message` |
| `apps/web/src/components/menu/{MenuList,MenuItemCard,CategoryFilter,ItemDetailPanel}.tsx` (+ tests) | contract types; `MenuItemCard` pending/add |
| `apps/web/src/components/cart/{CartPanel,CartList,CartLine,QuantityStepper,CartAnnouncer}.tsx` (+ tests) | render `CartResponse`; pending/disabled/unavailable |
| `apps/web/src/components/nav/SiteNav.tsx` (+ test) | loading-aware count |
| `apps/web/src/components/checkout/{CheckoutFlow,CheckoutReview,OrderConfirmation,OrderSummary}.tsx` (+ tests) | API wiring, errors, `OrderResponse` |
| `apps/web/src/lib/state/cartStore.navigation.test.tsx` | stubbed fetch |
| `docs/architecture/architecture-decisions.md` | new ADR-0018; ADR-0011 "closed" update; ADR-0005 → Accepted (in use) |
| `docs/architecture/system-architecture.md` | §2/§8 note: web → API via same-origin proxy |
| `docs/api/commerce-api.md` | §14: CORS still not configured; `apps/web` calls via its proxy |
| `docs/product/food-ordering-frontend-mvp.md` | §17 Phase 11 additions; §7 items 1–4 resolved |
| `docs/development/getting-started.md` | current state, env var, running both apps, temporary-code list, test counts |

**Deleted:**

- `apps/web/src/lib/fixtures/menu.ts`
- `src/lib/cart/pricing.ts` and `pricing.test.ts`
- `src/lib/checkout/order.ts` and `order.test.ts`
- `src/lib/checkout/orderId.ts` and `orderId.test.ts`
- `src/lib/state/cartStore.test.ts`

**Not touched:** `apps/commerce-api/**`, `packages/contracts/**`,
`eslint.config.mjs`, `uiStore.tsx`, `lib/commands/*`, `components/chat/*`,
`components/dev/*`.

## 20. Dependencies required

| Dependency | Where | Kind |
| --- | --- | --- |
| `@contracts/api-contracts` | `apps/web` | workspace (no download) |
| `@contracts/common` | `apps/web` | workspace (no download) |

No external packages. There is no TanStack Query (OD2), no MSW or
Playwright (OD14) and no `zod` direct dependency: schemas are called
through the contract packages, which already depend on it. Install with
`pnpm --filter web add @contracts/api-contracts@workspace:* @contracts/common@workspace:*`
(the same mechanism Phase 10 used).

## 21. Acceptance criteria

AC1–AC21 are in `requirements.md`.

## 22. Validation commands

Only commands the repository declares (`package.json`, `getting-started.md`).

| Check | Command | When |
| --- | --- | --- |
| Web tests (targeted) | `pnpm --filter web test` | every sub-phase |
| Web typecheck (targeted) | `pnpm --filter web typecheck` | every sub-phase |
| Web lint (targeted) | `pnpm --filter web lint` | every sub-phase |
| Type check (all) | `pnpm turbo run typecheck` | 11.5 |
| Lint (all) | `pnpm turbo run lint` | 11.5 |
| Test (all) | `pnpm turbo run test` | 11.5 |
| Build (all) | `pnpm turbo run build` (commerce-api **not** running) | 11.2 and 11.5 |
| commerce-api DB suite (regression) | `pnpm --filter commerce-api test:db` (after `db:up`) | 11.5 |
| Live run | `pnpm --filter commerce-api db:up` / `db:migrate` / `db:seed`, `pnpm --filter commerce-api dev`, `pnpm --filter web dev` | 11.5 manual walk |

Browser e2e is `NOT_CONFIGURED`, and none is added.

## 23. Risks

| Risk | Impact | How it is handled |
| --- | --- | --- |
| Build starts needing a running API (prerendered `fetch`) | CI/local build breaks | `cache: "no-store"` makes the routes dynamic; AC2 builds with the API down and checks `ƒ` |
| Rapid clicks produce concurrent writes → `CART_CONFLICT`, or a lost `PATCH` | wrong quantity or confusing errors | one in-flight mutation, guarded in the provider and via disabled controls (OD6); conflict → refresh |
| Retried `POST /v1/cart/items` double-adds | incorrect cart | never auto-retry cart mutations (§13) |
| Duplicate order from a double-click or retry | two orders | the reducer and handler guard (existing) plus a stable idempotency key across retries (OD12) and a server replay |
| Same key reused after editing details | 409 `IDEMPOTENCY_KEY_REUSED` | key reset on `EDIT_DETAILS`; 409 → new key + message |
| A strict response schema rejects a future additive backend field | every call fails `invalid-response` | same-repo contracts change together; the risk is accepted, and a failure is loud rather than silent (OD8) |
| Rewrite URL baked in at build | production points at the wrong API | documented; production deployment out of scope; `config.ts` fails loudly |
| Backend or internal messages leak to users | information exposure | copy chosen by code/kind only; `error.tsx` no longer prints `error.message`; covered by tests |
| Customer personal data logged in the browser | privacy | the client never logs bodies; errors never echo input |
| Large test churn hides a lost assertion | regression | every deleted or rewritten test listed with a reason (AC20); behaviour tests for journeys are ported, not dropped |
| Cart flash of "empty" before load | confusing UX, a wrong empty-checkout notice | explicit `loading` status distinct from an empty cart |
| Unavailable item in cart blocks the order late | friction | flagged in the cart and checkout disabled up front (AC8) |
| Hydration mismatch (cart known only client-side) | React warnings | the cart is fetched only in `useEffect`; server render always shows the loading state |

## 24. Open decisions (each with a recommendation)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| OD1 | Browser → API transport | **Next.js `rewrites` same-origin proxy** (`/api/commerce/v1/*`); no commerce-api change; server-only URL | `app.enableCors({ origin: allowlist })` in commerce-api + a new env var + tests + `NEXT_PUBLIC_COMMERCE_API_URL` (a backend change, a wider surface) |
| OD2 | Server-state management | **No new library**; `CartProvider` holds the last `CartResponse`; RSC for the menu | TanStack Query (new dependency; revisit when resources multiply) |
| OD3 | "Clear cart" | **Don't add.** Keep Phase 8 OD5 and ADR-0011; after an order, `refresh()`; remove `clearCart` from web | add `DELETE /v1/cart` + contract + tests + a UI button (reverses two recorded decisions; backend scope) |
| OD4 | Menu caching | **`no-store`, dynamic per request** | `revalidate: N` (build-time API dependency, stale availability) |
| OD5 | Stepper semantics | **`PATCH` absolute `q±1`**; `POST` only for "Add to cart" | `POST {quantity: 1}` for increment (non-idempotent) |
| OD6 | Concurrent cart mutations | **One in flight; all cart controls disabled while pending** | a client-side queue that recomputes targets (more code, same result) |
| OD7 | Optimistic updates | **None.** Show pending, then the confirmed response | optimistic with rollback (can display prices or availability the backend rejects) |
| OD8 | Response validation | **Validate every body with the contract schema** | typed cast (no runtime check at a network boundary) |
| OD9 | Retry policy | **As §13**: GET and order POST only, on network/timeout/503, 2 retries | no auto-retry at all (simpler, worse on blips) |
| OD10 | Confirmation disclosure (ADR-0011) | **Reword**: "Your order has been recorded. No payment was taken — this demo does not send orders to a restaurant." | keep "simulated" (now false) or remove (violates ADR-0011) |
| OD11 | Unavailable cart lines | **Flag the line; disable its increase and checkout; Remove still works** | leave it to the backend's 422 at placement |
| OD12 | Idempotency-key lifecycle | **Created on details → review; reused for every retry; reset on Edit details; new key after `IDEMPOTENCY_KEY_REUSED`** | a new key per click (defeats replay on retry) |
| OD13 | Menu fixture | **Delete from `src/lib`; move to `src/test/fixtures` for tests** | keep as an offline fallback (retains a second menu copy and a hidden authority) |
| OD14 | Browser e2e | **Not added**; manual walk + the browser tool if it connects | add Playwright (new dependency and a CI story; separate phase) |

## 25. Implementation order

Five sub-phases. Each ends green on the targeted web checks.

### 11.1 — API-client foundation (no behaviour change)
- [ ] Add the workspace dependencies; `next.config.ts` rewrites; `.env.example`.
- [ ] `lib/api/{config,errors,client,userMessages}.ts` + tests; `src/test/fetchStub.ts`.
- [ ] `cartService.ts`, `orderService.ts`, `idempotencyKey.ts` + tests (not yet used).
- **Done when:** the new unit tests pass; no component changed; `pnpm --filter web test/typecheck/lint` pass.

### 11.2 — Menu from the API
- [ ] `getMenu()` → client (`no-store`); contract types across the menu components and `filter.ts`.
- [ ] Move the fixture to `src/test/fixtures/menu.ts`; delete `lib/fixtures/menu.ts`; update the tests.
- [ ] `app/error.tsx` static copy.
- **Done when:** AC1–AC3 pass (build run with the API down, route table recorded).

### 11.3 — Cart from the API
- [ ] Rewrite `cartStore.tsx` (§4); `CartErrorMessage`; update `CartPanel`, `CartList`, `CartLine`, `QuantityStepper`, `CartAnnouncer`, `SiteNav`, `MenuItemCard`.
- [ ] `/cart` page drops `getMenu()`; delete `pricing.ts` + test; replace `cartStore.test.ts` with provider tests; update the navigation test.
- [ ] Interim: `CheckoutFlow` reads `cart.items` and `subtotalCents` for review, still using the simulated order, so the tree compiles. This interim state is replaced in 11.4.
- **Done when:** AC4–AC9 pass.

### 11.4 — Checkout on the Order API
- [ ] Reducer and type changes; `CheckoutFlow`, `CheckoutReview`, `OrderConfirmation`, `OrderSummary`; `/checkout` page drops `getMenu()`.
- [ ] Delete `order.ts`, `orderId.ts` + tests.
- **Done when:** AC10–AC14 pass.

### 11.5 — Docs, live verification, full validation
- [ ] ADR-0018, ADR-0011/0005 updates, and the other docs in §19.
- [ ] Full validation table (§22); `test:db` regression; AC19 diff check; grep checks for AC1, AC4 and AC15.
- [ ] Manual walk (AC21), with evidence recorded.
- **Done when:** AC15–AC21 pass; ready for `/validate` → `/review` → security review → `/final-review`.

## 26. Expected repository structure (apps/web, after)

```text
apps/web/
  .env.example                      (new)
  next.config.ts                    (rewrites)
  src/
    app/          page.tsx · cart/page.tsx · checkout/page.tsx · error.tsx · loading.tsx …
    components/
      cart/       CartPanel · CartList · CartLine · QuantityStepper · CartTotal · CartAnnouncer · CartErrorMessage (new)
      checkout/   CheckoutFlow · CheckoutReview · OrderConfirmation · OrderSummary · CustomerDetailsForm · …
      menu/ nav/ chat/ dev/         (menu/nav touched lightly; chat/dev untouched)
    lib/
      api/        config.ts · client.ts · errors.ts · userMessages.ts          (new)
      menu/       menuSource.ts (API-backed) · filter.ts
      cart/       cartService.ts                                              (pricing.ts deleted)
      checkout/   orderService.ts · idempotencyKey.ts · checkoutReducer.ts · types.ts · validation.ts
                                                                              (order.ts, orderId.ts deleted)
      state/      cartStore.tsx (server-state holder) · uiStore.tsx
      commands/   dispatch.ts · simulate.ts                                   (unchanged)
      money.ts                                                                (unchanged)
                                                                              (fixtures/ deleted)
    test/
      fixtures/menu.ts · fetchStub.ts                                         (new, test-only)
```

---

## Assumptions

Verified:

- The API routes and shapes are as read in the controllers, mappers and
  `@contracts/api-contracts`.
- There is no `DELETE /v1/cart` and no CORS.
- `@contracts/*` packages export raw TS, and `apps/web` already consumes
  one (`ui-commands`) successfully in build and test.
- `.env*` is gitignored.
- No `fetch` exists in `apps/web` today.

Not verified:

- **A.** Next 15 `rewrites` to an external origin forward `POST`, `PATCH`
  and `DELETE` bodies and headers unchanged in `next dev` and `next start`.
  First checked by curl in 11.1.
- **B.** `cache: "no-store"` alone marks the three routes dynamic in this
  Next version. Checked by AC2 in 11.2. If it doesn't, add
  `export const dynamic = "force-dynamic"` to the page.
- **C.** Importing `@contracts/api-contracts` schemas into Client
  Components (`client.ts` is shared) adds zod to the browser bundle. This
  is accepted; the size is noted in the 11.5 build output.
- **D.** The browser automation tool may still not connect (a gap recorded
  since Phase 4). If it doesn't, the manual walk uses curl through the
  proxy, and the UI-only checks are reported as not performed.

## Not doing

- Any commerce-api or contracts change, including CORS,
  `DELETE /v1/cart` and a cart idempotency key.
- New libraries (TanStack Query, MSW, Playwright).
- Optimistic updates, polling and push.
- Order history and order lookup after a reload.
- Removing `app/cart/loading.tsx` and `app/checkout/loading.tsx`, even
  though those pages no longer await anything. That would be a follow-up
  cleanup, not needed for this work.

## Specialised review needed?

- **security: yes.** This adds a new browser → proxy → API trust boundary,
  and customer personal data now crosses the network. Review:
  - the rewrite scope (only `/v1`);
  - server-only config;
  - response validation;
  - error-copy mapping (no backend or internal detail);
  - no personal data in logs;
  - no secrets.
- **performance: no.** One small request per action at single-user scale.
  The no-store menu fetch is intentional (§9).
- **data / migration: no.** No schema or data change. Orders created during
  manual testing live in the local dev database only.
