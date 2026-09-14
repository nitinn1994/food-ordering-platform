# Getting Started

**Last updated:** 2026-09-14
**Status:** `apps/web` and `packages/contracts/ui-commands` are scaffolded and
working (Phase 1). `apps/ai-service` and `apps/commerce-api` do not exist yet.

---

## Read this first

This file is the project's authoritative record of its own commands, per
`.claude/rules/validation.md`. That rule cuts both ways: a command listed here
must actually exist, and **a command that does not exist must not be listed
here just because it looks plausible.** Every command below has been run and
verified as of this update.

Whichever phase next scaffolds `apps/ai-service` or `apps/commerce-api` must
update this file in the same change. A scaffolding phase that leaves this file
stale has not finished.

## Current state

| | |
| --- | --- |
| Applications | `apps/web` — Next.js, TypeScript, working. `apps/ai-service`, `apps/commerce-api` — empty directories, not scaffolded. |
| Shared packages | `packages/contracts/ui-commands` — Zod schemas, working. `agent-intents`, `api-contracts` — empty, no consumer yet. |
| Dependency manifests | Root `package.json` + `pnpm-workspace.yaml` (pnpm + Turborepo, ADR-0002); `apps/web/package.json`; `packages/contracts/ui-commands/package.json`. |
| Build tooling | Turborepo (`turbo.json`), TypeScript (`tsconfig.base.json`), ESLint flat config (`eslint.config.mjs`), Vitest per package. |
| CI | None. `apps/ai-service` will need its own invocation path when it exists — see ADR-0002's residual risk. |
| Git | Repository initialised; no commits yet. |

## Prerequisites

Verified working with:

| Toolchain | Verified version | Pinned in |
| --------- | ----------------- | --------- |
| Node.js | v24.19.0 | `.nvmrc`, `package.json` `engines` (`>=20.9.0`) |
| pnpm | 12.3.4 | `package.json` `packageManager` |
| Python | not yet installed or needed | `apps/ai-service` does not exist yet |

## Commands

Run from the repository root unless noted. All verified passing as of
2026-09-14 (sub-phase 1.4).

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | `pnpm install` | Verified |
| Type check (all packages) | `pnpm turbo run typecheck` | Verified |
| Lint (all packages) | `pnpm turbo run lint` | Verified |
| Test (all packages) | `pnpm turbo run test` | Verified — 30 tests (11 contracts + 19 web) |
| Build (all packages) | `pnpm turbo run build` | Verified |
| Run `apps/web` in development | `pnpm --filter web dev` | Verified — serves on http://localhost:3000 |

`packages/contracts/ui-commands` has no `dev`/`start` command — it is a
library, not a runnable service. `apps/ai-service` and `apps/commerce-api`
have no commands at all, because they do not exist:

| Task | Command | Status |
| ---- | ------- | ------ |
| `apps/ai-service` — anything | — | `NOT_CONFIGURED` |
| `apps/commerce-api` — anything | — | `NOT_CONFIGURED` |

`NOT_CONFIGURED` means the project has no such check set up. It does not mean
passing, and it does not mean failing. See `.claude/rules/validation.md` for
the full status vocabulary.

One known warning, not a failure: `next build` reports "The Next.js plugin was
not detected in your ESLint configuration." This is expected — the root
ESLint config was kept deliberately minimal (no `next/core-web-vitals`
plugin) per `docs/features/phase-1-web-foundation/plan.md`.

## Repository layout

```text
apps/
  web/            Next.js frontend — scaffolded, working (Phase 1)
    src/app/                page shell (layout, page, globals.css)
    src/components/menu/    CategoryFilter, MenuItemCard, MenuList
    src/components/cart/    CartPanel, CartLine, CartTotal
    src/components/chat/    ChatInput, ChatTranscript
    src/components/dev/     CommandLogPanel (development-only)
    src/lib/commands/       simulate.ts (temporary), dispatch.ts
    src/lib/state/          uiStore.tsx (durable), cartStore.tsx (temporary)
    src/lib/fixtures/       menu.ts (temporary)
    src/lib/money.ts        integer-cents formatting
  ai-service/     Python service — not yet scaffolded
  commerce-api/   NestJS service — not yet scaffolded
packages/
  contracts/
    ui-commands/    scaffolded, working — what the screen should do (ai-service → web)
    agent-intents/  empty — what should happen to commerce (ai-service → commerce-api)
    api-contracts/  empty — request/response shapes (commerce-api → everyone)
infrastructure/
  database/  docker/  kubernetes/     empty; deliberately deferred
docs/
  architecture/  product/  api/  decisions/  development/
  features/phase-1-web-foundation/    requirements.md, plan.md, test-plan.md
.claude/          ForgeFlow — rules, commands, agents, skills, workflows
```

## Before writing any code

Read, in this order:

1. `CLAUDE.md` — the specification of record.
2. [`docs/architecture/system-architecture.md`](../architecture/system-architecture.md)
   — the component boundaries, and specifically §4, which is the part that is
   easy to break by accident.
3. [`docs/architecture/architecture-decisions.md`](../architecture/architecture-decisions.md)
   — what has been decided, and what is merely proposed. A `Proposed` ADR is
   not permission.
4. `.claude/rules/core.md` and `.claude/rules/scope-control.md`.

## Explicitly temporary code

Three modules in `apps/web` are scaffolding, each header-commented with what
replaces them — see
[`docs/product/food-ordering-frontend-mvp.md`](../product/food-ordering-frontend-mvp.md)
§7:

- `src/lib/fixtures/menu.ts` — replaced by `commerce-api` menu reads.
- `src/lib/state/cartStore.tsx` — replaced by `commerce-api` cart ownership.
- `src/lib/commands/simulate.ts` — replaced by real `apps/ai-service` output.

## Next step

Phase 1 (sub-phases 1.1–1.4) is implemented: workspace foundation, the
`ui-commands` contracts package, the menu/cart UI, and the validated command
pipeline with its adversarial rejection path. `apps/commerce-api` and
`apps/ai-service` are the next major phases and have not been planned yet.

Start planning either with `/forge`, which will route it to `/plan`.
