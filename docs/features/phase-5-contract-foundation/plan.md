# Plan — Phase 5: UI Command & Business Intent Contract Foundation

**Approval Status:** APPROVED (nitin, 2026-09-19, in conversation)

## Approach

Extend the contract layer the repository already has, rather than starting a
parallel one. `packages/contracts/ui-commands` is working, tested, and consumed
by `apps/web`; this phase hardens it and builds two sibling packages that copy
its shape exactly — same manifest fields, same `exports` pointing at
`./src/index.ts`, same `tsconfig.json` extending `tsconfig.base.json`, same
Vitest config, same `lint`/`typecheck`/`test` scripts.

Three patterns already in the codebase are followed rather than reinvented:

- **Parsers return discriminated results and never throw.** `parse.ts`'s
  `ParseResult` is the precedent; `parseIntent` and `parseBatch` mirror it, so
  a rejection stays an ordinary value the caller must handle.
- **A closed discriminated union plus an exported `*_TYPES` array**, with a
  test asserting the two never drift. `commands.ts` established this; the
  intent package repeats it.
- **Structural impossibility over asserted rules.** `dispatch.ts` is
  deliberately unable to import `cartStore`; by the same logic `apps/web` is
  made unable to import `@contracts/agent-intents`.

The one genuinely new mechanism is JSON Schema emission. Zod 4.6.4 ships
`z.toJSONSchema()` built in — verified by running it — so this adds a script
per package and no dependency at all. ADR-0003 was written when this implied a
separate `zod-to-json-schema` package; that cost has since gone to zero.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `packages/contracts/common/package.json`, `tsconfig.json`, `vitest.config.ts` | new | Package scaffold, copied from `ui-commands` |
| `packages/contracts/common/src/version.ts` | new | `CONTRACT_VERSION`, `contractVersionSchema` |
| `packages/contracts/common/src/ids.ts` | new | Menu item/category ids, correlation id, idempotency key |
| `packages/contracts/common/src/money.ts` | new | `priceCentsSchema`, `quantitySchema` (integer cents, 1…99 cap) |
| `packages/contracts/common/src/metadata.ts` | new | ISO-8601 timestamp, shared envelope fields |
| `packages/contracts/common/src/errors.ts` | new | `contractErrorSchema`, error codes |
| `packages/contracts/common/src/index.ts` | new | Public surface |
| `packages/contracts/common/src/*.test.ts` | new | Primitive acceptance/rejection tests |
| `packages/contracts/common/scripts/emit-schema.ts` | new | JSON Schema generation |
| `packages/contracts/common/schema/error.v1.json` | new (generated) | Committed artifact |
| `packages/contracts/ui-commands/src/commands.ts` | modified | `z.object` → `z.strictObject`; bound `SearchMenu.query`; ids from `common` |
| `packages/contracts/ui-commands/src/envelope.ts` (+ test) | new | `uiCommandBatchSchema`, batch bounds |
| `packages/contracts/ui-commands/src/parse.ts` | modified | Add `parseBatch`; `parseCommand` signature unchanged |
| `packages/contracts/ui-commands/src/index.ts` | modified | Export the envelope and `parseBatch` |
| `packages/contracts/ui-commands/package.json` | modified | Add `@contracts/common` dependency and a `build` script |
| `packages/contracts/ui-commands/src/schema.test.ts` | new | Freshness guard |
| `packages/contracts/ui-commands/scripts/emit-schema.ts` | new | JSON Schema generation |
| `packages/contracts/ui-commands/schema/ui-command.v1.json` | new (generated) | Committed artifact |
| `packages/contracts/agent-intents/` (full package) | new | Manifest, 4 source files, 3 test files, emit script, artifact |
| `apps/web/eslint.config.mjs` **or** root `eslint.config.mjs` | modified | `no-restricted-imports` on `@contracts/agent-intents` (D11) |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0012 |
| `docs/architecture/system-architecture.md` | modified | §6 gains the `common` family and the envelope |
| `docs/development/getting-started.md` | modified | New packages, commands, test count |
| `docs/product/food-ordering-frontend-mvp.md` | modified | §12, Phase 5 additions |
| `docs/api/contracts.md` | new | Worked examples, naming rules, candidate register |

`apps/web/src` is expected to need **zero** changes.

## Phases

### Phase 5.1 — `@contracts/common`
- [ ] Scaffold the package (manifest, tsconfig, vitest config), copying `ui-commands`
- [ ] `version.ts`, `ids.ts`, `money.ts`, `metadata.ts`, `errors.ts`, `index.ts`
- [ ] Tests: each primitive accepts its valid range and rejects outside it
- [ ] `scripts/emit-schema.ts` + committed `schema/error.v1.json`
- **Done when:** the package typechecks, lints, and its tests pass; the artifact
  is generated and committed. (AC1, part of AC7.)

### Phase 5.2 — Harden `ui-commands`
- [ ] `z.object` → `z.strictObject` across `commands.ts`
- [ ] Bound `SearchMenu.query`; source ids from `@contracts/common`
- [ ] `envelope.ts`: `uiCommandBatchSchema` with a capped `commands` array
- [ ] `parse.ts`: add `parseBatch` with per-command validation; leave
      `parseCommand` untouched
- [ ] `scripts/emit-schema.ts`, committed artifact, freshness test
- **Done when:** the new tests pass **and** `apps/web`'s 174 tests still pass,
  unchanged in count and outcome. This is the phase that can break working
  code; the full suite runs before 5.3 starts. (AC4, AC5, AC6, AC9.)

### Phase 5.3 — `@contracts/agent-intents`
- [ ] Scaffold the package
- [ ] `intents.ts`: three intents as a closed union + `AGENT_INTENT_TYPES`
- [ ] `envelope.ts`: request envelope with `idempotencyKey`
- [ ] `parse.ts`: `parseIntent`, same result shape as `parseCommand`
- [ ] Tests: acceptance, rejection, never-throws, allowlist drift, and the
      boundary in **both** directions
- [ ] Emit script, committed artifact, freshness test
- **Done when:** AC2, AC3, and AC6 hold.

### Phase 5.4 — Documentation and the structural guard
- [ ] ADR-0012 (envelope, metadata, versioning, `common`, strict objects)
- [ ] `system-architecture.md` §6; `getting-started.md`; product doc §12
- [ ] `docs/api/contracts.md` — examples plus the candidate register
- [ ] ESLint `no-restricted-imports` for `@contracts/agent-intents` in `apps/web`
- [ ] AC8's source-inspection test
- **Done when:** AC8, AC11, AC12 hold and a full validation run passes.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| Generated schemas go stale | ADR-0003's guarantee silently evaporates — its own named failure mode | Freshness test that fails the suite (AC7); it is the reason the artifacts are committed rather than generated on demand |
| `z.strictObject` breaks an `apps/web` consumer | A working command pipeline regresses | Full suite run at the end of 5.2, before 5.3 begins. If it breaks, stop and report as a scope change — do not absorb the fix |
| Envelope churn when `ai-service` actually lands | Rework, and a v2 sooner than planned | Envelope held to three justified fields; `parseCommand` keeps its signature so the frontend migrates independently |
| Contracts drift from `apps/web`'s own internal types | Two vocabularies for one concept | `apps/web` keeps its local types. Contracts describe the **wire**, not internal state — stated explicitly in ADR-0012 |
| Intents modelled on a simulated frontend rather than a real domain | The contract encodes a simulation's assumptions | Only the three cart intents mirroring implemented behaviour are adopted; everything speculative stays a registered candidate |
| A fourth contract directory contradicts `system-architecture.md` §6 | The architecture doc becomes untrue | D3 + the §6 update land in the same change (5.4) |
| `z.iso.datetime()` emits a large regex into the artifact | Noisy generated files; brittleness across JSON Schema validators | Accepted knowingly (D9); recorded in ADR-0012 so the next reader knows it is deliberate |
| Scope creep into `api-contracts` | Guessing at an interface with no producer | Excluded explicitly (D12); listed in "Not doing" below |

## Assumptions

**Verified by running them** (Zod 4.6.4, this repository):

- `z.toJSONSchema()` exists and emits draft-2020-12.
- `z.object` strips unknown keys while its generated schema says
  `additionalProperties: false` — the divergence this phase fixes.
- `z.strictObject` rejects unknown keys.
- Discriminated unions emit `oneOf` with no `discriminator` keyword.
- `z.iso.datetime()` emits a large regex pattern.
- `minLength`/`maxLength`/`minItems`/`maxItems` survive generation.
- Python 3.12.3 is installed on this machine.

**Believed but not verified:**

- `z.strictObject` breaks nothing in `apps/web` — checked by reading, not by
  running. Sub-phase 5.2 proves or disproves it.
- No Python package manager is available (only `which` was consulted).
- `datamodel-code-generator` will consume these artifacts cleanly — unrunnable
  until `apps/ai-service` exists.
- `turbo.json`'s existing `build` task will pick up a `build` script in the
  contracts packages without further configuration.

## Not doing

- `packages/contracts/api-contracts` — stays empty (D12).
- `PlaceOrder`, `ClearCart` intents; `OpenCheckout`, `ShowOrderConfirmation`
  UI commands (D2, D6, D7, and an outright rejection for the last).
- Any Python, Pydantic, or `apps/ai-service` work.
- Any change to `apps/web/src` — components, stores, `dispatch.ts`,
  `simulate.ts` all stay as they are.
- Authentication, authorization, rate limiting, transport security — there is
  no authorization subject yet (`system-architecture.md` §8 gap 4).
- Renaming the five existing UI commands (D1).

## Specialised review needed?

- **security: yes** — this phase defines the system's primary untrusted-input
  boundary. The review brief is: closed unions, strict objects, bounded
  agent-controlled strings, the batch cap, the "no URL / no import path / no
  HTML sink field" rule, and the structural separation of intents from the
  frontend.
- **performance: no** — schema validation of small payloads; no queries, no
  I/O, no unbounded loops.
- **data / migration: no** — no database, no persistence, no migration, no
  backfill.
