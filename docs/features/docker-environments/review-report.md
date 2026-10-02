# Review Report — docker-environments

**Reviewed:** `requirements.md`, `plan.md` (approved 2026-10-02, OQ1–OQ5 (a),
Phase 3 decision), `git diff` of the 7 modified files, and the untracked
`compose.dev.yaml`, `dev/*.Dockerfile`, `env/.env.{dev,staging,prod}.example`
and `docs/operations/environment-variables.md`. Independent pass by the
`implementation-reviewer` agent; every finding below was then re-checked
by hand, and finding 1 by a runtime probe.
**Path:** Full

## Verdict

Sound and in scope; no BLOCKER or HIGH. Two MEDIUM findings are claims in
the docs (and one compose comment) that the files do not back. Fix them, or
consciously accept them, before merge.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM | `infrastructure/docker/compose.dev.yaml:18-20`; `docs/development/getting-started.md` ("the host's `apps/commerce-api/.env` is not read"); ADR-0028 item 2 | The host `.env` **does** reach the dev containers. vite-node's CLI calls `loadEnv(mode, envDir, "")` and fills every key compose did not set (`vite-node/dist/cli.mjs:80-84`). Runtime probe in the dev container: Vite loads all of `apps/commerce-api/.env`, and `TEST_DATABASE_URL` leaks today. Any key added to the host `.env` later (e.g. `DATABASE_SSL=verify-full`) would silently change dev-migrate and commerce-api. AC3's isolation claim is overstated. | Either shadow the files in the container (e.g. point Vite's `envDir` at an empty directory via a dev-only vite-node `--config`/`--root`, or mount an empty file over `/repo/apps/commerce-api/.env`), or reword the compose header, getting-started and ADR to "values set by compose win; other keys in the host `.env` are still loaded". |
| 2 | MEDIUM | `docs/operations/production-runbook.md:195, 218`; ADR-0028 item 1 (`architecture-decisions.md:2288`); `.env.staging.example:18`; `environment-variables.md:47` | "Same images… promote the same tag" does not hold. `compose.prod.yaml` builds on each host (`build:` + `image: …:${RELEASE_TAG}`), and there is no registry, so prod rebuilds from source under the same tag. The image prod runs is not byte-for-byte the one staging tested. | State it plainly: promote the same **commit**, both hosts build from it with the same pinned bases, and pushing one tested image through a registry is a follow-up (registry is out of scope). |
| 3 | LOW | `infrastructure/docker/env/.env.{dev,staging,prod,dev.example}.__probe`, `apps/web/.env.staging.__probe`, `apps/ai-service/.env.prod.__probe` | Six empty probe files left from the Phase 1 ignore test (the cleanup glob `*.__probe` did not match dotfiles). Git-ignored, so clutter only. | Delete them. |
| 4 | LOW | `docs/operations/production-runbook.md:118` | The §3 `install` example lacks `-o deploy` (the template header has it), so the file ends up root-owned `0600`, unreadable by a non-root deploy user, and `install` does not create `/etc/fop/prod`. | Match the template: `sudo install -D -m 0600 -o deploy …` (`-D` creates the directory). |
| 5 | LOW | `.github/workflows/ci.yml:133-142` | The compose `config -q` step sits in the job named "Production images — build only, never pushed". It works, but it isn't an image build. | Rename the job, or move the step to its own small job. |
| 6 | LOW | `docs/features/docker-environments/plan.md` (Suggested values) | The plan's table is stale against what was built and documented: `/etc/food-ordering/...` vs `/etc/fop/...`, `openssl rand -base64 32` vs `-hex 32`, and a `LOG_FORMAT` row for staging/prod that `compose.prod.yaml` doesn't read. Templates and `environment-variables.md` agree with each other. | Update the plan table, or add a note that it was superseded during implementation. |
| 7 | LOW | `infrastructure/docker/compose.dev.yaml` (commerce-api `restart: unless-stopped`) | Accepted Phase 3 trade-off with an undocumented side effect: a real startup failure (bad env, database down) now restart-loops and `up --wait` waits instead of failing fast. | Add one troubleshooting line: "commerce-api keeps restarting → `$C logs commerce-api`". |
| 8 | NOTE | `compose.dev.yaml` (`deps-node`, `user: "0:0"`, repo mounted read-write) | A dependency install script running as root could write root-owned files into the source. None exist now (checked), the install is `--frozen-lockfile`, and pnpm only runs build scripts listed under `allowBuilds` (`@swc/core`, `esbuild`). | None required; possible later hardening: run the install as `DEV_UID` with the volumes pre-owned. |

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `.gitignore` | Phase 1 (D2, AC7) | yes |
| `apps/web/Dockerfile` | Phase 1 (D1, AC6) | yes |
| `infrastructure/docker/env/.env.staging.example`, `.env.prod.example` | Phase 2 (AC5, AC8) | yes |
| `infrastructure/docker/compose.prod.yaml` | Phase 2 (comments only) | yes |
| `infrastructure/docker/compose.dev.yaml`, `dev/node.Dockerfile`, `dev/python.Dockerfile`, `env/.env.dev.example` | Phase 3 (AC1–AC4) | yes |
| `.github/workflows/ci.yml` | OQ2 (a), Phase 3 | yes (added to the plan's file table at approval) |
| `docs/operations/environment-variables.md` | Phase 4 (AC8) | yes |
| `docs/development/getting-started.md` | Phase 4 | yes |
| `docs/operations/production-runbook.md` | Phase 4 | yes |
| `docs/architecture/architecture-decisions.md` (ADR-0028) | Phase 4 | yes |
| `docs/features/docker-environments/*` | plan, approval record, this report | yes |

No app code changed beyond the web Dockerfile `COPY`. Prod hardening is
untouched.

## Acceptance criteria

| AC | Status | Basis |
| --- | --- | --- |
| AC1 dev up | met | Phase 3 run: all healthy, "Our Menu" + demo item, 8 categories |
| AC2 hot reload | met within the Phase 3 decision | web and ai-service on any save; commerce-api on in-place saves, via a container restart |
| AC3 dev isolation | **partly**: volumes, ownership and loopback ports met; the "host `.env` not read" part fails (finding 1) | snapshot diff; runtime `loadEnv` probe |
| AC4 dev data | met | fresh volume migrated and seeded; second `up` "Already up to date."; `down -v` reset |
| AC5 staging = prod shape | met for configuration; the "same images" wording overstates it (finding 2) | `config` for both; distinct project names, networks, volumes |
| AC6 prod smoke | met | both stacks healthy; `/menu/burger.svg` 200 `image/svg+xml`; non-root |
| AC7 secrets cannot be committed | met | `git check-ignore`; templates tracked; `CHANGE_ME` only |
| AC8 values documented | met | every variable each compose file reads is in its template and the reference |
| AC9 nothing regresses | met | full CI suite PASS (`/validate`); host workflow run |

## Not reviewed

- No real staging or prod host: real certificates, DNS, managed PostgreSQL
  with `verify-full`, and a non-root deploy user were not exercised.
- Hot reload and polling on macOS, Windows and native Docker Engine.
- CI on GitHub's runners: the new step ran locally only.
- CPU cost of polling over a long dev session.

## Fixes applied (2026-10-02, at the user's request: "Fix it")

| # | Outcome | What changed | Verified by |
| - | ------- | ------------ | ----------- |
| 1 | fixed | Reworded the claim in `compose.dev.yaml`'s header, getting-started and ADR-0028: compose's values win, and other keys in the host `.env` still load. Also made "compose's values win" actually true: commerce-api and dev-migrate now pin every variable `env.schema.ts` reads. That adds `DATABASE_SSL=disable`, `DATABASE_STATEMENT_TIMEOUT_MS=10000`, `ALLOW_LOOPBACK_DATABASE=false` and `TRUST_PROXY_HOPS=0` (the schema's defaults), plus `HOST`/`PORT` on dev-migrate. | `config` shows no schema variable left unset in either service; the runtime `loadEnv` probe leaks only `TEST_DATABASE_URL`, which nothing reads; the dev stack comes up healthy with 8 categories |
| 2 | fixed | The runbook (Staging intro, step 5), ADR-0028 (item 1 and Consequences), the `.env.staging.example` header and `environment-variables.md` now say "the same commit, rebuilt on each host", with a registry as the follow-up | by reading |
| 3 | fixed | Deleted the six empty `*.__probe` files | `find` returns 0 |
| 4 | fixed | Runbook §3 and both template headers: `sudo install -D -m 0600 -o deploy …` | `install -D -m 0600` into the scratchpad created the directory and a `600` file. `-o deploy` was not run (needs sudo and a `deploy` user). |
| 5 | fixed | Compose check moved to its own CI job, `compose` ("Compose files — dev, staging and prod resolve"); the `images` job is back to builds only | `ci.yml` parses; the job's step, run locally, exits 0 |
| 6 | fixed | `plan.md` "Suggested values" now carries a note saying the table was superseded, and how | by reading |
| 7 | fixed | getting-started troubleshooting: "`up --wait` hangs, or commerce-api keeps restarting" | by reading |
| 8 | no_change_needed | NOTE only | — |
