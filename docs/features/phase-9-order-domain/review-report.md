# Review Report — phase-9-order-domain

**Reviewed:** `requirements.md` (AC1–AC16), `plan.md` (§1–§33, OD1–OD13),
`test-plan.md`; the full working-tree diff (`git diff` + untracked files) on
base `f30e977`:
`packages/contracts/api-contracts/{src/order.ts, src/order.test.ts,
src/index.ts, scripts/emit-schema.ts, schema/order*.v1.json}`,
`apps/commerce-api/src/modules/order/**`,
`apps/commerce-api/src/modules/cart/{cart.service,cart.module}{,.test}.ts`,
`src/common/errors/api-error-codes.ts`, `src/app.module.ts`,
`test/order.e2e.test.ts`, and the documents in `plan.md` §27.
**Tree fingerprint:** `(git diff; git ls-files --others
--exclude-standard | xargs cat) | sha256sum` =
`8ff01013858eacc0b795d57e8bc1b58b2e8002330ec59ea10accac7d60bb7b6f`, recorded
before the review and re-checked after it: **unchanged**. Nothing was edited
while either pass ran (the Phase 8 review's process note).
**Path:** Full
**Reviewers:** (1) the implementing agent (self-review); (2) an independent,
read-only `implementation-reviewer` pass that formed its own view without a
prior report, and also performed the plan's specialised **security** and
**data** reviews. Its results are under "Independent review".

## Verdict

Sound against the approved plan. No BLOCKER, HIGH, or MEDIUM findings. Two
LOW findings (a weak test, a small duplication) and notes. Both reviewers
approve.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | LOW | `apps/commerce-api/src/modules/order/order.service.test.ts:305-316` | The AC9 test "keeps the placement-time name and price after the menu changes" changes the *fake cart's* lines, not a menu. Because the stored order never references the cart, it passes by construction and proves less than its name says. AC9 still holds: the order is a copied, frozen snapshot, which `order.create.test.ts` ("copies lines…") and the repository freeze and isolation test prove directly. But no test drives a real Menu-side change through the real `CartService` → `CartCheckoutAdapter` path. | Rewrite it against a real `CartService` with a mutable fake `CartCatalog`: place an order, change the catalog's price and name, then assert `getOrder` is unchanged and `GET /v1/cart`-equivalent pricing *has* changed. The harness already exists in the same file's concurrency block. |
| 2 | LOW | `apps/commerce-api/src/modules/order/domain/order.create.ts:29-38`, `apps/commerce-api/src/modules/order/order.mapper.ts:14-21` | The "copy known customer fields, keep an absent email absent" logic is written twice: domain in, wire out. The two copies can drift. | Accept as-is (the mapper is the domain→wire seam, as in Cart and Menu), or have the mapper reuse one exported helper. Not worth a separate change by itself. |
| 3 | NOTE | `apps/commerce-api/src/modules/cart/cart.service.ts:37` | `CartCheckout` (the checkout view type) is declared in `cart.service.ts` rather than `cart/domain/cart.types.ts`, where Cart's other types live. This was done to keep the Cart change to the files `plan.md` §27 lists, and reported in 9.3. | Move it to `cart.types.ts` if Cart gains another checkout-related type. |
| 4 | NOTE | `apps/commerce-api/src/modules/cart/cart.service.ts:157-176` | The private `price()` was split so `prepareCheckout` reuses the same pricing loop (`priceLines`). It is a behaviour-preserving extraction rather than a pure addition, and every pre-existing Cart test passes unchanged. Raised by the independent reviewer, for transparency. | None. |
| 5 | NOTE (pre-existing, Phase 6) | `apps/commerce-api/src/common/validation/validation.ts` | Phase 8 review #2: a 400 for an unknown key names the key the client sent (observed: `"(root): Unrecognized key: \"totalCents\""`). It is now reachable on `POST /v1/orders` too. Key *names* only; values, including customer data, are never echoed (asserted in `test/order.e2e.test.ts`). | Unchanged, as Phase 8 decided: for the security review to accept, or to map to a static message in its own change. |
| 6 | NOTE | `apps/commerce-api/src/modules/order/order.service.ts` (`placeOrder`) | A same-key retry sent while the first attempt is still between consuming the cart and storing the order gets 422 `CART_EMPTY` (or 409 `CART_CONFLICT`), not a replay. The next retry replays. This is documented in `plan.md` §12, ADR-0016 and `commerce-api.md` §13. | None now. Revisit if a retrying caller (ai-service) needs a single retry to always replay. |
| 7 | NOTE | `docs/features/phase-9-order-domain/plan.md` §5, ADR-0016 | The failure window where the cart is consumed but the order isn't stored is real in design and unreachable in practice today (programming error only). It is tested as a propagated error (`order.service.test.ts`, "order write failure after consumption"). A database adapter *must* make the two writes one transaction. | Carry into the database phase's plan as a hard requirement. |

## Requirements check

| AC | Satisfied by | Verdict |
| --- | --- | --- |
| AC1 | `createOrder`, `CartService.prepareCheckout`, mapper; e2e full body + per-line equality with `GET /v1/menu/items/:id` | yes |
| AC2 | `completeCheckout`; e2e "empties the cart" | yes |
| AC3 | `getOrder`, `orderParamsSchema`; e2e GET-equals-POST, 404 non-echo, 400 + handler spy | yes |
| AC4 | idempotency lookup first; service (`loads` count, one `create`, cart untouched) + e2e replay after refill | yes |
| AC5 | `isSameOrderRequest`, `IdempotencyKeyReusedError`; domain + service + e2e (key and name not echoed) | yes |
| AC6 | `CartEmptyError`; domain + service + e2e | yes |
| AC7 | `unpricedLineCount` + `available`; domain + service + adapter (`prepareCheckout` counts a gone line). Not over HTTP (static seed), as planned | yes |
| AC8 | `completeCheckout` version check; service `CheckoutCartConflictError` test; two concurrency interleavings with the real `CartService` (one mutation-checked, see below) | yes |
| AC9 | copy in `createOrder` + repository freeze/clone tests. The service-level test is weak (#1) | yes (see #1) |
| AC10 | strict schemas (`order.test.ts`, 67 cases); e2e 8 forbidden fields → 400 + spy + cart unchanged; customer field errors name the field and echo no value | yes |
| AC11 | controller has no branching; service built from 4 fakes; domain import grep clean | yes |
| AC12 | Cart test diffs are appends only; 45 → 114 and 177 → 279 with all pre-existing tests passing | yes |
| AC13 | drift test (6 artifacts); no diff in forbidden paths | yes |
| AC14 | `/validate`: `pnpm turbo run {lint,typecheck,test,build} --force`, all PASS, 0 cached, 674 tests | yes |
| AC15 | `curl` walk on `dev` (9.4) and `start` (9.5), plus restart → 404. By the implementer only (the independent pass was barred from starting servers) | yes (implementer-verified) |
| AC16 | all §27 docs, ADR-0016, README | yes |

## Conventions

Follows Phase 7/8 throughout:
- Abstract-class ports as DI tokens.
- A framework-free domain with pure functions and `now` passed in.
- `DomainError` subclasses with fixed messages; plain `Error` for invariant violations (→ 500).
- A consumer-owned port for another module (`CheckoutCart`, as `CartCatalog` is).
- The mapper as the only domain→wire step.
- `@Param/@Body({ schema })` through the global pipe.
- In-memory adapters that clone and deep-freeze using the shared `deepFreeze`.
- A committed JSON Schema with a drift test.
- An e2e harness built from the real `AppModule` + `configureApp`.

No second mechanism is introduced for anything the project already does. The one duplication is #2.

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `api-contracts/src/order{,.test}.ts`, `src/index.ts`, `scripts/emit-schema.ts`, `schema/order*.v1.json` | 9.1 | yes |
| `modules/order/domain/*` | 9.2 | yes |
| `common/errors/api-error-codes.ts` | 9.4 in plan, done in 9.2 (reported) | yes |
| `modules/cart/cart.service{,.test}.ts`, `cart.module{,.test}.ts` | 9.3 (OD1) | yes |
| `modules/order/infrastructure/*`, `order.service{,.test}.ts` | 9.3 | yes |
| `modules/order/order.mapper.ts` | 9.4 in plan, done in 9.3 (reported) | yes |
| `modules/order/order.controller.ts`, `order.module{,.test}.ts`, `src/app.module.ts`, `test/order.e2e.test.ts` | 9.4 | yes |
| 7 docs + `apps/commerce-api/README.md` | 9.5 (§27) | yes |
| `docs/features/phase-9-order-domain/*` | /plan, AC ticks, this report | yes |

Nothing is unattributable. There is no diff in `apps/web`, `packages/contracts/{common,ui-commands,agent-intents}`, `all-exceptions.filter.ts`, `configure-app.ts`, `eslint.config.mjs`, `package.json`, or `pnpm-lock.yaml`.

## Mutation check (performed by the implementer in 9.3)

The explicit version check in `CartService.completeCheckout` was removed temporarily, the tests were run, and the file was restored from a backup. The restore was confirmed by grep.

- The "both load before either consumes" Order test **still passed**, because `InMemoryCartRepository.save`'s own version check rejects the second write.
- Both Cart `completeCheckout` stale-version tests **failed**.
- The Order test "consumed by a completed placement after it loaded" was added for this reason, and it **failed**.

The independent reviewer traced the same reasoning by reading `clearLines`/`withLines` and agrees: each guard covers a different interleaving, and each has a test that depends on it.

## Not reviewed

- Concurrent placements over real HTTP sockets (they depend on timing). They are proven at service level with deterministic interleavings instead.
- A real Menu change reaching a stored order through the full stack (#1). It can't happen over HTTP while the seed is static.
- Python/Pydantic consumption of `order*.v1.json`: no ai-service exists.
- Any consumer integration (`apps/web` is not wired, by design).
- The independent pass did not run `build`, `dev` or `start`. AC15 rests on the implementer's `curl` walks.

## Independent review

**Reviewer:** `implementation-reviewer` agent (read-only), 2026-09-25.
**Verdict:** APPROVE. No BLOCKER, HIGH or MEDIUM findings. It raised #4, and a note that it did not itself re-run the `curl` walk (reflected in AC15 above). It found nothing that contradicts the self-review.

**It executed:**
- `pnpm --filter @contracts/api-contracts test` (114)
- `pnpm --filter commerce-api test` (279)
- `pnpm turbo run lint typecheck test` (24/24 tasks; lint results were cache hits against the current content)
- `git diff --stat` on the forbidden paths (zero diff)
- a domain import `grep`
- a read of the generated `order-create-request.v1.json`
- the tree-fingerprint check before and after (unchanged)

**Security verdict: PASS.**
- Customer data cannot reach logs. `RequestLogMiddleware` logs only method, path, status and duration. `AllExceptionsFilter` logs the stack or message only for 5xx, and every Order error or invariant message is fixed text or names item IDs only.
- Customer data cannot reach error bodies: 400s name the field and never the value, which the e2e tests assert.
- The owner comes only from `OrderOwnerResolver` → `CartOwnerAdapter` → `CartOwnerResolver`.
- No items, prices, totals, status or IDs are accepted from input.
- Reusing a key with a different request changes nothing.
- Reads are owner-scoped, and this is tested at repository and service level.

**Data verdict: PASS.**
- The cart is consumed before the order is stored, exactly as §5/OD11 specify. The failure window is tested and recorded in ADR-0016 as a transaction requirement for the database adapter.
- Both version guards are real, and each covers a distinct interleaving (see the mutation check).
- `InMemoryOrderRepository.create` checks and sets both maps with no `await` in between, so it is atomic within the event loop. Duplicate ID, duplicate (owner, key), and cross-owner key encoding are all tested.

**Implementer checks of the reviewer's claims:**
- The tree fingerprint after its run matches the one recorded before it.
- One citation was wrong. It attributed the "error messages contain no customer data" assertion to `order.invariants.test.ts`; the assertion is in `order.create.test.ts`, and `order.invariants.test.ts` asserts the invariant error is a plain `Error` with no client-facing code. The assertion it relied on exists, so its conclusion stands.
