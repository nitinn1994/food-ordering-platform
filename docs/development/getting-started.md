# Getting Started

**Last updated:** 2026-09-14
**Status:** Pre-bootstrap. There is nothing to run yet.

---

## Read this first

This file is the project's authoritative record of its own commands, per
`.claude/rules/validation.md`. That rule cuts both ways: a command listed here
must actually exist, and **a command that does not exist must not be listed
here just because it looks plausible.**

Right now the repository contains no application code, no `package.json`, no
`pyproject.toml`, and no CI configuration. Therefore this file lists **no
runnable commands at all**. That is an accurate statement about the project,
not an omission.

Whichever phase first scaffolds an application must update this file in the
same change. A scaffolding phase that leaves this file stale has not finished.

## Current state

| | |
| --- | --- |
| Applications | None. `apps/web`, `apps/ai-service`, `apps/commerce-api` are empty directories. |
| Shared packages | None. `packages/contracts/{ui-commands,agent-intents,api-contracts}` are empty directories. |
| Dependency manifests | None at any level. |
| Build tooling | None. |
| CI | None. |
| Git | Repository initialised; no commits yet. |

Note that every directory in the tree is empty of files, and git does not track
empty directories — the folder skeleton exists only in the working copy.

## Prerequisites

**Not yet pinned.** These are the expected toolchains implied by the
architecture, listed so you know roughly what you will need. Exact versions get
pinned — in `package.json` `engines`, a `.nvmrc`, and a `pyproject.toml` — by
the phase that scaffolds each app. Do not treat the following as declared
project requirements:

| Toolchain | Needed for | Decided in |
| --------- | ---------- | ---------- |
| Node.js | `apps/web`, `apps/commerce-api`, `packages/contracts` | version TBD |
| pnpm | workspace and dependency management | ADR-0002 |
| Python | `apps/ai-service` | version TBD |

## Commands

| Task | Command | Status |
| ---- | ------- | ------ |
| Install | — | `NOT_CONFIGURED` |
| Build | — | `NOT_CONFIGURED` |
| Lint | — | `NOT_CONFIGURED` |
| Type check | — | `NOT_CONFIGURED` |
| Test | — | `NOT_CONFIGURED` |
| Run locally | — | `NOT_CONFIGURED` |

`NOT_CONFIGURED` means the project has no such check set up. It does not mean
passing, and it does not mean failing. See `.claude/rules/validation.md` for
the full status vocabulary.

## Repository layout

```text
apps/
  web/            Next.js frontend — UI, cart presentation, UI command handling
  ai-service/     Python service — conversation, tool calling, intent generation
  commerce-api/   NestJS service — menu, cart, orders, business rules, database
packages/
  contracts/
    ui-commands/    what the screen should do        (ai-service → web)
    agent-intents/  what should happen to commerce   (ai-service → commerce-api)
    api-contracts/  request/response shapes          (commerce-api → everyone)
infrastructure/
  database/  docker/  kubernetes/     empty; deliberately deferred
docs/
  architecture/  product/  api/  decisions/  development/
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

## Next step

No application has been scaffolded. The proposed first phase is the frontend
MVP described in
[`docs/product/food-ordering-frontend-mvp.md`](../product/food-ordering-frontend-mvp.md),
which is a proposal and not yet an approved plan.

Start it with `/forge`, which will route it to `/plan`.
