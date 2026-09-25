# Review Report — phase-10-database-persistence

**Reviewed:** `requirements.md` (AC1–AC18), `plan.md` (§1–§35, OD1–OD16),
`test-plan.md`, and the whole uncommitted change set: `git diff` (31
modified files) plus the 35 untracked files (`src/database/`,
`src/common/persistence/`, the three `postgres-*.repository.ts` files and
their `*.db.test.ts`, `order-placement.db.test.ts`,
`test/persistence.e2e.db.test.ts`, `test/support/`, `test/db-global-setup.ts`,
`vitest.db.config.ts`, `infrastructure/docker/`). Kysely's
`TransactionBuilder.execute` source was also read (installed 0.29.6).
**Path:** Full

**Status of this report:** complete. There were two reviews: a self-review, and an
independent review (the `implementation-reviewer` agent, including the
specialised security and data/migration passes). Following the human's
instruction ("Wait for the independent review, then fix all findings"),
every actionable finding has since been fixed and re-validated. See the
**Outcome** column and "Fixes applied" below. Fixing #1 exposed a further,
more serious defect, **#8 (HIGH)**, which was fixed in the same pass.

## Verdict

**Sound against the approved plan.** Every BLOCKER, HIGH and MEDIUM finding
is fixed and tested; none is outstanding.

- **Before the fixes:**
  - the independent reviewer approved, with no BLOCKER, HIGH or MEDIUM
    findings;
  - the self-review raised one MEDIUM (#1) and one LOW (#2), which the
    independent pass did not raise;
  - while fixing #1, a HIGH (#8) surfaced: a database session ended
    mid-transaction could crash the process.
- **After the fixes:** all validation passes. AC12 is now fully met.

## Findings

| # | Severity | File:line | Finding | Suggested fix | Outcome |
| - | -------- | --------- | ------- | ------------- | ------- |
| 8 | HIGH (found while fixing #1) | `apps/commerce-api/src/database/database-client.ts` (`createDatabase`) | **A database session ended while its connection is checked out, between two statements, crashed the process.** `pg-pool` removes its own `error` listener from a client when it hands the client out (`pg-pool/index.js:344`). When the database then ends that session — an admin command or a restart, typically inside an open transaction before `COMMIT` — `pg` emits `'error'` on a client with no listener (`pg/lib/client.js:204`): an uncaught exception, which under Node's defaults kills the API. It was reproduced outside the tests: `UNCAUGHT EXCEPTION: Error: Connection terminated unexpectedly`. Plan §15's `pool.on("error")` handler was meant to prevent exactly this, but it covers only *idle* clients. Not found by either review; it surfaced the first time a test ended a session mid-transaction. | Give each client its own `error` listener when the pool hands it out, once per client. The error still reaches the caller through the client's next statement, and `pg-pool` discards the dead client on release. Map pg's "…is not queryable" message to 503 too. | **fixed** |
| 1 | MEDIUM | `apps/commerce-api/src/database/postgres-transaction-runner.ts:16-17`, `apps/commerce-api/src/database/database-client.ts:76-82` | **Driver errors raised by the order transaction itself are not mapped.** Kysely's `TransactionBuilder.execute` throws the raw driver error when acquiring a connection, `BEGIN`, `COMMIT` or `ROLLBACK` fails (verified by reading `node_modules/kysely/dist/kysely.js`). A failed `ROLLBACK` also *replaces* the error `work` threw. Each repository's own transaction sits inside its `try` and is mapped. `PostgresTransactionRunner.run`, which `OrderService.placeOrder` uses (`order.service.ts:96`), is not. **Consequences:** (a) losing the database at `COMMIT` or `BEGIN` during an order placement is a 500 `INTERNAL_ERROR`, not the 503 `SERVICE_UNAVAILABLE` that AC12 and plan §14 specify for connectivity; (b) `AllExceptionsFilter` logs that raw error's message and stack. That breaks AC12's "logged error carries operation, SQLSTATE and constraint name only". Commit and connection messages carry no row data today (no deferred constraints exist), so this is a contract gap, not an observed PII leak. **Reachability:** the database has to fail between `placeOrder`'s idempotency lookup (which would itself return 503) and the end of the transaction. It is narrow, but it is exactly the failure window the phase exists to handle. **No test covers it.** | In `DatabaseClient.transaction`, record whether the error came from `work`. Rethrow `work`'s own errors unchanged: domain errors, `OrderAlreadyExistsError`, and `PersistenceError`s the repositories already mapped. Map everything else with `toPersistenceError(error, "transaction")`. If a failed rollback masks `work`'s error, prefer the original. Add a test that makes `COMMIT` fail, e.g. terminate the backend with `pg_terminate_backend` from a second connection inside `work`: expect `DatabaseUnavailableError`, and no row written. | **fixed** |
| 2 | LOW | `apps/commerce-api/src/database/persistence.errors.ts:22` | `ERRNO_PATTERN = /^E[A-Z]+$/` rejects `EAI_AGAIN` (underscore), which the same file lists in `UNREACHABLE_ERRNOS` (line 34). A temporary DNS failure (a hostname in `DATABASE_URL`) is therefore reported as 500 with `code unknown`, not 503. Verified: `/^E[A-Z]+$/.test("EAI_AGAIN") === false`. Untested: the test file's `it.each` list omits it. | Use `/^E[A-Z_]+$/`, and add `EAI_AGAIN` to the unreachable `it.each` in `persistence.errors.test.ts`. | **fixed** |
| 3 | NOTE | `apps/commerce-api/src/modules/menu/infrastructure/postgres-menu.repository.ts:28-33` | `listCategories` makes two statements outside a transaction, so under READ COMMITTED a concurrent `db:seed` could make one response mix two menu states (e.g. an item listed under a category read before it moved). Menu data is written only by `db:seed` (development), so this is not reachable in normal use. | Accept, or read both in one statement (or a read-only transaction) if a menu write path is ever added. | no_change_needed: a NOTE; there is no menu write path |
| 4 | LOW (independent) / NOTE (self) | `apps/commerce-api/src/modules/order/infrastructure/postgres-order.repository.ts:138` | Reads use `INNER JOIN order_lines`. An `orders` row with no lines would read as "no such order". That cannot happen through `create`, which writes both in one transaction under an invariant requiring ≥ 1 line. | Add a code comment stating the invariant the `INNER JOIN` relies on (the independent reviewer's suggestion). | **fixed**: comment added above `findOne` |
| 5 | NOTE | `apps/commerce-api/src/database/cli/migrate.ts:36` | The dev CLI prints a failed migration's raw message. A connection failure prints e.g. `connect ECONNREFUSED 127.0.0.1:5432`: a host and port, never the credentials, and the CLI is development-only. | None now. Revisit if the CLI is ever run against a shared database. | no_change_needed |
| 6 | NOTE (scope) | `docs/development/getting-started.md` | Besides the Phase 10 changes, the 10.5 edit corrected lines Phase 9 had left stale ("no Order route", "Order is the next major domain"), in paragraphs it was already editing. Disclosed in the 10.5 report. | Accept, or split into its own docs change. | no_change_needed: for the human to accept |
| 7 | NOTE | `apps/commerce-api/src/config/env.schema.test.ts` | Every existing `parseEnv` call gained `...REQUIRED`, and the defaults test expects the two new fields. That was required: with `DATABASE_URL` mandatory, the rejection tests would otherwise pass merely because the URL was missing. No assertion was removed. | None. | no_change_needed |
| 9 | NOTE (independent) | `apps/commerce-api/src/app.module.test.ts` | `plan.md` §27 and `test-plan.md` list this file as modified, but it was left unchanged. It still passes without a database, because `TestingModule.compile()` never runs `onModuleInit`, so `DatabaseClient`'s boot check never fires and `pg.Pool` never connects — the same reasoning the module binding tests rely on. The deviation from the file list was not stated in the implementation reports. | Record the deviation. | **recorded** here; no code change needed |

## Requirements check (self-review)

| AC | Satisfied by | Verdict |
| --- | --- | --- |
| AC1 | `migrations.db.test.ts`: catalog-level assertions (tables, columns, keys, FKs with delete actions, checks, indexes) plus behavioural constraint tests | Met |
| AC2 | `migrations.db.test.ts` "reversibility and repeatability": up → none → up with an identical schema snapshot, a no-op re-run, and one step down | Met |
| AC3 | `menu-seed.db.test.ts` (7) | Met |
| AC4 | `postgres-menu.repository.db.test.ts` (`toEqual(MENU_SEED)`) and `persistence.e2e.db.test.ts` (equal to the in-memory mapper output) | Met |
| AC5 | `postgres-cart.repository.db.test.ts` (20), including the lock-wait interleaving. Mutation check: removing the version guard fails 5 tests | Met |
| AC6 | `postgres-order.repository.db.test.ts` (16) | Met |
| AC7 | `order-placement.db.test.ts` and `persistence.e2e.db.test.ts` rollback tests. Mutation check: removing `run` fails them. After the fixes, a `COMMIT` failure also rolls back and maps to 503 (`postgres-transaction-runner.db.test.ts`) | Met |
| AC8 | Barrier test (both priced one version → one order + 409), unforced many-request tests, and the HTTP lock-wait test | Met |
| AC9 | Service-level and HTTP tests | Met |
| AC10 | Service-level and HTTP tests | Met |
| AC11 | New-instance tests plus the built `start` walk | Met |
| AC12 | `persistence.errors.test.ts`, the repository 503 tests, the HTTP 503 test with log capture, plus (after the fixes) the transaction-level `COMMIT`, rollback-masking and unreachable-`BEGIN` tests | Met, after fixes #1, #2 and #8 |
| AC13 | `env.schema.test.ts`, `database-client.test.ts`, the HTTP boot test, the built `start` with the database down → exit 1 | Met |
| AC14 | ESLint block, verified with temporary violations; grep | Met |
| AC15 | `pnpm turbo run test --force`: 712 after the fixes, with no database | Met. The independent reviewer confirmed the pre-existing test changes are wiring-only |
| AC16 | `test:db` PASS (111 after the fixes); with no database it FAILs with the `db:up` message (10.1; re-confirmed by the independent reviewer) | Met |
| AC17 | `git diff --stat -- apps/web packages/contracts` is empty; grep | Met |
| AC18 | `/validate` report; docs; ADR-0017; ADR-0004 status | Met |

## Scope check

| Changed file(s) | Serves plan phase | In scope? |
| --- | --- | --- |
| `infrastructure/docker/**`, `apps/commerce-api/{package.json,.env.example,vitest.config.ts,vitest.db.config.ts}`, `pnpm-lock.yaml` | 10.1 (§16, §17, §28) | yes |
| `src/config/{env.schema,test-config}.ts` (+ test) | 10.1 (§15) | yes |
| `src/common/persistence/**`, `src/database/**` (except `menu-seed.ts`, `cli/seed.ts`), `src/common/errors/api-error-codes.ts`, `src/app.module.ts` | 10.1 (§9, §10, §12, §14, §15) | yes |
| `test/db-global-setup.ts`, `test/support/**`, the four `test/*.e2e.test.ts` (wiring; one comment in `order.e2e.test.ts`) | 10.1–10.5 (§17, §20 OD12) | yes |
| `src/database/{menu-seed.ts,cli/seed.ts}` (+ test), menu `postgres-*` (+ test), `menu.module.ts` (+ test) | 10.2 | yes |
| `cart.module.test.ts`, `order.module.test.ts` (wiring in 10.2) | 10.2. The plan named only Menu's module test; these two compile `MenuModule` transitively. Disclosed in the 10.2 report | yes (disclosed extension) |
| cart `postgres-*` (+ test), `cart.module.ts` (+ test) | 10.3 | yes |
| order `postgres-*` (+ test), `order-placement.db.test.ts`, `order.service.ts` (+ test), `order.module.ts` (+ test) | 10.4 | yes |
| `in-memory-*.repository.ts` (×3) | 10.2–10.4: header comments only | yes |
| `eslint.config.mjs`, `test/persistence.e2e.db.test.ts`, `docs/**` | 10.5 | yes (see #6 for `getting-started.md`) |

Nothing unattributable.

## Specialised reviews (self-review)

- **Security: PASS** (after #1; #8 was an availability defect, and it is fixed).
  - **Committed credentials:** only the dev-only `commerce`/`commerce` value, in `compose.yaml`, `.env.example`, one env test fixture and the test-database default. There is no `.env`.
  - **Injection:** there is no `sql.raw` anywhere. The only `sql` templates with interpolation are DDL literals (migration) and `sql.table(...)` over a constant list (`resetDatabase`).
  - **Driver errors:** reduced to code + constraint in every repository (the `detail` drop is tested). #1 is the one path where they are not.
  - **§4.1:** nothing outside `apps/commerce-api` depends on the database, and the Compose port is bound to 127.0.0.1.
  - **PII:** customer data never reaches a log or an error body. Tested, including the HTTP 503 test's log capture.
- **Data / migration: PASS.**
  - **Migrations:** the up/down round trip gives an identical catalog snapshot.
  - **Constraints:** they mirror the domain invariants (line subtotal = unit × quantity, total = subtotal, 1–99 quantities, status set).
  - **OD6:** tested; a cart line survives its menu item's deletion, and the order is refused.
  - **Delete actions:** `CASCADE` only for `cart_lines` → `carts`. `RESTRICT` for items → categories and order lines → orders (tested: `23001`).
  - **Order rollback:** tested, with a mutation check.
  - **Truncation guard:** the database name must end in `_test`, checked twice: in the URL and against `current_database()`.
  - **Seed:** idempotent, never deletes, all-or-nothing (tested).

## Not reviewed

- **Behaviour under real load, or pool exhaustion:** no load test exists. The pool default (10) was not stressed.
- **A migration applied to a populated older schema:** there is only one migration.
- **An unreachable `BEGIN` against a real server:** tested only against an unreachable address (`database-client.test.ts`). A server that accepts connections but fails `BEGIN` itself was not simulated.
- **TLS, role separation, backups:** deferred by ADR-0017, so they are not reviewed.

## Independent review

**Reviewer:** `implementation-reviewer` agent (read-only), 2026-09-25.

**Verdict: APPROVE.** No BLOCKER, HIGH or MEDIUM findings. It raised the
LOW now merged into #4 (a comment for the `INNER JOIN` invariant) and the
NOTE now #9 (`app.module.test.ts` listed but untouched).

**It executed:**

- `pnpm --filter commerce-api test` (313);
- `lint`, `typecheck` and `build`;
- `test:db` (109);
- `test:db` against an unreachable `TEST_DATABASE_URL`: it failed as
  required, with exit 1 and the `db:up` message;
- `git status --short | sha256sum` before and after: identical, so the
  review had no side effects.

**Security verdict: PASS.**

- No real credentials are committed.
- Driver errors are reduced to code and constraint.
- There is no `sql.raw`, `sql.lit` or string-built SQL; the one dynamic
  identifier is `sql.table()` over a fixed list.
- §4.1 holds: nothing outside `apps/commerce-api` has database access.
- Customer data never reaches an error or a log.

**Data/migration verdict: PASS.**

- The migration is reversible to an identical catalog snapshot.
- Every constraint is proven to fire.
- OD6 (no FK from line item ids to the menu) is tested.
- The delete actions match the plan.
- Rollback is proven with genuine fault injection.
- The truncation guard is checked twice.
- The seed is idempotent.

**What it did not re-check:**

- the two menu DB test files, line by line;
- a word-for-word proofread of the docs;
- the manual `start` + `curl` walk;
- a supply-chain audit of the lockfile.

**Reconciliation.** The two reviews do not contradict each other. The
independent pass did not raise #1 or #2. Both are confirmed defects:

- **#1:** verified by reading Kysely's `TransactionBuilder.execute`, then
  reproduced by the new `COMMIT`-failure test, which fails without the fix.
- **#2:** verified by running the pattern.

The independent reviewer's "domain errors are never mis-wrapped" conclusion
holds for the repositories. #1 was the transaction machinery's own errors,
which lie outside every repository's `try`.

## Fixes applied

Instruction: "Wait for the independent review, then fix all findings." The
code changed only in `database-client.ts`, `persistence.errors.ts` and
`postgres-order.repository.ts` (a comment).

| # | Change | Test |
| - | ------ | ---- |
| 1 | `DatabaseClient.transaction` rethrows `work`'s own errors unchanged, and prefers them over a failed ROLLBACK's error. It maps every other error — from acquiring the connection, `BEGIN` or `COMMIT` — with `toPersistenceError(error, "transaction")`. `toPersistenceError` is now idempotent, so an already-mapped `DatabaseUnavailableError` or `PersistenceError` passes through, and a repository's own `catch` cannot downgrade a 503 to a 500. | `postgres-transaction-runner.db.test.ts`: a `COMMIT` after the session was ended → `DatabaseUnavailableError`, nothing committed; work's error kept when ROLLBACK also fails. `database-client.test.ts`: an unreachable database → `DatabaseUnavailableError`, and `work` never runs. `persistence.errors.test.ts`: idempotent mapping. **Mutation:** with the mapping removed, the `COMMIT` and unreachable tests fail. |
| 2 | `ERRNO_PATTERN` → `/^E[A-Z_]+$/`. | `EAI_AGAIN` added to the unreachable `it.each`. |
| 4 | A comment above `PostgresOrderRepository.findOne` stating the ≥ 1 line invariant the `INNER JOIN` relies on. | — |
| 8 | `createDatabase` gives each client its own `error` listener when the pool hands it out (`pool.on("acquire")`, once per client, via a `WeakSet`), logging the code only. pg's "Client has encountered a connection error and is not queryable" is mapped to 503. | The `COMMIT`-failure test ends the session mid-transaction; Vitest fails the run on any uncaught error. **Mutation:** with the listener removed, the run reports `Unhandled Errors` and fails. Also reproduced outside Vitest: before the fix, `UNCAUGHT EXCEPTION`; after, the caller gets `DatabaseUnavailableError` and the pool's next query succeeds. |

**Also corrected:** a comment in `database-client.ts` (from 10.1) said only
`TransactionRunner` calls `transaction()`; the cart and order repositories
call it too, for their own writes.

**Test isolation fix:** the two session-ending tests first used the shared
pool. `pg_terminate_backend` returns before the killed socket closes, so
the dead connection could go back to the pool as idle and fail the next
test's `BEGIN`: "keeps concurrent transactions separate" failed on 4 of 4
runs. Those two tests now use their own pool, closed afterwards. It was then
green on 5 consecutive `test:db` runs.

**Validation after the fixes:**

| Check | Command | Result |
| --- | --- | --- |
| lint, types, test, build | `pnpm turbo run lint typecheck test build --force` | PASS: 24/24 tasks; 712 tests (`commerce-api` 317 = 313 + 4 new) |
| DB suite | `pnpm --filter commerce-api test:db` | PASS: 111 (109 + 2 new), on 5 consecutive runs |
| boundary | `git status --short -- apps/web packages/contracts` | Empty |

`docs/development/getting-started.md`'s test counts were updated to match
(712, and 111).
