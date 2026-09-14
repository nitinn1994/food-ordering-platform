# Architecture Decisions

A single running record of the decisions that shape this system, why they were
made, and what they cost.

**Status vocabulary**

| Status | Meaning |
| ------ | ------- |
| `Accepted` | Decided by a human. Binding. Changing it requires a new ADR that supersedes this one. |
| `Proposed` | A recommendation with rationale. **Not binding.** Nothing should be built on it until a human accepts it. |
| `Superseded` | Replaced. The replacement is named. |

> Decisions marked `Proposed` below were *not* approved — they are recorded so
> the open questions live somewhere rather than being forgotten. Do not treat
> a `Proposed` ADR as permission.

**Index**

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](#adr-0001--monorepo-with-three-applications-and-a-shared-contracts-package) | Monorepo with three applications and a shared contracts package | Accepted |
| [0002](#adr-0002--pnpm-workspaces--turborepo-for-the-typescript-graph) | pnpm workspaces + Turborepo for the TypeScript graph | Accepted |
| [0003](#adr-0003--zod-as-contract-source-of-truth-pydantic-generated-for-python) | Zod as contract source of truth, Pydantic generated for Python | Accepted |
| [0004](#adr-0004--simulate-the-database-behind-a-repository-interface) | Simulate the database behind a repository interface | Proposed |
| [0005](#adr-0005--refetch-after-mutation-for-frontend-freshness) | Refetch-after-mutation for frontend freshness | Proposed |
| [0006](#adr-0006--jest-for-typescript-pytest-for-python) | Jest for TypeScript, pytest for Python | Proposed |
| [0007](#adr-0007--defer-voice-entirely-rather-than-stub-a-provider) | Defer voice entirely rather than stub a provider | Proposed |

---

## ADR-0001 — Monorepo with three applications and a shared contracts package

**Status:** Accepted · **Date:** 2026-09-14 · **Source:** `CLAUDE.md`

### Context

The system has three runtime components in two languages, and they must agree
on shared schemas. The alternative is three repositories with contracts
published as versioned packages.

### Decision

One repository: `apps/web`, `apps/ai-service`, `apps/commerce-api`, and
`packages/contracts`.

### Consequences

- A contract change and its consumers land in one reviewable change.
- No package publishing, version negotiation, or cross-repo lockstep releases.
- The repository must not grow additional services without a decision —
  `CLAUDE.md` explicitly forbids unnecessary microservices.
- Independent deploy cadences per app are not free; if that becomes a
  requirement, revisit.

---

## ADR-0002 — pnpm workspaces + Turborepo for the TypeScript graph

**Status:** Accepted · **Date:** 2026-09-14

### Context

`apps/web`, `apps/commerce-api`, and `packages/contracts` share a dependency
graph and need coordinated builds. `apps/ai-service` is Python and shares none
of it. Options considered: npm workspaces alone (zero tooling, no caching or
task orchestration), Nx (most capable, heavier than this project needs), and
pnpm + Turborepo.

### Decision

pnpm workspaces for dependency management, Turborepo for task orchestration
and caching — scoped to the TypeScript subset only.

`apps/ai-service` is deliberately **outside** the workspace graph. It manages
its own Python dependencies and is not a pnpm package.

### Consequences

- Strict dependency isolation: `apps/web` cannot import a transitive
  dependency it did not declare.
- Build caching across `contracts → web` and `contracts → commerce-api`.
- **`turbo run` will not see the Python service.** Its lint, type, and test
  commands need a separate invocation path, and CI must call both. This is the
  main cost of the decision and the most likely thing to be forgotten.
- Contributors need pnpm installed, not just npm.

---

## ADR-0003 — Zod as contract source of truth, Pydantic generated for Python

**Status:** Accepted · **Date:** 2026-09-14

### Context

Three schema families (`ui-commands`, `agent-intents`, `api-contracts`) must be
enforced at runtime in TypeScript (`apps/web` validating agent output,
`commerce-api` validating requests) and in Python (`ai-service` producing
valid intents and commands). Writing them twice by hand means drift, and drift
in `ui-commands` specifically means the frontend silently dropping commands the
agent believes it sent.

Options considered: OpenAPI-first generated from NestJS (natural for
`api-contracts`, awkward for `ui-commands` and `agent-intents`, which are not
HTTP endpoints); hand-maintained parallel Zod and Pydantic kept in sync by
contract tests (no tooling, but drift caught late and only if tests are
thorough).

### Decision

Zod schemas in `packages/contracts` are the single source of truth. JSON Schema
is generated from them as the language-neutral interchange format. Pydantic
models are generated from that JSON Schema for `ai-service`.

```text
Zod (authored)  →  JSON Schema (generated)  →  Pydantic (generated)
```

### Consequences

- Schema drift becomes structurally impossible rather than test-dependent.
- Zod gives runtime validation in TypeScript directly, so `apps/web` gets its
  UI command allowlist enforcement from the same artifact.
- **Generated Python models must never be hand-edited**, and the codegen must
  run in CI. If it only runs locally, the Pydantic models go stale against
  their Zod source and the guarantee evaporates silently.
- Adds a build step and a generated-code review burden. Generated output
  should be committed or generated in CI — that sub-decision is still open.
- Not every Zod construct maps cleanly to JSON Schema (refinements, transforms,
  branded types). Contract schemas must stay in the expressible subset;
  discovering a construct that does not translate is a real risk when the
  schemas grow.

---

## ADR-0004 — Simulate the database behind a repository interface

**Status:** Proposed · **Date:** 2026-09-14

### Context

`CLAUDE.md` defers real persistence. `commerce-api` still needs to behave as
the authoritative owner of cart and order state from the first phase, or every
boundary above it is untested.

### Decision (proposed)

Implement an in-memory store behind an explicit repository interface in
`commerce-api`. Controllers and domain services depend on the interface, never
on the store.

### Consequences

- Swapping to a real database later changes one implementation, not the
  domain layer.
- In-memory state resets on restart — acceptable while simulating, confusing
  if not documented for whoever runs it first.
- Risk: an in-memory store makes transactional semantics look easier than they
  are. Code written against it may assume atomicity the real database will
  need explicit work to provide.

---

## ADR-0005 — Refetch-after-mutation for frontend freshness

**Status:** Proposed · **Date:** 2026-09-14

### Context

`CLAUDE.md` requires that the frontend refresh from the backend after every
operation, but does not say how. Options: refetch after each mutation,
polling, or a WebSocket/SSE push channel.

### Decision (proposed)

Refetch after mutation. No polling, no push channel.

### Consequences

- Simplest thing that satisfies the authority model, and it is correct by
  construction: the displayed cart is always a backend response.
- One extra round trip per mutation. Irrelevant at this scale.
- Does not cover state changing without a local action (another device, an
  order status advancing server-side). If multi-device or live order tracking
  becomes a requirement, this needs revisiting — it is a genuine limitation,
  not a deferral.

---

## ADR-0006 — Jest for TypeScript, pytest for Python

**Status:** Proposed · **Date:** 2026-09-14

### Context

No test tooling exists anywhere in the repository. Both Next.js and NestJS
default to Jest; the Python ecosystem defaults to pytest.

### Decision (proposed)

Adopt framework defaults rather than introducing a third choice. Vitest is a
reasonable alternative for `apps/web` and worth considering when that app is
actually scaffolded.

### Consequences

- Zero friction with framework tooling and documentation.
- Two test runners in one repository, so "run all tests" is two commands —
  reinforcing the CI gap noted in ADR-0002.
- Until a phase actually scaffolds an app, every test command in this
  repository is `NOT_CONFIGURED`. See
  [`getting-started.md`](../development/getting-started.md).

---

## ADR-0007 — Defer voice entirely rather than stub a provider

**Status:** Proposed · **Date:** 2026-09-14

### Context

Voice is a target capability, but `CLAUDE.md` forbids a real voice provider in
the initial scope. That leaves three options: a stubbed provider interface,
a browser-native Web Speech API implementation, or no voice surface at all.

### Decision (proposed)

No voice surface in the MVP. Not a disabled button, not a stub interface.

### Consequences

- Avoids designing an abstraction around a provider whose constraints —
  streaming, latency, interruption, partial transcripts — are unknown. An
  interface guessed now would almost certainly be wrong in the way that
  matters.
- The text path exercises the same conversational contract, so nothing about
  the architecture goes unvalidated by deferring voice.
- Risk: voice added later may demand streaming responses, whereas the text
  path can get away with request/response. If that shapes the `ai-service`
  HTTP contract, better to know before that contract has many consumers.
