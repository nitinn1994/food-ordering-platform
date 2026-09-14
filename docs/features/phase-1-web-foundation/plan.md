# Plan — Phase 1: Next.js Frontend Foundation

**Approval Status:** APPROVED (nitin, 2026-09-14)

## Approach

Build outward from the boundary rather than inward from the UI. The contracts
package comes first and is unit-tested in isolation, so the allowlist is proven
before anything renders. The app is then scaffolded against it, and the UI is
added last — which means the riskiest work is finished while the phase still
has room to absorb a surprise.

The repository has no existing code to match, so the conventions this phase
establishes become the project's conventions. They follow the structure
declared in `CLAUDE.md` and the boundaries in `system-architecture.md`; nothing
here invents a new architectural pattern.

One structural choice does real work: `dispatch.ts` has no import of
`cartStore`, so a UI command physically cannot mutate the cart. This turns
`system-architecture.md` §4.4 from a rule people must remember into one the
test suite checks.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `package.json` | new | Workspace root, pins packageManager |
| `pnpm-workspace.yaml` | new | Declares `apps/*`, `packages/contracts/*` |
| `turbo.json` | new | lint / typecheck / test / build pipelines |
| `.gitignore` | new | Must exist before the first install |
| `.nvmrc` | new | Pins Node 24 |
| `tsconfig.base.json` | new | Shared compiler options |
| `eslint.config.mjs` | new | Flat config, typescript-eslint |
| `packages/contracts/ui-commands/package.json` | new | `@contracts/ui-commands` |
| `packages/contracts/ui-commands/tsconfig.json` | new | Extends base |
| `packages/contracts/ui-commands/src/commands.ts` | new | Zod discriminated union — the allowlist |
| `packages/contracts/ui-commands/src/parse.ts` | new | `parseCommand()` → Accepted \| Rejected, never throws |
| `packages/contracts/ui-commands/src/index.ts` | new | Public surface |
| `packages/contracts/ui-commands/src/commands.test.ts` | new | Valid / unknown-type / malformed cases |
| `apps/web/package.json` · `tsconfig.json` · `next.config.ts` · `vitest.config.ts` | new | App tooling |
| `apps/web/src/app/{layout,page}.tsx` · `globals.css` | new | App shell |
| `apps/web/src/components/menu/*` | new | MenuList, MenuItemCard, CategoryFilter |
| `apps/web/src/components/cart/*` | new | CartPanel, CartLine, CartTotal |
| `apps/web/src/components/chat/*` | new | ChatInput, ChatTranscript |
| `apps/web/src/components/dev/CommandLogPanel.tsx` | new | Makes accept/reject observable |
| `apps/web/src/lib/commands/dispatch.ts` | new | Validated command → UI action |
| `apps/web/src/lib/commands/simulate.ts` | new | **Temporary** — utterance → hardcoded command |
| `apps/web/src/lib/fixtures/menu.ts` | new | **Temporary** — fixture menu |
| `apps/web/src/lib/state/uiStore.tsx` | new | Durable UI state |
| `apps/web/src/lib/state/cartStore.tsx` | new | **Temporary** — local cart |
| `apps/web/src/lib/money.ts` | new | Integer-cents formatting |
| `docs/development/getting-started.md` | modified | Replace `NOT_CONFIGURED` rows with real commands |

## Phases

### Phase 1.1 — Workspace foundation + contracts package
- [ ] Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`, `tsconfig.base.json`, `eslint.config.mjs`
- [ ] `@contracts/ui-commands`: three display-only commands as a Zod discriminated union
- [ ] `parseCommand()` returning a discriminated result, never throwing
- [ ] Unit tests: valid command, unknown `type`, malformed payload
- [ ] `pnpm install`
- **Done when:** `pnpm turbo run typecheck lint test` exits 0 with the contracts tests passing. No app exists yet.

### Phase 1.2 — Next.js app scaffold
- [ ] `apps/web` with App Router, TypeScript, CSS Modules, Vitest
- [ ] Import `@contracts/ui-commands` through the workspace (AC7)
- [ ] Minimal page proving the import resolves at build time
- **Done when:** `pnpm turbo run build` exits 0 and `pnpm --filter web dev` serves a page.

### Phase 1.3 — Menu and cart from fixtures
- [ ] Fixture menu module, header-commented as temporary
- [ ] `uiStore` and `cartStore` as separate contexts
- [ ] Menu, cart, and total components; integer-cents money formatting
- **Done when:** AC1 and AC2 hold — the touch journey works end to end.

### Phase 1.4 — Command pipeline
- [ ] `simulate.ts`, `dispatch.ts`, `CommandLogPanel`
- [ ] Wire chat input through `parseCommand` → `dispatch`
- [ ] Tests for AC4, AC5, AC8
- [ ] Update `getting-started.md` (AC10)
- **Done when:** AC3–AC10 hold and the full validation set exits 0.

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| A cart-mutating UI command is added later, voiding boundary §4.4 | High — the agent gains a write path skipping `commerce-api` | Test asserting `dispatch.ts` never imports `cartStore` (AC8) |
| Client-side total calculation contradicts the authority model | Medium — pricing logic accretes on the client | Confined to `money.ts` + `cartStore`, both header-commented; recorded as debt in `getting-started.md` |
| The temporary cart store becomes permanent | Medium — painful migration when `commerce-api` lands | Separate store, separate files, listed in the phase report as scheduled for deletion |
| Fixture menu shape becomes the de facto API contract | Medium | Kept minimal — no modifiers, variants or combos; flagged as an input to `commerce-api` design |
| `create-next-app` silently decides ESLint, styling, aliases | Low | Pin choices explicitly; review the generated tree before building on it |
| Next.js 15+ App Router requires care mixing Server and Client Components with Context | Medium — stores are client-only | Store providers marked `"use client"`; page shell stays a Server Component |

## Assumptions

Both were **verified** on 2026-09-14 before implementation started:

- Node.js is available — confirmed, **v24.19.0**.
- pnpm is available — confirmed, **12.3.4**.

Still unverified:

- Network access permits installing dependencies from the npm registry. If it
  does not, Phase 1.1 stops at the blocker and nothing further runs.

## Not doing

- Any backend or AI service, stubbed or otherwise.
- Voice, in any form.
- `agent-intents` / `api-contracts` schemas.
- The Python codegen half of ADR-0003.
- CI configuration — noted as the place ADR-0002's Python gap must eventually
  be closed, but not this phase.
- Committing anything.

## Specialised review needed?

Standard Path, so this section is informational only.

- security: no — no auth, secrets, network calls, or user data. The untrusted
  input path (agent commands) is the phase's subject and is covered by AC4–AC6.
- performance: no — fixture data, single page, no queries.
- data / migration: no — no persistence of any kind.
