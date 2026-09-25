# Plan — Phase 8: Cart Domain & Cart API

**Approval Status:** APPROVED (2026-09-25, OD1–OD14 as recommended)

Labels used throughout: **[EXISTING]** an inherited requirement with its
source · **[PROPOSED]** this plan's design · **[OPEN ODn]** needs a human
decision (§33) · **[DEFERRED]** deliberately not done, with the phase that
owns it.

### Findings from inspection that correct the brief

1. Intent names are PascalCase — `AddItemToCart`, `RemoveItemFromCart`,
   `SetCartItemQuantity` (Phase 5 D1) — not `ADD_ITEM_TO_CART` etc.
2. Intents use `itemId`, and Phase 7 OD2 chose `items` over `products`. This
   plan uses `itemId` / `MENU_ITEM_*` and not `productId` / `PRODUCT_*`.
3. **`ClearCart` was declined** (Phase 5 D7, ADR-0011, `contracts.md` §7): it
   is the internal mechanism of a placed order, and explicitly *not* a
   user-facing feature. `DELETE /v1/cart` would create that feature. → OD5.
4. The route prefix is `/v1`, not `/api/v1` (Phase 7 OD1, ADR-0013).
5. A max quantity **is** defined: `MAX_QUANTITY = 99` in
   `@contracts/common` (`quantitySchema`), mirrored by web's
   `MAX_LINE_QUANTITY`. Nothing is invented by using it.
6. `422` is already reserved in `commerce-api.md` §6 for "an out-of-range
   quantity a schema bound alone can't express" — which is exactly the
   merged-quantity case (AC4).
7. Phase 7's validation / review / final-review / completion reports do not
   exist as files. Only `requirements.md`, `plan.md` and `test-plan.md` are
   in `docs/features/phase-7-menu-domain/`. Phase 7's state was verified from
   the code and from commit `9cdb74d` instead: all ACs are ticked, and
   `getting-started.md` records 375 passing tests. This plan did **not**
   re-run the suite. It is planning-only.

---

## 1. Phase objective

[PROPOSED] Make `apps/commerce-api` the authoritative executor of cart
operations — retrieve, add, set quantity, remove, and (internally) clear —
with every item validated against the Menu domain and every price computed
server-side, behind a repository port that a database can later implement.

## 2. Architectural purpose

- Gives the three adopted intents an executor. The AI will reach this only
  through HTTP (`system-architecture.md` §4.1, §4.2).
- It is the first write path, so it sets conventions that Order will copy:
  aggregate load/save, optimistic versioning, domain-rule errors (422), and
  how one module reads another module's data (Cart ← Menu).
- It moves `food-ordering-frontend-mvp.md` §7 items 2 and 3 (client cart and
  client pricing) closer to deletion. They are **not** deleted here, because
  no consumer is wired yet.

## 3. Cart domain model

[PROPOSED] Domain (internal, never serialized as-is):

```text
Cart
├── ownerId: CartOwnerId     — who the cart belongs to (§5); also its key
├── lines: CartLine[]        — insertion order, at most one per itemId
├── version: number          — optimistic concurrency (§19); starts at 0
├── createdAt: Date
└── updatedAt: Date
```

- **No separate `cartId`.** With one cart per owner, the owner is the key. A
  second identifier would be a value no one reads. Once multiple carts per
  owner exist (saved carts, or a cart per order attempt), an id is added and
  the Order phase can introduce it. [DEFERRED]
- **No lifecycle status** (`active` / `checked-out` / `locked`). Nothing in
  Phase 8 can move a cart out of "active". Inventing states now would create
  `INVALID_CART_OPERATION` errors that nothing can trigger. [DEFERRED → Order]
- Timestamps are domain-only. They are needed for persistence and for future
  expiry, but are **not on the wire** (§8), because no consumer needs them.
- A cart that was never written does not exist in the repository. The
  service represents it as an empty cart (§14).

## 4. Cart item model

[PROPOSED]

```text
CartLine (stored)            PricedCartLine (computed on read, §10)
├── itemId: MenuItemId       ├── itemId
└── quantity: Quantity       ├── name            — live from Menu
                             ├── unitPriceCents  — live from Menu
                             ├── quantity
                             ├── lineSubtotalCents
                             └── available       — live from Menu
```

- **Stored:** `itemId` and `quantity` only. This is the same shape as web's
  `CartLine` [EXISTING, `cartStore.tsx`]. The Menu model is not duplicated
  into Cart.
- **Computed:** a read-time *reference* to Menu, not a snapshot. `name` is
  included so a consumer can render a line without a second call. It is a
  live value.

## 5. Cart identity strategy

[OPEN OD3] Recommendation: **a server-resolved owner, with no client-supplied
identity.**

- The domain uses an opaque `CartOwnerId` (a string type). It knows nothing
  about sessions or users.
- An abstract `CartOwnerResolver` port has one method,
  `resolve(): CartOwnerId`. In Phase 8 its only adapter is
  `SingleUserCartOwnerResolver`, which returns the constant `"local-dev-owner"`.
- The controller never reads a cart id or owner id from the path, body, query,
  or headers (AC10). `CartService` asks the resolver.
- **Why:** [EXISTING] Phase 5 D13 says commerce-api resolves the cart and
  intents carry no `cartId`, and `CLAUDE.md` assumes a single user. A
  client-supplied `X-Cart-Id` / session header with no authentication would be
  a bearer token anyone can guess or replay. It would look like isolation
  without providing any. A single server-side owner is honest: it is exactly
  as isolated as the system actually is (`system-architecture.md` §8 gap 4).
- **Migration path:** the authentication phase replaces the resolver binding
  (for example, owner = authenticated subject, or a signed anonymous-session
  cookie). No domain, repository, or service signature changes.
- **Alternative considered:** a dev-only `X-Cart-Session-Id` header. It would
  let tests run carts in parallel, but it creates an unauthenticated identity
  channel that later has to be removed. The recommendation is not to adopt it.
  Tests get isolation by building a fresh app, and so a fresh in-memory
  repository, per test.

## 6. Cart operations

| Operation | Service method | Status |
| --- | --- | --- |
| Retrieve cart | `getCart()` | [PROPOSED] |
| Add item (merge) | `addItem(itemId, quantity)` | [PROPOSED] ↔ `AddItemToCart` [EXISTING] |
| Set item quantity (absolute) | `setItemQuantity(itemId, quantity)` | [PROPOSED] ↔ `SetCartItemQuantity` [EXISTING] |
| Remove item (whole line) | `removeItem(itemId)` | [PROPOSED] ↔ `RemoveItemFromCart` [EXISTING] |
| Clear cart | `clearCart()` | [OPEN OD5]; recommended: service method only, no route |

Domain operations are **pure functions** on a `Cart` value (`addLine`,
`setLineQuantity`, `removeLine`, `clearLines`). Each returns a new `Cart` or
throws a `DomainError` subclass. They do no I/O and take no timestamps from
the clock: `now` is passed in.

## 7. API endpoint design

[PROPOSED; OD1, OD2, OD5, OD9]

| Method | Route | Body | Success |
| --- | --- | --- | --- |
| `GET` | `/v1/cart` | — | 200 `CartResponse` |
| `POST` | `/v1/cart/items` | `AddCartItemRequest` | 200 `CartResponse` |
| `PATCH` | `/v1/cart/items/:itemId` | `UpdateCartItemRequest` | 200 `CartResponse` |
| `DELETE` | `/v1/cart/items/:itemId` | — | 200 `CartResponse` |
| ~~`DELETE`~~ | ~~`/v1/cart`~~ | — | **Not added** unless OD5 is decided otherwise |

- The route is `/v1/cart`, singular, because it means "my cart", resolved
  server-side (§5). It is not `/v1/carts/:id`.
- The `POST` response is **200, not 201**. A merge updates an existing line
  rather than creating a resource. The resource in the response is the cart,
  which always exists (logically). → OD9
- Every mutation returns the **full cart** [PROPOSED], because the frontend
  refreshes from the backend after every operation (`CLAUDE.md`). This saves
  a round-trip and keeps the refresh atomic with the write.

## 8. Request/response contracts

[PROPOSED] New module `packages/contracts/api-contracts/src/cart.ts`. All
objects use `z.strictObject`, and primitives are reused from
`@contracts/common` [EXISTING]:

```ts
addCartItemRequestSchema    = strict({ itemId: menuItemIdSchema, quantity: quantitySchema })
updateCartItemRequestSchema = strict({ quantity: quantitySchema })
cartItemParamsSchema        = strict({ itemId: menuItemIdSchema })

cartLineSchema = strict({
  itemId: menuItemIdSchema,
  name: z.string().min(1).max(80),          // same bound as menuItemSchema.name
  unitPriceCents: priceCentsSchema,
  quantity: quantitySchema,
  lineSubtotalCents: priceCentsSchema,
  available: z.boolean(),
})

cartResponseSchema = strict({
  items: z.array(cartLineSchema),
  itemCount: z.number().int().min(0),
  subtotalCents: priceCentsSchema,
})
```

- There is no `contractVersion` field, because the URL versions it. This is
  the same rule as Menu [EXISTING, `menu.ts`].
- **No price, owner, or cart id in any request.** Strict objects reject them
  (AC11, AC10).
- There is no currency field, because none exists anywhere in the contracts
  and money is integer cents [EXISTING]. [DEFERRED]
- The artifacts committed to `schema/` are `cart.v1.json` (the response),
  `cart-add-item-request.v1.json`, and `cart-update-item-request.v1.json`.
  Request schemas are emitted too, because a Python caller (ai-service) will
  send them. The drift test extends automatically via `ARTIFACTS`.
- The wrapper object (`{ items, … }`, not a bare array) follows Menu's
  precedent. Fields can still be added later within `/v1` under the in-major
  additive rule (Phase 7 risks table).

## 9. Product validation strategy

[PROPOSED; OD14] Cart defines what it needs, and Menu provides it:

```text
CartService ──▶ CartCatalog (abstract port, cart/domain)
                    ▲
                    │ implemented by
        MenuCatalogAdapter (cart/infrastructure) ──▶ MenuService.findItemById (new, additive)
```

- `CartCatalog.findItem(itemId): Promise<CatalogItem | undefined>`, where
  `CatalogItem = { id, name, priceCents, available }`. This is the only slice
  of Menu that Cart knows about.
- `MenuService` gains `findItemById(itemId): Promise<MenuItem | undefined>`,
  which returns the domain type and does not throw. `getItem` (the HTTP path)
  is unchanged. Phase 7's `menu.module.ts` already exports `MenuService` "so a
  later module (e.g. Cart) can depend on it directly, without reaching into
  the Menu domain's repository" [EXISTING]. This honours that design. The
  alternative (catching `MenuItemNotFoundError` from `getItem` and consuming
  the wire type) couples Cart to Menu's HTTP shape.
- `CartModule` imports `MenuModule`.
- **Validated on add and on set-quantity:** the item exists (else 404
  `MENU_ITEM_NOT_FOUND`) and `available === true` (else 422
  `MENU_ITEM_UNAVAILABLE`).
- **Not validated on remove:** removing a line never requires the item to be
  on sale.
- **On read,** every line is re-priced from the catalog. The case where an
  item has left the menu or become unavailable after being added cannot
  happen in Phase 8, because the Menu seed is static and read-only. The rule
  for it is still defined (→ OD8) so the code has a defined branch.

## 10. Pricing strategy

[OPEN OD4] This is the central decision.

| | A. Live menu price | B. Snapshot at add | C. Dedicated pricing component |
| --- | --- | --- | --- |
| Price change while in cart | Cart shows the new price immediately | Cart shows the old price and needs a reconciliation rule later anyway | Depends on its implementation |
| Discounts / promotions | Added later as a pricing step | Snapshot conflicts with promotion windows | Designed for it |
| Order creation | Order snapshots at placement | Order copies the cart's snapshot, which may be stale | Order asks the component |
| Historical pricing | Owned by Order (correct place) | Split between cart and order | Owned by component + Order |
| Payment verification | Charge = order snapshot = the price the server computed at placement | The charge may differ from the current price, so which one wins? | Same as A |
| Storage in cart | `itemId`, `quantity` only | + price per line | `itemId`, `quantity` only |
| Cost now | Smallest | Needs a staleness policy nobody has defined | Speculative component with one rule (`price × qty`) |

**Recommendation: A, computed by one pure function in the Cart domain**
(`priceCart(lines, lookup) → PricedCart`). Reasons:

- A cart is not a commitment. Price commitment happens at order placement,
  so the **Order domain snapshots unit prices** when an order is created. That
  snapshot *is* historical pricing, and it is what payment verifies against.
- B makes the cart claim a price the business no longer offers, and forces a
  "which price wins at checkout" rule that no product requirement defines.
- C is the right shape once discounts exist, but today it would contain a
  single multiplication. `priceCart` is that seam: when promotions arrive,
  it becomes (or delegates to) a pricing component, and callers do not change.
  [DEFERRED]
- It matches what `apps/web/src/lib/cart/pricing.ts` already does
  [EXISTING], so later integration changes no visible behaviour.

## 11. Cart business rules

| Rule | Status |
| --- | --- |
| At most one line per `itemId` | [EXISTING] Phase 3 |
| Add of an existing item merges quantities | [EXISTING] Phase 3 (+1 per click); generalized to +q |
| Quantity bounds `1..99` | [EXISTING] `quantitySchema` |
| Merged quantity > 99 is rejected, not clamped | [OPEN OD6], recommended: reject 422 |
| Only existing, available menu items can be added or re-quantified | [EXISTING] intent (Phase 7 OQ3), rule [PROPOSED] |
| Remove deletes the whole line | [EXISTING] Phase 3 |
| Set / remove of a line not in the cart → 404 | [OPEN OD7], recommended |
| Line order is first-add order; merge does not move a line | [EXISTING] reducer behaviour |
| Clients never supply prices | [EXISTING] `system-architecture.md` §5 |
| Maximum number of distinct lines | Not introduced. Bounded naturally by menu size (6 items), since only menu items are accepted |

## 12. Quantity rules

- Every quantity in a request must pass `quantitySchema` (`int`, `1..99`).
  Anything else is rejected with 400 `INVALID_PAYLOAD` and `field: "quantity"`
  at the pipe, before any handler runs [EXISTING mechanism].
- **`quantity: 0` on PATCH is a validation error, not a removal.** This is
  [EXISTING], not a choice: `SetCartItemQuantity` uses `quantitySchema` (min
  1), and Phase 3 made Remove "the only path to deleting a line". Treating 0
  as remove would give one intent two effects and diverge from the contract.
- A merged result above 99 → 422 `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` (OD6).
  The request is valid on its own, but the resulting state is not. This is
  exactly `commerce-api.md` §6's reserved 422 case. Clamping (web's silent
  no-op at 99) would tell an AI caller "done" when it wasn't.

## 13. Duplicate-item behavior

[EXISTING rule, PROPOSED generalization] `ADD X ×2` then `ADD X ×3` gives one
line, `X ×5`, at X's original position. It is never two lines. If `2 + 3`
exceeded 99 it would be rejected (§12), and the cart would be unchanged.

## 14. Empty-cart behavior

[PROPOSED] `GET /v1/cart` for an owner with no stored cart returns 200
`{ items: [], itemCount: 0, subtotalCents: 0 }`. This is not a 404, and the
read does not persist anything. From the caller's side a cart always exists,
which is also why `CART_NOT_FOUND` is not introduced (§18). Removing the last
line leaves a stored cart with zero lines. It looks identical on the wire.

## 15. Cart total calculation

[EXISTING formulas, from web `pricing.ts`]

```text
lineSubtotalCents = unitPriceCents × quantity
subtotalCents     = Σ lineSubtotalCents
itemCount         = Σ quantity
```

- All values are integer cents. The largest possible value (99 × max price ×
  6 lines) stays far below `Number.MAX_SAFE_INTEGER`. No big-number type is
  needed.
- No tax, delivery fee, discount, coupon, promotion or tip [EXISTING
  exclusion]. The field is `subtotalCents`, not `totalCents`, so there is room
  for a total later without renaming.
- Whether unavailable lines count toward the subtotal → OD8.

## 16. Repository abstraction

[PROPOSED] Same convention as `MenuRepository` [EXISTING]: an abstract class
that doubles as its own DI token, async methods.

```ts
abstract class CartRepository {
  abstract findByOwner(ownerId: CartOwnerId): Promise<Cart | undefined>;
  // Persists the whole aggregate. Rejects with CartVersionConflictError if the
  // stored version ≠ cart.version - 1 (or a cart exists when version is 0 on create).
  abstract save(cart: Cart): Promise<void>;
}
```

- It loads and saves the whole aggregate. There are no line-level repository
  methods, so the domain rules stay in the domain and not in queries.
- Versioning lives in the port's contract, not in the adapter's
  implementation details. A future SQL adapter implements it as
  `UPDATE … WHERE version = ?`.

## 17. Data-source strategy

[OPEN OD12] Recommendation: **`InMemoryCartRepository`** (a `Map<CartOwnerId,
Cart>`, deep-frozen clones in and out). No database.

- The brief says no database unless approved, and `CLAUDE.md` defers
  persistence.
- **ADR-0004's stated risk** is "an in-memory store making transactional
  semantics look easier than they are". That risk applies here, unlike for
  read-only Menu. It is handled by putting the version check into the port
  (§16, §19), so the in-memory adapter has to honour the same contract a
  database would.
- Consequences: carts are lost on restart and are per-process. This is
  acceptable for local development. It is recorded in ADR-0015, and ADR-0004
  becomes `Accepted` for Cart (still `Proposed` for Order).

## 18. Error model

[EXISTING format] Every error is exactly a `ContractError`, produced through
`DomainError` subclasses (Phase 7 OD7) handled by `AllExceptionsFilter`.
There is **no filter change** and no second format.

| Status | Code | When | New? |
| --- | --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | Bad `itemId` or `quantity` shape, unknown key, missing field | existing |
| 415 / 413 | existing | Non-JSON or oversized body | existing |
| 404 | `MENU_ITEM_NOT_FOUND` | Add or set an item that is not on the menu | existing code, reused (OD13) |
| 422 | `MENU_ITEM_UNAVAILABLE` | Add or set an item with `available: false` | new |
| 404 | `CART_ITEM_NOT_FOUND` | Set or remove an item that is not in the cart | new |
| 422 | `CART_ITEM_QUANTITY_LIMIT_EXCEEDED` | A merge would exceed 99 | new |
| 409 | `CART_CONFLICT` | Optimistic version check failed (§19) | new |

Brief codes deliberately **not** introduced:

- `PRODUCT_NOT_FOUND` / `PRODUCT_UNAVAILABLE`: renamed for the `items`
  vocabulary (Phase 7 OD2).
- `INVALID_QUANTITY`: already covered by `INVALID_PAYLOAD` with `field:
  "quantity"`. A second code for the same failure would split branching.
- `CART_NOT_FOUND`: impossible, because a cart always logically exists (§14).
- `INVALID_CART_OPERATION`: there is no cart state machine to violate (§3).
  It arrives with Order.

All messages are static and never echo the id or quantity (Phase 7 AC3
convention). Using `409` for `CART_CONFLICT` narrows `commerce-api.md` §6's
"reserved for a future idempotency conflict" row to "conflict, including a
concurrency conflict". That doc row is updated to say so.

## 19. Concurrency and idempotency considerations

- **Concurrency, addressed [OD10]:** even in a single Node process, the
  sequence `await find → mutate → await save` can interleave between two
  requests (a lost update). Recommendation: optimistic versioning inside the
  repository port. On a conflict, the service throws `CartVersionConflictError`
  (409 `CART_CONFLICT`) and does not retry internally. The caller re-reads and
  retries. This is internal only: there is no `ETag`/`If-Match` on the wire yet.
  [DEFERRED] Adding client-visible preconditions is an integration-phase
  decision.
- **Idempotency, deferred and documented:**
  - `SetCartItemQuantity` / `PATCH` is naturally idempotent (an absolute
    set) [EXISTING design, Phase 5].
  - `DELETE` of a line is idempotent in effect. A retry returns 404
    `CART_ITEM_NOT_FOUND`, and the caller can treat that as "already
    removed". This is documented, not special-cased.
  - `AddItemToCart` / `POST` is a **delta, and a retry double-counts**. This is
    the known gap. An `Idempotency-Key` store is not added, because
    `system-architecture.md` §8 gap 3 says key scope, retention and conflict
    semantics are undesigned. Accepting a key and ignoring it would be worse
    than not accepting one. No retrying caller exists in Phase 8, since
    neither ai-service nor web is wired. [DEFERRED → the phase that
    introduces a retrying caller, and at the latest Order]
- No distributed locking, Redis, or queues [out of scope].

## 20. Controller responsibilities

[PROPOSED; AC12] `CartController` (`@Controller("cart")`, default version 1):
it declares routes, validates path and body through `@Param({ schema })` /
`@Body({ schema })` [EXISTING mechanism], calls one `CartService` method, and
returns the result. It has no branching, no owner resolution, no error
decisions, and no mapping.

## 21. Application-service responsibilities

[PROPOSED] `CartService`: resolve the owner (resolver port), load the cart
(repository) or start an empty one, validate the item (catalog port), call the
pure domain operation with `now`, save (repository, version-checked), price
the result (`priceCart` with a catalog lookup), and map it to `CartResponse`
(mapper). It is the orchestration layer. The rules live in the domain.

## 22. Domain responsibilities

[PROPOSED] `cart/domain/`: types (`Cart`, `CartLine`, `CartOwnerId`,
`CatalogItem`, `PricedCart`), pure operations (§6), `priceCart` (§10, §15),
`assertCartInvariants` (unique `itemId`s, quantities in range), errors, and
the three abstract ports. It imports no `@nestjs/*`, no `express`, and no
`infrastructure/` (AC12; verified by a test or grep in review).

## 23. Repository responsibilities

[PROPOSED] Persist and retrieve whole carts by owner and enforce the version
check. It returns `undefined` for "none" and does not throw for it (the Menu
convention). It never validates business rules and never talks to Menu. The
in-memory adapter clones and deep-freezes data at the boundary, so callers
cannot mutate stored state (AC13; Phase 7 AC7 convention).

## 24. Contract integration

- [EXISTING, unchanged] `@contracts/agent-intents`, `@contracts/common`,
  `@contracts/ui-commands`. **No additions are required.** The three adopted
  intents map directly:

  | Intent | HTTP call |
  | --- | --- |
  | `AddItemToCart {itemId, quantity}` | `POST /v1/cart/items {itemId, quantity}` |
  | `SetCartItemQuantity {itemId, quantity}` | `PATCH /v1/cart/items/:itemId {quantity}` |
  | `RemoveItemFromCart {itemId}` | `DELETE /v1/cart/items/:itemId` |

- The brief's `CLEAR_CART` intent is **not** added (Phase 5 D7 stands). → OD5.
- **No intent-execution endpoint** (`POST /v1/intents`) [OPEN OD11]. It would
  have to accept `idempotencyKey` and `correlationId` whose semantics are
  undesigned (§19). The mapping is instead proven by a compatibility test
  (AC14) in `apps/commerce-api` (which already dev-depends on
  `@contracts/agent-intents`). The test parses sample intents, projects their
  fields, and parses the projection with the Cart request schemas. It also
  asserts at the type level that the field types are identical.
- `@contracts/api-contracts` gains `cart.ts`. The ESLint boundaries are
  unchanged: commerce-api still cannot import `ui-commands` or `apps/web`.

## 25. Testing strategy

See `test-plan.md`. In summary:

- Pure domain unit tests (no Nest).
- Repository tests (versioning, freezing, isolation).
- Service tests with fakes for all three ports.
- A module DI test.
- Contract tests (schemas, drift, intent compatibility).
- e2e tests over real HTTP using `configureApp`, the same harness as
  `test/menu.e2e.test.ts`.
- A manual `curl` walk on `dev` and `start`.

## 26. Security considerations

- **Trust boundary:** the only identity is the one the server resolves (§5).
  No client value selects a cart, so there is no cross-cart access path to
  test (AC10). [EXISTING gap, unchanged] Any local process can call the API
  (`system-architecture.md` §8 gap 4). This phase does not claim otherwise.
- **Price integrity:** prices are never accepted from input. Strict schemas
  reject extra keys (AC11).
- **Input bounds:** existing controls apply — a 16 KB body limit, JSON only,
  strict schemas, bounded slug ids, and integer quantities from 1 to 99.
- **Resource exhaustion:** cart size is bounded by menu size × 99. There is
  one owner, and the in-memory map holds one entry. A multi-owner resolver
  later brings a map growth question (expiry or eviction). [DEFERRED]
- **Information leakage:** error messages are static, bodies are never
  logged, and 500s stay generic [EXISTING].
- **No CORS** is added, so browsers cannot call the API cross-origin yet
  [EXISTING].
- **Specialised security review is required** (Full Path): focus on AC10, AC11,
  and the error paths.

## 27. Files to create

| File | Purpose |
| --- | --- |
| `packages/contracts/api-contracts/src/cart.ts` | Cart request/response/params schemas |
| `packages/contracts/api-contracts/src/cart.test.ts` | Schema accept/reject tests |
| `packages/contracts/api-contracts/schema/cart.v1.json` | Generated response schema |
| `packages/contracts/api-contracts/schema/cart-add-item-request.v1.json` | Generated |
| `packages/contracts/api-contracts/schema/cart-update-item-request.v1.json` | Generated |
| `apps/commerce-api/src/modules/cart/domain/cart.types.ts` | Domain types |
| `apps/commerce-api/src/modules/cart/domain/cart.operations.ts` (+ `.test.ts`) | Pure add/set/remove/clear |
| `apps/commerce-api/src/modules/cart/domain/cart.pricing.ts` (+ `.test.ts`) | `priceCart` |
| `apps/commerce-api/src/modules/cart/domain/cart.invariants.ts` (+ `.test.ts`) | Aggregate invariants |
| `apps/commerce-api/src/modules/cart/domain/cart.errors.ts` | `DomainError` subclasses |
| `apps/commerce-api/src/modules/cart/domain/cart.repository.ts` | Port |
| `apps/commerce-api/src/modules/cart/domain/cart-catalog.ts` | Port |
| `apps/commerce-api/src/modules/cart/domain/cart-owner.resolver.ts` | Port |
| `apps/commerce-api/src/modules/cart/infrastructure/in-memory-cart.repository.ts` (+ `.test.ts`) | Adapter |
| `apps/commerce-api/src/modules/cart/infrastructure/menu-catalog.adapter.ts` (+ `.test.ts`) | Adapter → `MenuService` |
| `apps/commerce-api/src/modules/cart/infrastructure/single-user-cart-owner.resolver.ts` | Adapter |
| `apps/commerce-api/src/modules/cart/cart.service.ts` (+ `.test.ts`) | Use cases |
| `apps/commerce-api/src/modules/cart/cart.mapper.ts` | Domain → wire |
| `apps/commerce-api/src/modules/cart/cart.controller.ts` | Routes |
| `apps/commerce-api/src/modules/cart/cart.module.ts` (+ `.test.ts`) | DI wiring |
| `apps/commerce-api/src/modules/cart/cart.contract-compat.test.ts` | AC14 |
| `apps/commerce-api/test/cart.e2e.test.ts` | HTTP tests |

## 28. Files to modify

| File | Change |
| --- | --- |
| `packages/contracts/api-contracts/src/index.ts` | Export cart schemas and types |
| `packages/contracts/api-contracts/scripts/emit-schema.ts` | 3 new `ARTIFACTS` entries |
| `apps/commerce-api/src/modules/menu/menu.service.ts` (+ `.test.ts`) | Additive `findItemById` (OD14) |
| `apps/commerce-api/src/common/errors/api-error-codes.ts` | 4 new codes |
| `apps/commerce-api/src/app.module.ts` | Import `CartModule`, update comment |
| `docs/architecture/architecture-decisions.md` | ADR-0015 (Cart: identity, pricing, storage, concurrency); ADR-0004 status → Accepted for Cart |
| `docs/architecture/system-architecture.md` | §8 gap 3 (the POST retry gap is now concrete), gap 4 (single-owner resolver) |
| `docs/api/commerce-api.md` | Status line, §6 new codes + 409/422 rows, new §12 Cart, §13 "does not cover" update |
| `docs/api/contracts.md` | api-contracts cart module; intent→route mapping; §7 `ClearCart` row per OD5 |
| `docs/development/getting-started.md` | Test counts, routes list |
| `docs/product/food-ordering-frontend-mvp.md` | §14 "Phase 8 additions" (backend cart exists; §7 items 2–3 still temporary, not yet wired) |
| `apps/commerce-api/README.md` | Routes |
| `pnpm-lock.yaml` | Only if the workspace link graph changes. Expected: **no change** (no new dependency edges) |

No file in `apps/web`, `packages/contracts/{common,ui-commands,agent-intents}`,
`configure-app.ts`, `all-exceptions.filter.ts`, or `eslint.config.mjs` changes.

## 29. Dependencies required

**None.** Everything used is already declared: `zod`, `@nestjs/*`,
`@contracts/common`, `@contracts/api-contracts` (dependencies), and
`@contracts/agent-intents` (a dev dependency of commerce-api). There are no
new packages or dependency edges.

## 30. Acceptance criteria

AC1–AC19 in `requirements.md`.

## 31. Validation commands

These are only the commands declared in `package.json` / `getting-started.md`:

| Check | Command |
| --- | --- |
| Regenerate schemas | `pnpm --filter @contracts/api-contracts build` |
| Lint | `pnpm turbo run lint` |
| Types | `pnpm turbo run typecheck` |
| Test | `pnpm turbo run test` |
| Build | `pnpm turbo run build` |
| Run (dev) | `pnpm --filter commerce-api dev` + `curl` |
| Run (built) | `pnpm --filter commerce-api build && pnpm --filter commerce-api start` + `curl` |

Format: `NOT_CONFIGURED`, because there is no formatter script. Between
sub-phases, runs are targeted (`pnpm --filter <pkg> test`), and the full set
runs before `/review`.

## 32. Risks

| Risk | Impact | How it is handled |
| --- | --- | --- |
| Pricing decision proves wrong for Order | Rework across two domains | OD4 decided explicitly; `priceCart` is a single seam; ADR-0015 |
| In-memory store hides concurrency bugs (ADR-0004's risk) | Lost updates reach the DB phase | Version check in the port contract, tested with an interleaving test |
| POST retry double-counts | Wrong quantity once a retrying caller exists | Documented gap (§19); no caller exists in Phase 8; carried in `system-architecture.md` §8 |
| Single-owner identity mistaken for isolation | False security assumption downstream | AC10 + docs state it plainly; resolver is the one replacement point |
| Cart → Menu coupling grows | Menu changes break Cart | Cart depends on its own `CartCatalog` port; one adapter touches `MenuService` |
| Modifying `MenuService` regresses Phase 7 | Menu API behaviour changes | Additive method only; the existing Menu tests must pass unchanged |
| `@Param` + `@Body` on one PATCH handler | Validation ordering/field confusion | e2e tests for both bad param and bad body; `field` asserted |
| Scope creep (clear route, idempotency, auth) | Unapproved features | OD5/OD10/OD11 decided up front; anything else is stop-and-ask |
| Five sub-phases is at the size limit | Large review | Each sub-phase is independently green; the docs sub-phase is mechanical |

## 33. Open architectural decisions

Each has a recommendation. Reply "approved" to accept all of them, or name the
ones to change.

| # | Question | Recommendation | Alternative |
| --- | --- | --- | --- |
| OD1 | `/api/v1` or `/v1`? | **`/v1/cart`** (precedent, Phase 7 OD1) | `/api/v1` moves `/health` too |
| OD2 | `productId` or `itemId`? | **`itemId`, `items`** (Phase 5 intents, Phase 7 OD2) | — |
| OD3 | Cart identity | **Server-resolved single owner via a `CartOwnerResolver` port; nothing read from the client** | Dev `X-Cart-Session-Id` header (unauthenticated identity channel) |
| OD4 | Pricing | **A: live Menu price via pure `priceCart`; Order snapshots at placement** | B snapshot; C pricing component |
| OD5 | Clear cart | **`CartService.clearCart` (tested) with no route and no intent**, consistent with ADR-0011 / D7; Order will call it | Add `DELETE /v1/cart` (a product decision reversing ADR-0011's "not user-facing"; needs its own ADR note) |
| OD6 | Merge above 99 | **Reject 422 `CART_ITEM_QUANTITY_LIMIT_EXCEEDED`, cart unchanged** | Clamp to 99 (silent partial success) |
| OD7 | Set/remove of an absent line | **404 `CART_ITEM_NOT_FOUND`** | Set = upsert; remove = 200 no-op |
| OD8 | Line whose item became unavailable or left the menu (unreachable in Phase 8) | **Keep the line, `available: false`, include it in the subtotal; the Order phase blocks placement.** If the item is gone from the menu entirely, drop it from the priced view | Exclude unavailable lines from the subtotal |
| OD9 | Mutation response | **200 with the full `CartResponse`** for all four routes | 201 on first add / 204 on delete |
| OD10 | Concurrency | **Optimistic `version` in the repository port → 409 `CART_CONFLICT`, internal only** | Defer entirely; document the lost-update risk |
| OD11 | Intent-execution endpoint | **None in Phase 8; compatibility test only** | `POST /v1/intents` ignoring `idempotencyKey` |
| OD12 | Storage | **In-memory repository; ADR-0004 → Accepted for Cart; ADR-0015** | A real DB now (out of scope per brief) |
| OD13 | Code for an unknown item on add | **Reuse `MENU_ITEM_NOT_FOUND` (404)**; new `MENU_ITEM_UNAVAILABLE` (422) | New `CART_ITEM_NOT_ON_MENU` |
| OD14 | How Cart reads Menu | **Cart-owned `CartCatalog` port; adapter calls a new additive `MenuService.findItemById`** | Adapter wraps `getItem` + catches its error (couples to the wire type) |

## 34. Implementation order

Five sub-phases, each independently green. Targeted tests run after each.

### 8.1 — Cart contracts
- [x] `cart.ts` schemas; export from `index.ts`; 3 `ARTIFACTS`; regenerate the schemas.
- [x] `cart.test.ts` (accept/reject: strict keys, quantity bounds, no price field).
- **Done when:** `pnpm --filter @contracts/api-contracts test` passes and the drift test is green.

### 8.2 — Pure Cart domain
- [x] Types, operations, `priceCart`, invariants, errors, three ports. No Nest.
- [x] Unit tests: add, merge, over-limit, set, remove, clear, empty, subtotal, invariants, immutability.
- **Done when:** the domain tests pass and the domain folder imports nothing from Nest, Express, or infrastructure.

### 8.3 — Adapters and service
- [x] `MenuService.findItemById` + test.
- [x] In-memory repository with version check; Menu catalog adapter; single-user resolver.
- [x] `CartService` + tests with fakes (not found, unavailable, conflict, happy paths).
- **Done when:** `pnpm --filter commerce-api test` passes and the Menu tests are unchanged.

### 8.4 — HTTP surface
- [x] Error codes; mapper; controller; `CartModule`; `AppModule` import.
- [x] Module DI test; contract-compat test (AC14); `test/cart.e2e.test.ts` (AC1–AC11, AC13).
- **Done when:** the full commerce-api tests pass and a `dev` `curl` walk works.

### 8.5 — Documentation and full validation
- [x] All §28 docs; ADR-0015.
- [x] Full lint, typecheck, test, and build; `start` + `curl` (AC17, AC18).
- **Done when:** AC19 is met and the full validation is recorded.

Approval may be given per sub-phase (Full Path allows it). 8.1 and 8.2 are
lowest-risk. 8.3 and 8.4 carry the trust-boundary work.

## 35. Expected repository structure

```text
packages/contracts/api-contracts/
  src/{menu,cart}.ts  src/{menu,cart,schema}.test.ts  src/index.ts
  schema/{menu,cart,cart-add-item-request,cart-update-item-request}.v1.json
apps/commerce-api/
  src/modules/menu/            (unchanged except menu.service.ts +findItemById)
  src/modules/cart/
    domain/
      cart.types.ts  cart.operations.ts  cart.pricing.ts  cart.invariants.ts
      cart.errors.ts  cart.repository.ts  cart-catalog.ts  cart-owner.resolver.ts
      *.test.ts
    infrastructure/
      in-memory-cart.repository.ts  menu-catalog.adapter.ts
      single-user-cart-owner.resolver.ts  *.test.ts
    cart.service.ts  cart.mapper.ts  cart.controller.ts  cart.module.ts
    cart.contract-compat.test.ts  *.test.ts
  test/cart.e2e.test.ts
docs/features/phase-8-cart-domain/{requirements,plan,test-plan}.md
```

---

## Assumptions

**Verified by reading:**
- `MenuModule` exports `MenuService`.
- `DomainError` and the filter branch exist and map `status`/`code` verbatim.
- `quantitySchema` is `int 1..99`.
- `@Param({ schema })` works under the global pipe (Phase 7 e2e).
- `@contracts/agent-intents` is already a commerce-api dev dependency.
- `422` and `409` are reserved in `commerce-api.md` §6.
- The Menu seed contains `tiramisu` (750) and `gelato` (`available: false`),
  per Phase 7 AC2.

**Not verified:**
- That `@Param({ schema })` and `@Body({ schema })` coexist on one handler
  with correct `field` reporting. This is first exercised in 8.4, and the
  handling is in the risks table.
- That the current suite still passes at HEAD. It was not re-run during
  planning.

## Not doing

Everything in `requirements.md` "Out of scope". In particular: no
`DELETE /v1/cart` unless OD5 changes, no `ClearCart` intent, no
idempotency-key store, no cart id, no cart states, and no web wiring.

## Specialised review needed?

- **security: yes.** This is the first unauthenticated write surface. Review
  the identity resolution (AC10), price-from-input rejection (AC11), and error
  non-echo.
- **performance: no.** The data is bounded (≤ 6 lines, 1 owner, in-memory).
- **data / migration: yes (light).** There is no migration, but review the
  repository version contract and the lost-update test, because a future
  database adapter inherits them.
