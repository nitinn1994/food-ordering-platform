# Plan — Docker environments (dev, staging, prod)

**Approval Status:** APPROVED (2026-10-02; OQ1–OQ5: option (a) for each)

## Approach

Build on what exists instead of adding a parallel setup (`core.md` rule 6):

- **Staging and prod share `compose.prod.yaml`** (Phase 18, unchanged in
  shape). The environment is the env file: it sets `COMPOSE_PROJECT_NAME`,
  so staging and prod never share containers, networks or volumes. It also
  sets `RELEASE_TAG`, `DATABASE_URL`, `DATABASE_SSL`, `TLS_CERT_DIR` and log
  levels. One file means staging really tests what prod runs.
- **Dev gets its own `compose.dev.yaml`.** Hot reload needs things prod
  must never have: mounted source, dev servers and writable filesystems. It
  does not reuse the hardened prod services.
- **`compose.yaml` (DB only) stays** for the host workflow. `db:up` and
  `test:db` depend on it.

### Dev stack design

```text
  host (bind mount, read-write)              container-only volumes
  ./  ──────────────► /repo                  node_modules (root + 6 workspaces)
                                             ai-service venv  (/opt/venv)
                                             web .next        (/repo/apps/web/.next)
                                             dev-pgdata

  deps (one-shot)  pnpm install --frozen-lockfile; uv sync --locked
     │
  postgres ──healthy──► dev-migrate (one-shot)  db:migrate && db:seed (demo menu)
     │                        │
     └────────────────► commerce-api   vite-node --watch    :3001
                              ▲
                        ai-service     uvicorn --reload     :3002
                              ▲
                        web            next dev -H 0.0.0.0  :3000
  published: 127.0.0.1:${WEB_PORT:-3000}, ${COMMERCE_API_PORT:-3001},
             ${AI_SERVICE_PORT:-3002}, ${DEV_DB_PORT:-5433}
```

- **One small dev image per toolchain**, never used for staging or prod:
  - `infrastructure/docker/dev/node.Dockerfile`: the same pinned Node image
    as the app images, plus `pnpm@12.3.4`;
  - `infrastructure/docker/dev/python.Dockerfile`: the same pinned Python
    and uv.
  - The source is not copied into them; it is mounted.
- **Container-only volumes** cover `node_modules`, the venv (via
  `UV_PROJECT_ENVIRONMENT=/opt/venv`) and `apps/web/.next`. Linux-built
  dependencies never overwrite the host's. A containerized `next dev` never
  shares `.next` with a host `next build`, which avoids the corruption seen
  in mcdelivery-redesign (memory note "next build breaks running next dev").
- **Commands** use the repository's own entry points with container
  settings:
  - commerce-api: `pnpm --filter commerce-api dev` with `HOST=0.0.0.0`.
  - ai-service: `uv run python -m ai_service --reload` with `HOST=0.0.0.0`.
  - web: `pnpm --filter web exec next dev -H 0.0.0.0`. The package script
    hard-codes `-H 127.0.0.1`, which is unreachable from outside a
    container; ports are still published on 127.0.0.1 only.
- **Service URLs inside the network:** `COMMERCE_API_URL=http://commerce-api:3001`
  and `AI_SERVICE_URL=http://ai-service:3002`.
- **File watching:** native inotify on Linux. `WATCHPACK_POLLING` and
  `CHOKIDAR_USEPOLLING` switches exist for macOS/Windows hosts.

## Affected files

| File | Change | Why |
| ---- | ------ | --- |
| `.gitignore` | modified | Ignore `.env.*` everywhere, keep `!*.example` (D2, AC7) |
| `apps/web/Dockerfile` | modified | `COPY apps/web/public` into the runtime image (D1, AC6) |
| `infrastructure/docker/compose.dev.yaml` | new | The hot-reload dev stack (AC1–AC4) |
| `infrastructure/docker/dev/node.Dockerfile`, `dev/python.Dockerfile` | new | Dev toolchain images (no source copied) |
| `infrastructure/docker/env/.env.dev.example`, `.env.staging.example`, `.env.prod.example` | new | Templates with suggested values (AC8) |
| `infrastructure/docker/compose.prod.yaml` | modified (comments only) | Header: "staging and prod", the env-file usage, and `COMPOSE_PROJECT_NAME`. No service or setting changes |
| `.dockerignore` | unchanged (checked) | It already excludes `**/.env*` and `infrastructure` from every image build context |
| `docs/development/getting-started.md` | modified | "Run everything in Docker (dev)": commands, ports, reset, troubleshooting |
| `docs/operations/production-runbook.md` | modified | Staging: provisioning checklist, env file, deploy, seed, smoke |
| `docs/operations/environment-variables.md` | new | Per-variable reference: dev / staging / prod suggested values, secret or not, where it comes from |
| `docs/architecture/architecture-decisions.md` | modified | ADR-0028: environments, shared prod compose, dev isolation |
| `.github/workflows/ci.yml` | modified | One step: `docker compose ... config -q` for dev, staging and prod against the example templates (OQ2 (a), approved 2026-10-02; done in Phase 3) |

## Phases

### Phase 1 — Secret hygiene and the image fix
- [x] `.gitignore`: ignore `.env.*` (all levels), keep `!.env*.example` and
  `!**/.env*.example`. Prove it with `git check-ignore` on dummy files.
- [x] `apps/web/Dockerfile`: copy `apps/web/public` to `./apps/web/public`
  in the runtime stage.
- **Done when:** AC7's ignore checks pass. The web image serves
  `/menu/burger.svg` with status 200 from a locally run container.

### Phase 2 — Staging and prod env templates on the shared compose
- [x] `.env.staging.example` and `.env.prod.example`, listing every
  variable `compose.prod.yaml` reads. Suggested values below; secrets are
  `CHANGE_ME` with a generation hint.
- [x] Header comment in `compose.prod.yaml` for staging usage.
- [x] Verify `docker compose -f compose.prod.yaml --env-file <file> config`
  for both, and that the project name comes from the env file.
- [x] Smoke both with `--profile local-db` and a throwaway self-signed
  certificate in the scratchpad, then tear down with `down -v`.
- **Done when:** AC5 and AC6 hold.

### Phase 3 — Hot-reload dev stack
- [x] The dev Dockerfiles, `compose.dev.yaml` and `.env.dev.example`.
- [x] The `deps` and `dev-migrate` one-shots, and healthchecks on every
  long-running service.
- [x] Verify AC1–AC4, including one hot-reload edit per app (reverted).
- **Done when:** AC1–AC4 and AC9 hold.

**Phase 3 finding and decision (2026-10-02).** Docker Desktop's file
sharing keeps serving a file's old contents after a rename-style ("atomic")
save until the directory is listed inside the VM. web (watchpack polls by
listing directories) and ai-service (StatReload) recover; commerce-api's
chokidar polling does not. Separately, `vite-node --watch` re-runs
`main.ts` in-process and exits with EADDRINUSE, in the host workflow too.
Decided by the user: option 1 — polling is the dev default, commerce-api
gets `restart: unless-stopped` so a reload becomes a container restart, and
the rename-save limit is documented (in-place saves, or `restart
commerce-api`). Follow-up: fix the in-process reload in `main.ts`.

### Phase 4 — Docs and ADR
- [x] `environment-variables.md`, getting-started, runbook, ADR-0028.
- **Done when:** AC8 holds, and every documented command was run.

## Suggested values (summary; the templates hold the full set)

> **Superseded during implementation (2026-10-02).** The templates and
> `docs/operations/environment-variables.md` are authoritative. They differ
> from this table in three places: `TLS_CERT_DIR` is `/etc/fop/<env>/certs`,
> matching the existing runbook; the password hint is `openssl rand -hex 32`
> (base64's `/ + =` break a URL); and there is no staging/prod `LOG_FORMAT`
> row, because `compose.prod.yaml` does not read it (the images default to
> `json`).

| Variable | dev | staging | prod | Secret? |
| --- | --- | --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `food-ordering-platform-dev` | `food-ordering-platform-staging` | `food-ordering-platform-prod` | no |
| `RELEASE_TAG` | — | release under test, e.g. `2026.10.02-rc1` | the promoted tag, e.g. `2026.10.02` (never `latest`) | no |
| `POSTGRES_PASSWORD` (dev db) | `commerce` (dev placeholder) | — | — | dev only |
| `DATABASE_URL` | `postgres://commerce:commerce@postgres:5432/commerce` | `postgres://commerce_app:CHANGE_ME@staging-db.<provider>:5432/commerce_staging` | `postgres://commerce_app:CHANGE_ME@prod-db.<provider>:5432/commerce` | **yes** (password: `openssl rand -base64 32`) |
| `DATABASE_SSL` | unset (`disable`) | `verify-full` | `verify-full` | no |
| `DATABASE_POOL_MAX` | `5` | `5` | `10` (≤ the provider's connection limit ÷ instances) | no |
| `COMMERCE_LOG_LEVEL` | `debug` | `debug` | `log` | no |
| `AI_LOG_LEVEL` | `DEBUG` | `INFO` | `INFO` | no |
| `LOG_FORMAT` | `pretty` | `json` (image default) | `json` | no |
| `AGENT_TURN_TIMEOUT_SECONDS` | `20` | `20` | `20` (keep below web's 30 s) | no |
| `AGENT_MAX_CONCURRENT_TURNS` | `4` | `8` | `16` | no |
| `TLS_CERT_DIR` | — | `/etc/food-ordering/staging/certs` | `/etc/food-ordering/prod/certs` | the key file is |
| `LOCAL_DB_PASSWORD` | — | smoke tests only | smoke tests only | throwaway |
| `WEB_PORT` / `COMMERCE_API_PORT` / `AI_SERVICE_PORT` / `DEV_DB_PORT` | `3000` / `3001` / `3002` / `5433` | — | — | no |
| `WATCHPACK_POLLING`, `CHOKIDAR_USEPOLLING` | `false` (`true` on macOS/Windows) | — | — | no |

## Risks

| Risk | Impact | How it is handled |
| ---- | ------ | ----------------- |
| A real secret is committed | credential leak, hard to undo | `.gitignore` fix first (Phase 1), `git check-ignore` proof, `CHANGE_ME` in templates. `.dockerignore` already keeps env files out of images |
| Staging and prod share a project name on one host by mistake | one overwrites the other | `COMPOSE_PROJECT_NAME` set in each template. Docs say staging runs on its own server anyway |
| Dev containers clobber the host's `node_modules`, `.venv` or `.next` | broken host workflow (seen before) | Container-only volumes for all three (AC3) |
| Dev ports clash with dev servers already running on the host (this machine often has 3000–3002 in use) | `up` fails with "port already allocated" | Ports overridable in `.env.dev`, DB on 5433 by default, and a troubleshooting note |
| Bind-mount file watching misses changes on macOS/Windows | no hot reload | Polling switches in `.env.dev` |
| A prod image change breaks CI | red CI | Phase 1 only adds a `COPY`. CI's image builds and non-root check run in validation |
| Compose `name:` vs `COMPOSE_PROJECT_NAME` precedence differs from expectation | staging uses the prod project name | Verified with `docker compose config` in Phase 2 before relying on it. The fallback is `-p` in the documented commands |

## Assumptions

- **Verified:**
  - `compose.prod.yaml` reads only `RELEASE_TAG`, `TLS_CERT_DIR`,
    `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_POOL_MAX`,
    `COMMERCE_LOG_LEVEL`, `AI_LOG_LEVEL`, `AGENT_TURN_TIMEOUT_SECONDS`,
    `AGENT_MAX_CONCURRENT_TURNS` and `LOCAL_DB_PASSWORD`.
  - `.dockerignore` excludes `**/.env*` and `infrastructure/`.
  - nginx uses `server_name _`, so no hostname is hard-coded and the same
    config serves staging.
  - The web runtime stage does not copy `public/` (D1).
  - `.gitignore` misses `.env.staging` and `.env.prod` (D2).
  - The app schemas (`env.schema.ts`, `config.py`) accept the suggested
    values.
- **Not verified:**
  - That `pnpm install` inside a container with mounted workspace
    `node_modules` volumes resolves every workspace symlink. Checked first in
    Phase 3; fallback is a single volume mounted at the repo root with
    `node-linker=hoisted` for dev only.
  - That `vite-node --watch` sees bind-mount changes without polling on this
    host.

## Open questions (recommendation first)

- **OQ1 dev ports:** (a, recommended) the same defaults as the host workflow
  (3000/3001/3002), DB on 5433 so it can run beside `compose.yaml`'s 5432,
  all overridable. (b) Shift everything, e.g. 4000–4002.
- **OQ2 CI:** (a, recommended) add one cheap job step running
  `docker compose ... config -q` for dev, staging and prod against the
  example templates, so a broken compose file fails CI. (b) No CI change.
- **OQ3 staging data:** (a, recommended) its own managed PostgreSQL
  instance, seeded with the demo menu via the runbook's seed command.
  (b) Staging on the `local-db` profile, which is not durable.
- **OQ4 database roles:** (a, recommended) keep one `DATABASE_URL` for both
  migrate and commerce-api now, and record a follow-up to split a migration
  owner from a least-privilege app user (the runbook already describes how).
  (b) Do the split now; it needs a compose change.
- **OQ5 dev dependency install:** (a, recommended) a one-shot `deps`
  service runs `pnpm install --frozen-lockfile` and `uv sync --locked` into
  container volumes on every `up` (fast when nothing changed). (b) Bake the
  dependencies into the dev images, which needs a rebuild after each
  lockfile change.

## Not doing

- Deploying anywhere, a registry push, Kubernetes, or a secret manager.
- Changing app code beyond the web Dockerfile `COPY`.
- Touching the prod hardening: read-only filesystems, dropped capabilities,
  networks.

## Specialised review needed?

- **security: yes.** Secrets in env files, `.gitignore` and `.dockerignore`
  coverage, and dev ports bound to loopback only. Dev containers must never
  be reachable off-host.
- **performance: no.** Dev-only concerns (watch polling) are documented.
- **data / migration: light.** Dev auto-migrate and seed on a separate
  volume. The staging seed uses the existing runbook path. There is no
  schema change.
