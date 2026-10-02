# Test Plan — Docker environments (dev, staging, prod)

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1 dev up | `docker compose -f infrastructure/docker/compose.dev.yaml --env-file infrastructure/docker/env/.env.dev up -d --wait`. Then `ps` shows all healthy and the one-shots exited 0. `curl` the menu page and grep the body for "Our Menu" and a demo item. `curl /api/commerce/v1/menu` returns 8 categories | manual (scripted) |
| AC2 hot reload | Edit and revert one harmless string per app (web page text, a commerce-api health detail, an ai-service reply constant); observe it in the response | manual |
| AC3 isolation | Compare host `node_modules`, `apps/ai-service/.venv` and `apps/web/.next` mtimes before and after `up`. `ss -ltn` shows only 127.0.0.1 binds. Host `pnpm dev` still starts once the dev stack is down | manual |
| AC4 dev data | Fresh volume → menu present. Second `up` → `dev-migrate` logs "Already up to date." and an unchanged seed count. `down -v` → gone | manual |
| AC5 staging = prod | `docker compose -f compose.prod.yaml --env-file .env.staging.example config` and the same for prod. Diff the two outputs: only env-derived values and the project name differ | automated (diff) |
| AC6 prod smoke | Self-signed cert in the scratchpad, `--profile local-db`, `up -d --wait` for prod then staging. `curl -k https://127.0.0.1/` greps the body; `/menu/burger.svg` returns 200 `image/svg+xml`. Then `down -v` | manual (scripted) |
| AC7 secrets ignored | Create dummy `.env.dev`, `.env.staging` and `.env.prod` (plus nested `apps/*/.env.staging`). `git check-ignore -v` names the rule for each. `git status --short` lists none. The templates are tracked. Grep the templates for anything other than placeholders | automated (shell) |
| AC8 documented | A script extracts every `${VAR}` from each compose file and checks it appears in the matching template and in `environment-variables.md` | automated (shell) |
| AC9 no regression | The repository's own commands below, plus the host `db:up` / `dev` path | automated |

## New or changed tests

No application test code changes; the app code is untouched beyond a
Dockerfile `COPY`. The verification is the compose and shell checks above.
If OQ2 (a) is approved, a CI step runs `docker compose ... config -q` for
the three environments.

## Validation commands

Declared in `.github/workflows/ci.yml`, the root `package.json` and
`docs/development/getting-started.md`.

| Check  | Command | Expected |
| ------ | ------- | -------- |
| lint / types / test / build | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | PASS (unchanged code) |
| DB suite | `pnpm --filter commerce-api test:db` | PASS |
| ai-service | `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy`, `uv run pytest` | PASS |
| audits | `pnpm audit --audit-level=high`, `uv run pip-audit` | PASS |
| images | the three `docker build` commands from CI | PASS |
| non-root | CI's `docker run --rm --entrypoint id <image> -u` loop | PASS |

`docker compose ... config` / `up` / `ps` / `down` are Docker's own CLI on
files this feature adds, not repository scripts. Their results are reported
as manual checks.

## Manual checks

1. **AC1–AC4 on this machine.** Stop any host dev servers on 3000–3002
   first, or set other ports in `.env.dev`.
2. **AC6.** Use only a throwaway self-signed certificate under the
   scratchpad, never a real key. Tear down with `down -v` afterwards.

## Not covered

- A real staging or prod host, managed PostgreSQL, DNS or a real
  certificate: deployment is out of scope.
- File watching on macOS or Windows hosts: only Linux is available here.
  The polling switches are documented, not tested.
