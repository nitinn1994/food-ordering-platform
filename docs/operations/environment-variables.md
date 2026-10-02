# Environment Variables

Every variable the Docker environments read, with a suggested value per
environment (docs/features/docker-environments, ADR-0028). The templates
hold the same values and are the copy-from source:

| Environment | Compose file | Template | Real file (git-ignored) |
| --- | --- | --- | --- |
| dev | `infrastructure/docker/compose.dev.yaml` | `infrastructure/docker/env/.env.dev.example` | `infrastructure/docker/env/.env.dev` |
| staging | `infrastructure/docker/compose.prod.yaml` | `infrastructure/docker/env/.env.staging.example` | `/etc/fop/staging/compose.env` on the staging server, `0600` |
| prod | `infrastructure/docker/compose.prod.yaml` | `infrastructure/docker/env/.env.prod.example` | `/etc/fop/prod/compose.env` on the prod server, `0600` |

Staging and prod run the same compose file, with images built on each
host from the same commit (there is no registry yet). Only the env file
differs. Each app's own variables (what its config schema accepts) are in
`production-runbook.md` §2. This page covers what the compose files read.

## Secrets

Only one secret exists today: the password inside `DATABASE_URL` (plus the
TLS private key, which is a file in `TLS_CERT_DIR`, not a variable).

- Templates hold `CHANGE_ME`, never a real value. CI checks every
  template resolves (`docker compose ... config -q`).
- Generate a database password with `openssl rand -hex 32`. Hex needs no
  URL-encoding; base64's `/`, `+` and `=` would break the URL.
- `.gitignore` ignores every `.env.*` except `*.example`, and
  `.dockerignore` keeps all `.env*` files out of every image.
- The dev values (`commerce` / `commerce`) are placeholders for a database
  bound to 127.0.0.1, the same as `compose.yaml` and the apps'
  `.env.example` files.

## Shared by every environment

| Variable | dev | staging | prod | Secret | Purpose |
| --- | --- | --- | --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `food-ordering-platform-dev` | `food-ordering-platform-staging` | `food-ordering-platform-prod` | no | Prefix for containers, networks and volumes. Overrides the compose file's `name:`, so environments on one host never collide. |
| `DATABASE_POOL_MAX` | `5` | `5` | `10` | no | commerce-api connections per instance (1–50). Keep it at or below the provider's limit divided by the number of instances. |
| `COMMERCE_LOG_LEVEL` | `debug` | `debug` | `log` | no | commerce-api: `verbose`, `debug`, `log`, `warn`, `error`, `fatal` |
| `AI_LOG_LEVEL` | `DEBUG` | `INFO` | `INFO` | no | ai-service: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `AGENT_TURN_TIMEOUT_SECONDS` | `20` | `20` | `20` | no | Whole-turn deadline. Keep it below web's 30 s turn timeout. |
| `AGENT_MAX_CONCURRENT_TURNS` | `4` | `8` | `16` | no | Turns running at once in ai-service. The next one gets 503 `AGENT_BUSY`. |

## Staging and prod only (`compose.prod.yaml`)

| Variable | staging | prod | Secret | Purpose |
| --- | --- | --- | --- | --- |
| `RELEASE_TAG` | the release candidate, e.g. `2026.10.02-rc1` | the tag promoted from staging, e.g. `2026.10.02` | no | Image tag for all three apps. Never `latest`, so a rollback is a tag change. |
| `DATABASE_URL` | `postgres://commerce_app:CHANGE_ME@staging-db.example.internal:5432/commerce_staging` | `postgres://commerce_app:CHANGE_ME@prod-db.example.internal:5432/commerce` | **yes** | commerce-api and migrate. Staging has its own managed PostgreSQL, never prod's. No `?sslmode=`: commerce-api refuses it together with `DATABASE_SSL`. |
| `DATABASE_SSL` | `verify-full` | `verify-full` | no | Required. `verify-full` checks the server certificate; a private CA also needs `NODE_EXTRA_CA_CERTS` (not yet passed by the compose file: a recorded follow-up). |
| `TLS_CERT_DIR` | `/etc/fop/staging/certs` | `/etc/fop/prod/certs` | the key file is | Host directory with `fullchain.pem` and `privkey.pem`, mounted read-only into nginx |
| `LOCAL_DB_PASSWORD` | unset | unset | throwaway | Only for `--profile local-db` smoke tests. Then `DATABASE_URL=postgres://commerce:<it>@postgres:5432/commerce` and `DATABASE_SSL=disable`. |

## Dev only (`compose.dev.yaml`)

| Variable | Suggested | Purpose |
| --- | --- | --- |
| `WEB_PORT`, `COMMERCE_API_PORT`, `AI_SERVICE_PORT` | `3000`, `3001`, `3002` | Host ports, bound to 127.0.0.1. Change them if host-run dev servers already use these. |
| `DEV_DB_PORT` | `5433` | Host port for the dev database. 5433 so it can run beside `compose.yaml`'s 5432. |
| `DEV_UID`, `DEV_GID` | output of `id -u`, `id -g` (usually `1000`) | The apps run as this user, so files they write into the mounted source stay yours. |
| `POSTGRES_PASSWORD` | `commerce` | Dev database password. Read only when the volume is first created: after changing it, `down -v`. |
| `LOG_FORMAT` | `pretty` | commerce-api and ai-service: `json` or `pretty` |
| `WATCHPACK_POLLING` | `true` | web's file watcher polls. Needed on Docker Desktop; `false` is enough on native Docker Engine. |
| `CHOKIDAR_USEPOLLING` | `true` | commerce-api's file watcher polls. Same rule. |

## Set by the compose files, not the env file

These are fixed so they cannot drift between environments. They are listed
so nobody adds them to an env file expecting an effect.

| Variable | Value | Where |
| --- | --- | --- |
| `COMMERCE_API_URL` | `http://commerce-api:3001` | web (build arg and runtime) and ai-service, in both compose files |
| `AI_SERVICE_URL` | `http://ai-service:3002` | web, in both compose files |
| `HOST` / `PORT` | `0.0.0.0` / the app's port | dev compose; the production images set them in their Dockerfiles |
| `NODE_ENV`, `APP_ENV` | `development` (dev); `production` (images) | dev compose; Dockerfiles |
