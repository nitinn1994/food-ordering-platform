# Phase 0 Report — Discovery, Architecture Verification, Baseline Planning

**Date:** 2026-09-14
**Revision:** 3 — renamed from `phase-0-report.md` to `phase-0-discovery.md`.
Two previously-open architecture decisions (contract sharing, monorepo tooling)
were resolved by the human and moved into
[`architecture-decisions.md`](./architecture-decisions.md). Sections 6, 8 and
10 updated accordingly.

**Revision:** 2 — re-inspected after the human expanded the directory skeleton
(`packages/contracts/*` and `infrastructure/*` subdirectories added). Sections
1, 4, 5, 7, 8 and 10 updated; all other findings re-verified as still accurate.
**Path:** Full (HIGH — architectural scope), discovery/documentation step only
**Status:** No implementation performed. See "What Was Not Implemented" at the end.

---

## 1. Repository Discovery Report

The repository is a bare skeleton. Nothing has been committed yet (`git log`
reports no commits on `main`); everything currently in the working tree is
staged (`git status` shows every file as `A`).

```text
food-ordering-platform/
├── CLAUDE.md               populated (7.3 KB) — the only spec/architecture source today
├── README.md               EXISTS BUT EMPTY (0 bytes)
├── apps/
│   ├── web/                empty directory, no files
│   ├── ai-service/         empty directory, no files
│   └── commerce-api/       empty directory, no files
├── packages/
│   └── contracts/
│       ├── ui-commands/    empty directory, no files
│       ├── agent-intents/  empty directory, no files
│       └── api-contracts/  empty directory, no files
├── docs/
│   ├── api/                empty
│   ├── architecture/       contains only this report
│   ├── decisions/          empty
│   ├── development/        empty (no getting-started.md yet)
│   └── product/            empty (no product spec exists anywhere)
├── infrastructure/
│   ├── database/           empty directory, no files
│   ├── docker/             empty directory, no files
│   └── kubernetes/         empty directory, no files
└── .claude/                fully populated ForgeFlow installation (see §2)
```

The `packages/contracts/*` and `infrastructure/*` subdirectories were created
by the human between revision 1 and revision 2 of this report. They match the
"Repository Structure" block in `CLAUDE.md` exactly — no drift between the
declared structure and the actual one.

No root-level tooling exists: no `package.json`, no workspace manifest
(`pnpm-workspace.yaml` / `turbo.json` / `nx.json`), no `.gitignore`, no
`LICENSE`. This is expected for a pre-bootstrap repo but is a concrete gap
before any app is scaffolded (a `.gitignore` in particular should exist
*before* the first `npm install` or Python venv creation, or `node_modules`
and `.venv` will get staged).

**Every directory in the tree above is empty of files**, and git does not
track empty directories. `git status` therefore shows no trace of `apps/web`,
`packages/contracts/ui-commands`, `infrastructure/docker`, or any of the
others — the entire folder skeleton exists only in the local working copy and
will not survive a commit-and-clone. See Risks §8, item 9.

## 2. ForgeFlow Verification Result

**Verdict: correctly installed and internally consistent**, with two minor
documentation-reference inconsistencies that do not block usage (I read the
actual files directly rather than relying on the index).

Verified present and non-trivial (line counts 29–113, not stubs):

- Rules: `core.md`, `scope-control.md`, `validation.md`
- Commands: `forge.md`, `plan.md`, `implement.md`, `validate.md`, `review.md`, `final-review.md`, `prepare-pr.md`
- Agents: `repository-inspector.md`, `implementation-reviewer.md`, `validation-reviewer.md`
- Skills: `planning`, `repository-inspection`, `reviewing`, `validation`
- Workflows: `quick-path.md`, `standard-path.md`, `full-path.md`
- Templates: `plan.md`, `pr-description.md`, `requirements.md`, `review-report.md`, `test-plan.md`
- `settings.json` permission guardrails match the "Safety guarantees" section
  of `.claude/README.md` (denies commit/push/merge/rebase/`reset --hard`/`clean -fd`/`gh pr create`/`gh pr merge`/`gh release create`/`kubectl apply|delete`/`terraform apply|destroy`/`docker push`; asks on `rm -rf` and `git checkout`).
- `hooks/` is deliberately empty; `hooks/README.md` explains why (no app code
  or CI yet to guard) — consistent, not a gap.

Inconsistencies found (cosmetic, not functional — reported per scope-control,
not fixed):

- `FOLLOW-UP (not done): .claude/README.md:48 — layout table lists "skills/review/SKILL.md" but the actual path is "skills/reviewing/SKILL.md" — fix the path in the table — LOW`
- `FOLLOW-UP (not done): .claude/README.md:7 — tells the reader to "read ../docs/README.md first" but docs/README.md does not exist (docs/ only has empty subfolders) — create docs/README.md or remove the pointer — LOW`

## 3. Product Scope Summary

There is no separate product specification document — `docs/product/` is
empty. `CLAUDE.md` is currently the sole source of product and architecture
intent. Summary of what it establishes:

- **Product:** a food-ordering platform usable via voice, text, and touch,
  with agent-generated UI driving a Next.js frontend.
- **Three services:** `apps/web` (Next.js UI + voice/chat), `apps/ai-service`
  (Python/LangChain/LangGraph — conversation, tool selection, structured
  intent generation), `apps/commerce-api` (NestJS — menu/cart/order/payment
  domain, validation, authZ, idempotency, DB access).
- **Milestone 1 is explicitly frontend-first and simulation-first.** Real AI
  models, real voice providers, real payments, production auth, Kubernetes,
  production infra, distributed tracing, and multi-region are explicitly
  deferred.
- **Non-negotiable boundaries** (repeated three times in CLAUDE.md, so treated
  as load-bearing): AI service never touches the DB or mutates cart/order
  state directly; all commerce mutations go through the NestJS API; the
  frontend never executes raw AI output, only validated UI commands; the
  backend is authoritative and the frontend always re-syncs from it.

**Gap:** the Phase 0 task asked me to read "the product specification" as a
distinct document — it does not exist. Recommend either promoting relevant
sections of `CLAUDE.md` into `docs/product/product-spec.md`, or explicitly
treating `CLAUDE.md` as the specification of record and saying so in
`docs/README.md` (not yet created either).

## 4. Architecture Review

The three-service split and the stated boundaries are sound and match common
practice for LLM-orchestrated commerce systems: the AI layer is a stateless
orchestrator over HTTP, the commerce API is the single system of record, and
the frontend is a thin renderer of backend-confirmed state plus a validated
command surface. No changes to this shape are recommended.

**Boundary-by-boundary review:**

| Boundary | Contract today | Assessment |
| -------- | --------------- | ---------- |
| Frontend ↔ AI Service | UI commands only, schema-validated | Sound. `packages/contracts/ui-commands/` now exists as a directory but contains no schemas yet; it must be populated before either side is built against it. |
| AI Service ↔ Commerce API | HTTP only, no DB access | Sound. Standard pattern; needs the commerce API to expose a stable read API for menu data and a mutation API for cart/order before ai-service can be built against it. |
| Commerce API ↔ Database | API is sole writer | Sound, and deferred correctly — Phase 1 stubs this out (see §6, Early-Stage Development Notes already say so). |

**Is the monorepo appropriate?** Yes, at this scale (3 apps + 1 shared
contracts package, single team implied, no stated need for independent
release cadences). A monorepo keeps the shared contracts package trivially
importable from TypeScript code and avoids premature versioning/publishing
overhead. The mixed-language aspect (Node + Python in one repo) is normal and
does not argue against a monorepo; it argues for **not** forcing the Python
service into the JS package manager's workspace graph (see §6).

## 5. Recommended Repository Structure

The structure now on disk is correct and requires no structural changes. As of
revision 2 it already includes the three-way split of `packages/contracts/`
(`ui-commands`, `agent-intents`, `api-contracts`) and the three-way split of
`infrastructure/` (`database`, `docker`, `kubernetes`), both matching
`CLAUDE.md`. The split of `contracts/` is the important one: it enforces at the
filesystem level the rule that **business intents and UI commands stay separate
concepts**, so neither can quietly absorb the other.

Two clarifications/additions are recommended, both additive (no renames):

1. **Clarify `docs/architecture/` vs. `docs/decisions/`** — recommend
   `architecture/` holds living documents (this report, future boundary/data-flow
   diagrams) and `decisions/` holds immutable, numbered ADRs (e.g.
   `0001-monorepo-tooling.md`). This is a convention to record, not a folder
   to rename.
2. **`docs/development/getting-started.md` is required before any app is
   scaffolded** — the `repository-inspection` skill and `validation.md` both
   treat it as the authoritative source for bootstrap and validation commands.
   It should be written in the same phase that adds the first app's tooling.

No change recommended to `apps/`, `packages/contracts/`, or `infrastructure/`.

## 6. Technology Decision List (recommendations — not yet implemented)

| Area | Recommendation | Rationale |
| ---- | --------------- | --------- |
| Monorepo tooling | **DECIDED** — pnpm workspaces + Turborepo, scoped to the `apps/web` + `apps/commerce-api` + `packages/contracts` JS/TS subset (ADR-0002) | Lightweight, well-supported for Next.js/NestJS, doesn't force Python into a JS workspace graph it doesn't belong in |
| `apps/web` | Next.js (App Router) + TypeScript | Matches CLAUDE.md directly |
| `apps/commerce-api` | NestJS + TypeScript | Matches CLAUDE.md directly |
| `apps/ai-service` | Python + FastAPI + LangChain + LangGraph | FastAPI is named as the default option in CLAUDE.md's "Setting Up a New App" section; gives the service an HTTP boundary to call the commerce API and to be called by the frontend/gateway |
| `packages/contracts` schema format | **DECIDED** — Zod schemas are the single source of truth; JSON Schema is generated from them as the interchange format; Pydantic models are generated from that for Python (ADR-0003) | Removes hand-duplication between TS and Python entirely, so schema drift becomes structurally impossible rather than test-dependent |
| Simulated DB (Phase 1+ for commerce-api) | In-memory repository behind an interface, not a real DB | Matches "database is simulated" in Early-Stage Development Notes; keeps the swap to Postgres/Prisma later from touching controllers/services |
| Testing | Jest for `apps/web` and `apps/commerce-api` (framework defaults), pytest for `apps/ai-service` | Standard defaults for each framework; to be confirmed once each app is actually scaffolded — currently `NOT_CONFIGURED` |

## 7. Phase 1 Proposal (smallest useful slice)

Per CLAUDE.md's own "Initial Development Scope" (frontend-first,
simulation-first) and "Setting Up a New App" step 4 ("Define contracts
first"), the smallest useful Phase 1 is:

1. **Populate `packages/contracts/ui-commands/`** (the directory now exists,
   empty) — a minimal schema covering only the commands Phase 1 needs (e.g.
   `show_menu`, `add_to_cart`, `show_cart`), plus the package manifest needed
   for `apps/web` to import it. `agent-intents/` and `api-contracts/` stay
   deliberately empty — they have no consumer until ai-service and
   commerce-api exist, and filling them early would mean guessing at
   interfaces.
2. **`apps/web` scaffold** — Next.js + TypeScript, rendering a **simulated**
   menu (static/local fixture data, no backend calls yet) and a cart whose
   state is validated against the `ui-commands` schema even though the
   "commands" are generated locally rather than by a real AI service.
3. **No voice, no AI, no commerce-api, no ai-service yet.** Text-only chat
   input that maps to hardcoded/simulated command output, so the
   command-validation pattern is proven before anything else is built on top
   of it.

Rationale: this is the one slice that lets the riskiest cross-cutting piece
(validated UI commands) get exercised end-to-end with the least amount of
scaffolding, without violating any "do not implement yet" restriction.

This is a **proposal**, not an approved plan — it should go through `/plan`
for its own requirements/plan/test-plan documents before implementation.

## 8. Risks and Open Questions

1. **[RESOLVED in revision 3] Cross-language contract sharing.** Decided:
   Zod → JSON Schema → Pydantic, recorded as ADR-0003. Residual risk: the
   codegen step must run in CI, or generated Python models silently go stale
   against their Zod source. Carry this into the phase that first builds
   `packages/contracts`.
2. **[RESOLVED in revision 3] Monorepo tooling.** Decided: pnpm workspaces +
   Turborepo, recorded as ADR-0002. Residual risk: `apps/ai-service` sits
   outside that workspace graph, so `turbo run` will not see it — Python
   checks need their own invocation path and must still be wired into CI.
3. **[Open question] Frontend freshness strategy** — CLAUDE.md states "the
   frontend refreshes from the backend after every operation" but doesn't say
   how (refetch-after-mutation vs. polling vs. WebSocket). For Phase 1,
   refetch-after-mutation is simplest and sufficient; real-time sync should
   stay explicitly out of scope until stated otherwise.
4. **[Open question] Voice input placeholder.** CLAUDE.md requires a voice
   interface eventually but forbids a real voice provider now. Phase 1 (§7)
   sidesteps this by deferring voice entirely; the first phase that adds any
   voice affordance needs to define what "simulated voice" means (e.g. Web
   Speech API behind a feature flag vs. a disabled UI element).
5. **[Assumption, unverified] Single-team, single-deploy-cadence assumption**
   behind the monorepo recommendation (§4) — stated as likely from context,
   not confirmed by the human.
6. **[Gap] No product spec document, no getting-started.md, no root
   `.gitignore`/workspace manifest/README content** — listed as gaps in §1/§3,
   not fixed here (out of this task's scope).
7. Both `FOLLOW-UP` items in §2 (doc-reference inconsistencies in
   `.claude/README.md`).
8. **Nothing is committed to git yet.** Everything in the working tree is
   staged but uncommitted. Not fixed or flagged as urgent — just noted, since
   an initial commit is a human decision (core rule 10) not taken here.
9. **[New in revision 2] The directory skeleton is invisible to git.** All ten
   structural directories (`apps/*`, `packages/contracts/*`,
   `infrastructure/*`, `docs/*` except `architecture/`) contain no files, and
   git does not track empty directories. Committing now would preserve none of
   them, and a fresh clone would get a flat repo. If the skeleton is meant to
   be the shared, communicated structure, each directory needs a `.gitkeep`
   or a real first file. Recommend deciding this before the initial commit
   rather than after.
   `FOLLOW-UP (not done): repository root — 10 empty structural directories are untracked by git and will not survive a clone — add .gitkeep files, or accept that directories appear as their first real file lands — MEDIUM`
10. **[New in revision 2] `infrastructure/docker/` and
    `infrastructure/kubernetes/` now exist as directories.** This is
    structurally correct per `CLAUDE.md`, but those same technologies are on
    the explicit "do not implement yet" list. An empty directory is a standing
    invitation to fill it. Recommend they stay empty until a phase explicitly
    scopes containerisation, and that `/forge` treat any work inside them as
    HIGH risk (infrastructure dimension) by default.

## 9. Validation Strategy

Current status: **`NOT_CONFIGURED`** across the board. No `package.json`, no
test runner, no linter exists anywhere in the repository yet — there is
nothing to run. This Phase 0 pass performed read-only inspection
(`find`, `wc -l`, `git status`, `git log`, file reads) and produced only this
documentation file; no code-level checks apply.

Once Phase 1 scaffolds `apps/web`, its own `package.json` should declare
lint/typecheck/test scripts, and those become the targeted validation
commands for that phase, per `.claude/rules/validation.md`.

## 10. Files Created or Modified

Revision 1:

- **Created:** `docs/architecture/phase-0-report.md` (this file).
- **Modified:** none.

Revision 2:

- **Modified:** `docs/architecture/phase-0-report.md` (this file) — sections 1,
  4, 5, 7, 8 and 10 updated after re-inspecting the expanded directory
  skeleton.
- **Created:** none.

Revision 3:

- **Renamed:** `docs/architecture/phase-0-report.md` →
  `docs/architecture/phase-0-discovery.md` (content preserved in full).
- **Modified:** this file — sections 6, 8 and 10 updated to reflect the two
  architecture decisions taken by the human.
- **Created alongside it:** `docs/architecture/system-architecture.md`,
  `docs/architecture/architecture-decisions.md`,
  `docs/product/food-ordering-frontend-mvp.md`,
  `docs/development/getting-started.md`.

- **No code, configuration, dependency, or scaffolding changes were made in
  either revision.** The `packages/contracts/*` and `infrastructure/*`
  directories were created by the human, not by this task.

## 11. What Was Not Implemented (explicit)

Per the task's strict scope restrictions, none of the following were done,
and none were started:

- No Next.js app created in `apps/web`.
- No Python service created in `apps/ai-service`.
- No NestJS service created in `apps/commerce-api`.
- No database of any kind created or configured.
- No dependencies installed (no `npm install`, `pip install`, or similar was run).
- No AI functionality implemented.
- No authentication, payments, Docker, or Kubernetes work.
- No `packages/contracts` schemas written.
- No `.gitignore`, workspace manifest, or root `package.json` created.
- No fix applied to the two `.claude/README.md` inconsistencies (§2) or the
  empty root `README.md` (§1) — recorded as follow-ups only.
- Nothing committed, pushed, merged, or deployed.

---

**Next recommended command:** `/plan phase-1-web-scaffold` (or a name of the
human's choosing) to turn §7 into an approved, phased plan before any code is
written.
