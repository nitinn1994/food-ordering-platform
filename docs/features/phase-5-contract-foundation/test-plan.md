# Test Plan — Phase 5: UI Command & Business Intent Contract Foundation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 — `@contracts/common` exports the primitives and is consumed by both packages | Unit tests per primitive; the other two packages import from it and typecheck | automated |
| AC2 — three intents, closed union, `parseIntent` never throws | Acceptance tests per intent; a never-throws loop over `null`, `undefined`, `42`, `"s"`, `[]`, `{}` | automated |
| AC3 — boundary holds in both directions | `parseCommand` rejects `AddItemToCart`; `parseIntent` rejects `ShowMenuCategory` | automated |
| AC4 — strict objects | Each schema rejects a payload carrying an extra key | automated |
| AC5 — partial batch | A batch of one valid + one invalid command yields exactly one accepted and one rejected | automated |
| AC6 — version rejection | An envelope with `contractVersion: 2` is rejected by the v1 parser | automated |
| AC7 — schema freshness | Regenerate in memory, deep-compare against the committed artifact, fail on difference | automated |
| AC8 — no inexpressible Zod constructs | A test reads the contract source files and asserts no `.transform(`, `.refine(`, `.brand(`, `.catch(` | automated |
| AC9 — bounded strings and arrays | `SearchMenu.query` over its maximum is rejected; a batch over its cap is rejected | automated |
| AC10 — workspace checks pass, `apps/web` unchanged | `pnpm turbo run typecheck lint test build`; the web test count is compared against 174 | automated |
| AC11 — documentation updated | Read the four documents; confirm ADR-0012 exists and §6 names the fourth family | manual |
| AC12 — no app source touched | `git status` / `git diff --stat` shows no change under `apps/web/src`, `apps/ai-service`, `apps/commerce-api` (except the ESLint config) | manual |

## New or changed tests

| Test | Covers | File |
| ---- | ------ | ---- |
| Primitive acceptance / rejection | AC1 | `packages/contracts/common/src/*.test.ts` |
| Error shape | AC1 | `packages/contracts/common/src/errors.test.ts` |
| `common` schema freshness | AC7 | `packages/contracts/common/src/schema.test.ts` |
| Batch envelope: shape, version, cap, partial acceptance | AC5, AC6, AC9 | `packages/contracts/ui-commands/src/envelope.test.ts` |
| Strict-object rejection for each UI command | AC4 | `packages/contracts/ui-commands/src/commands.test.ts` (extended) |
| `ui-commands` schema freshness | AC7 | `packages/contracts/ui-commands/src/schema.test.ts` |
| Intent acceptance / rejection / never-throws / allowlist drift | AC2, AC4 | `packages/contracts/agent-intents/src/intents.test.ts` |
| Boundary in both directions | AC3 | `packages/contracts/agent-intents/src/boundary.test.ts` |
| `agent-intents` schema freshness | AC7 | `packages/contracts/agent-intents/src/schema.test.ts` |
| Expressible-subset source inspection | AC8 | `packages/contracts/common/src/subset.test.ts` |

The existing 16 `ui-commands` tests are **kept as they are**. The five
acceptance cases, the `DeleteAllOrders` rejection, the `AddToCart`-masquerading
rejection, and the never-throws loop all still describe correct behaviour after
this phase; nothing in them is rewritten to accommodate the change.

## Validation commands

Only commands this repository declares — root `package.json`, `turbo.json`, and
`docs/development/getting-started.md`.

| Check | Command | Expected |
| ----- | ------- | -------- |
| install | `pnpm install` | PASS |
| lint | `pnpm turbo run lint` | PASS |
| types | `pnpm turbo run typecheck` | PASS |
| test | `pnpm turbo run test` | PASS — 190 existing plus the new contract tests |
| build | `pnpm turbo run build` | PASS |
| format | — | `NOT_CONFIGURED` — this repository declares no formatter |
| Python checks | — | `NOT_CONFIGURED` — `apps/ai-service` does not exist |
| browser checks | — | `NOT_APPLICABLE` — no UI change in this phase |

Targeted runs during a sub-phase use `pnpm --filter @contracts/<name> test`.
The full table above runs at the end of 5.2 and again at the end of 5.4.

## Manual checks

1. Read `docs/api/contracts.md` and confirm every worked example in it parses —
   the examples are also present as test fixtures, so a stale example is a
   failing test rather than a documentation-only error.
2. Confirm `system-architecture.md` §6 names four contract families, not three,
   and that ADR-0012 explains why.
3. Run `git diff --stat` and confirm nothing under `apps/web/src` changed.

## Not covered

- **Whether the emitted JSON Schema produces usable Pydantic models.**
  Unverifiable until `apps/ai-service` exists. The known wrinkle — discriminated
  unions emitting plain `oneOf` with no `discriminator` keyword — is recorded in
  `requirements.md` rather than tested.
- **Whether the envelope is the right shape for a real agent.** No agent exists.
  The envelope is justified from `system-architecture.md` §3, not from
  observed traffic.
- **Interactive browser verification.** `NOT_APPLICABLE` this phase — nothing
  visual changes. (The browser-tooling gap recorded in Phases 3 and 4 remains
  open for those phases; this phase does not close it and does not need to.)
- **Idempotency semantics.** Phase 5 carries and bounds the field. Retry
  behaviour belongs to `commerce-api` and stays `system-architecture.md` §8
  gap 3.
