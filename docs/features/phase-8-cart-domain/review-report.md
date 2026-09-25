# Review Report — phase-8-cart-domain

**Reviewed:** `requirements.md` (AC1–AC19), `plan.md` (§1–§35, OD1–OD14),
`test-plan.md`; the full working-tree diff (`git diff` + untracked files):
`packages/contracts/api-contracts/{src/cart.ts, src/cart.test.ts, src/index.ts,
scripts/emit-schema.ts, schema/cart*.v1.json}`,
`apps/commerce-api/src/modules/cart/**`, `test/cart.e2e.test.ts`,
`src/common/errors/api-error-codes.ts`, `src/app.module.ts`,
`src/modules/menu/menu.service{,.test}.ts`, and the eight documentation files
in `plan.md` §28.
**Path:** Full
**Reviewers:** (1) the implementing agent (self-review, below); (2) an
independent `implementation-reviewer` pass, re-run after an earlier attempt
hit an API rate limit. It formed its own view before reading this report and
also covered the plan's specialised **security** and **data** reviews. Its
results are under "Independent review" at the end.

## Verdict

Sound against the approved plan. No BLOCKER, HIGH, or MEDIUM findings. One LOW
defect (a misleading comment), one pre-existing LOW (Phase 6 behaviour) for
the security review to rule on, and notes.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | LOW | `apps/commerce-api/src/modules/cart/infrastructure/single-user-cart-owner.resolver.ts:5-7` | The comment says `SINGLE_USER_CART_OWNER_ID` is "Exported so tests can assert against it", but no test imports it (verified by grep). The comment states a purpose the code doesn't have. | Either assert on it (e.g. in `cart.module.test.ts`: resolver resolves to the constant), or drop the export and the sentence. **FIXED (2026-09-25):** `cart.module.test.ts` now asserts that the bound `CartOwnerResolver` resolves to `SINGLE_USER_CART_OWNER_ID`, so the comment is true. No production code changed. |
| 2 | LOW (pre-existing, Phase 6) | `apps/commerce-api/src/common/validation/validation.ts` (`validationExceptionFactory`) | An unknown-key 400 reflects the **key name** the client chose, e.g. `"(root): Unrecognized key: \"unitPriceCents\""`, observed live on `start`. Values are never echoed, which is Phase 6's stated rule, but key names are client-controlled text. It is bounded (message ≤ 500 chars), JSON-encoded, and never HTML. Phase 8 does not introduce this; it makes it reachable on more routes. | For the security review to decide: accept as-is, or map unrecognized-key issues to a static message. Not in Phase 8's scope either way. |
| 3 | LOW | `apps/commerce-api/src/modules/cart/infrastructure/in-memory-cart.repository.ts:9-21` | `deepFreeze` duplicates the private helper in `menu/infrastructure/in-memory-menu.repository.ts`. This is disclosed in the code and already reported as follow-up. | Extract to `src/common/` and import from both repositories. **FIXED (2026-09-25):** moved to `src/common/immutability/deep-freeze.ts`, and both `in-memory-menu.repository.ts` and `in-memory-cart.repository.ts` now import it. The behaviour is identical, and both repositories' freeze tests pass unchanged. |
| 4 | NOTE | `apps/commerce-api/src/modules/cart/cart.service.ts:48-55` | `PATCH` on an item that is in the cart but has since become unavailable returns 422, so the only thing a customer can do with that line is remove it. This is the approved rule (plan §9: validate on add *and* set), but it isn't reachable in Phase 8 (static seed). The Order/integration phase may want "decrease is always allowed". | None now. Revisit with a mutable menu. |
| 5 | NOTE | `test/cart.e2e.test.ts` | 409 `CART_CONFLICT` is never exercised over HTTP. It is proven at repository and service level (deterministic interleaving), and the filter's generic `DomainError` branch is already tested. This matches the test plan's "Not covered". | None. |
| 6 | NOTE | `apps/commerce-api/src/modules/cart/cart.service.test.ts` ("concurrent writes") | The lost-update test was not mutation-checked: it was never run with the version check removed. By inspection it would fail without the check (both saves at version 1 would succeed), but that was not executed. | Optional: a one-off local run with the check disabled, during specialised data review. |
| 7 | NOTE (pre-existing) | `docs/architecture/architecture-decisions.md:20-35` | The ADR index has no row for ADR-0014 (missing since Phase 7). Phase 8 added the 0015 row. | Add the 0014 row (separate docs fix). **FIXED (2026-09-25):** the row was added between 0013 and 0015, and its anchor was checked against the heading. |

## Requirements check

| AC | Satisfied by | Verdict |
| --- | --- | --- |
| AC1 | `CartService.getCart` + `emptyCart`; e2e "returns an empty cart" | yes |
| AC2 | `addLine`, `priceCart`, mapper; e2e asserts every field + persisted read | yes |
| AC3 | `addLine` merge-in-place; domain order test; e2e `[["tiramisu",5],["garlic-bread",1]]` | yes |
| AC4 | `CartItemQuantityLimitExceededError` before any save; e2e 422 then GET = 98 | yes |
| AC5 | `requireOrderableItem` before load; e2e 404/422 + unchanged cart; message non-echo asserted | yes |
| AC6 | `quantitySchema` via `@Body`; e2e 5 bad values + missing, `field: "quantity"`, handler spy | yes |
| AC7 | `setLineQuantity`/`removeLine` throw `CartItemNotFoundError`; e2e both verbs | yes |
| AC8 | `removeLine`; e2e totals recomputed | yes |
| AC9 | existing pipe/guard; e2e path/body malformed id, unknown key, 415; headers asserted on every `expectCart`/`expectContractError` | yes |
| AC10 | controller reads no id; resolver port; e2e headers/query ignored, body keys 400, no `/v1/carts/:id` | yes |
| AC11 | strict request schemas; contract + e2e price rejection; e2e price equals `/v1/menu/items/:id` | yes |
| AC12 | controller has no branching; service ctor = 3 abstract ports; `cart/domain` import grep clean; service tests with fakes | yes |
| AC13 | `InMemoryCartRepository.save` version check; repo + service interleaving tests; freeze tests | yes (see #6) |
| AC14 | `cart.contract-compat.test.ts`: exhaustive over `AGENT_INTENT_TYPES`, schema identity, type equality | yes |
| AC15 | drift test green; `git status` on forbidden paths empty | yes |
| AC16 | `CartService.clearCart` tested; no route; e2e `DELETE /v1/cart` → 404 | yes |
| AC17 | `/validate`: lint, typecheck, test (502), build all PASS. Now 503 after the #1 fix added one test. The independent reviewer re-ran the full set at 503, all green | yes |
| AC18 | `curl` on `dev` and on `start`, plus restart-empties-cart | yes |
| AC19 | all §28 docs changed; spot-checked against code | yes (self-checked only) |

## Conventions

Follows Phase 7 throughout:

- Abstract-class ports as DI tokens.
- A domain with no framework dependency.
- `DomainError` subclasses with static messages.
- Mapper as the only domain→wire step.
- `@Param/@Body({ schema })` through the global pipe.
- An e2e harness built from the real `AppModule` + `configureApp`.
- Committed JSON Schema with a drift test.

No second mechanism is introduced for anything the project already does.
The only duplication is #3.

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `packages/contracts/api-contracts/src/cart.ts`, `cart.test.ts`, `index.ts`, `scripts/emit-schema.ts`, `schema/cart*.v1.json` | 8.1 | yes |
| `apps/commerce-api/src/modules/cart/domain/*` | 8.2 | yes |
| `apps/commerce-api/src/common/errors/api-error-codes.ts` | 8.4 in plan, done in 8.2 (reported) | yes |
| `apps/commerce-api/src/modules/menu/menu.service{,.test}.ts` | 8.3 (OD14) | yes |
| `apps/commerce-api/src/modules/cart/infrastructure/*`, `cart.service{,.test}.ts` | 8.3 | yes |
| `apps/commerce-api/src/modules/cart/cart.mapper.ts` | 8.4 in plan, done in 8.3 (reported) | yes |
| `apps/commerce-api/src/modules/cart/cart.controller.ts`, `cart.module{,.test}.ts`, `cart.contract-compat.test.ts`, `src/app.module.ts`, `test/cart.e2e.test.ts` | 8.4 | yes |
| 8 docs + `apps/commerce-api/README.md` | 8.5 (§28) | yes |
| `docs/features/phase-8-cart-domain/*` | /plan, approval, AC ticks, this report | yes |

Nothing unattributable. No dependency, lockfile, config, `apps/web`, or
other contracts package changed.

## Not reviewed

- Concurrent writes over real HTTP (#5).
- The lost-update test with the check disabled (#6).
- Python/Pydantic consumption of the new JSON Schema (no ai-service exists).
- Any consumer integration (none is wired, by design).

## Independent review

**Reviewer:** `implementation-reviewer` agent (read-only), 2026-09-25.
**Verdict:** APPROVE. No BLOCKER, HIGH, or MEDIUM findings. It disagreed with
nothing in the self-review above.

**It executed** (did not just read):
- `pnpm turbo run lint typecheck test` (24/24 tasks)
- `pnpm turbo run build` (6/6)
- `pnpm --filter commerce-api test` (177)
- `pnpm --filter @contracts/api-contracts test` (45)
- `curl` against `dev`
- a `grep` confirming `cart/domain/**` imports no framework
- a diff-vs-plan file comparison (an exact match with §27/§28, and no
  forbidden path touched)

**Security verdict: PASS.**
- No client value can select or influence cart identity (AC10). It confirmed
  this by code, e2e, and a live `curl`.
- No client-supplied price reaches the domain (AC11). Strict schemas reject it
  at the pipe.
- Cart size is bounded (menu size × 99, and one owner).
- There is no new dependency, external call, or auth/CORS change.
- Unknown-key name echo (#2 above): it agrees this is pre-existing and LOW. The
  client already knows the key it sent, and no value, secret, or internal
  detail is disclosed.

**Data verdict: PASS.**
- The version contract in `cart.repository.ts` matches
  `InMemoryCartRepository.save` exactly. The check-and-set has no `await`
  between reading the stored version and `Map.set`, so it is atomic within the
  event loop. Checked again by the implementer.
- No lost-update path remains in `CartService`.
- Freeze and clone isolation are real and directly tested.
- It traced both concurrency tests and concluded they are load-bearing. Without
  the check, the service test would show 2 fulfilled / 0 rejected, and the
  repository test's final-state assertion would fail. This closes the
  reasoning half of #6. The empirical mutation run was still not performed.

**Its findings, reconciled with the current tree:**

| Its # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | LOW (pre-existing) | Unknown-key name echoed in the 400 message | Same as #2 above. Accepted as LOW; out of Phase 8 scope |
| 2 | LOW | `deepFreeze` duplication. It judged leaving it as follow-up "the correct call under scope-control" | **Already fixed** (#3 above) at the human's explicit request, while this review was running. It reviewed the pre-fix file |
| 3 | NOTE | AC17 row said 502 after the count became 503 | Fixed in this report (AC17 row annotated) |
| 4 | NOTE | PATCH on a now-unavailable in-cart item returns 422 | Same as #4 above |
| 5 | NOTE | Lost-update test not mutation-tested | Same as #6 above. It agrees the test is load-bearing by trace |

**Process note it raised (accepted):** the working tree changed during its
review. The #1 fix and the count update landed mid-run, and the #3 and #7
fixes landed after it had read those files. Its final validation ran on the
current tree and was consistent. The takeaway for future Full Path reviews
is to freeze the tree, or record the reviewed base, before starting an
independent review, and not to edit while it runs.

**Implementer checks of the reviewer's claims:**
- Port 3001 was free after its `dev` run (no leftover process).
- `pnpm-lock.yaml` has 0 diff lines. This covers the one file it said it did
  not check.
- Exactly one `deepFreeze` definition exists
  (`src/common/immutability/deep-freeze.ts`).

**Not reviewed by either pass:**
- Concurrent writes over real sockets.
- A physical mutation run of the version check.
- Python/Pydantic consumption of the JSON Schema.
- Any consumer integration.
