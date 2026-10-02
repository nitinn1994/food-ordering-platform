# Production Runbook

How to deploy and operate the Food Ordering Platform from the reference
topology in `infrastructure/docker/compose.prod.yaml` (Phase 18, ADR-0024).

> **Read first — release blocker B1.** There is no authentication. Every
> caller shares one cart and one order space, and anyone who knows an
> order's id can read its customer's name, phone and email
> (`production-readiness-checklist.md`). Do **not** expose this deployment to
> untrusted multi-user traffic until an identity phase closes B1. This
> runbook makes the deployment robust, not multi-tenant.

What the repository provides: images, the compose file, the nginx config,
migrations and CI. What it does **not** provide, and an operator must:

- a host;
- DNS and TLS certificates;
- a secret store;
- managed PostgreSQL with backups;
- log collection;
- alerting.

## 1. Topology

```text
Internet ─443/80─> proxy (nginx 1.28.3)        TLS, HTTP→HTTPS, 32 KB body cap, rate limits
                     │ network: edge
                     ▼
                   web :3000 (Next.js standalone)   security headers, same-origin proxy
                     │ network: app (internal)
          ┌──────────┴──────────┐
          ▼                     ▼
   ai-service :3002 ──────> commerce-api :3001
   (LangGraph, simulated)     │ network: data (routable: DB is off-host)
                              ▼
                        managed PostgreSQL (TLS)
   one-shot: migrate (dist/migrate.js) runs before commerce-api starts
```

- Only `proxy` publishes ports (80 and 443). web, ai-service and
  commerce-api publish none.
- ai-service is on `app` only. It cannot reach the database, and it has no
  internet egress.
- **nginx must be the edge.** Rate limits are keyed on the connecting
  address (`$binary_remote_addr`). If a cloud load balancer or CDN is ever
  put in front of nginx, every client would share its address and one
  limit. Configure `set_real_ip_from` with that balancer's address range
  only, and `real_ip_header`, before doing so. IPv6 clients are keyed per
  /128 address.
- Every app container is non-root, runs on a read-only root filesystem
  with `cap_drop: ALL` and `no-new-privileges`, and has a liveness
  `HEALTHCHECK`.

## 2. Configuration

Every app reads configuration from environment variables only. An invalid
value stops the process at startup; the error names the variable, never
its value.

### commerce-api

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes (secret)** | — | `postgres://` or `postgresql://`. With `NODE_ENV=production` a loopback host is refused unless `ALLOW_LOOPBACK_DATABASE=true`. Must not contain `sslmode` when `DATABASE_SSL` is set. |
| `DATABASE_SSL` | **yes in production** | unset (no TLS) | `disable`, `require` or `verify-full`. Use `verify-full` for a managed database, and add a private CA with `NODE_EXTRA_CA_CERTS`. `require` encrypts without checking the certificate, so it does not stop a man-in-the-middle. `disable` is accepted as a deliberate choice for a database on a network you control. The setting is required so the choice is always explicit, not so that TLS is forced. |
| `DATABASE_POOL_MAX` | no | `10` | 1–50 connections |
| `DATABASE_STATEMENT_TIMEOUT_MS` | no | `10000` | 1000–60000 |
| `ALLOW_LOOPBACK_DATABASE` | no | `false` | Only for a database on the same host |
| `TRUST_PROXY_HOPS` | no | `0` | 0–5. Nothing reads the client address today. |
| `NODE_ENV`, `HOST`, `PORT` | no | image: `production`, `0.0.0.0`, `3001` | |
| `LOG_LEVEL`, `LOG_FORMAT` | no | `log`, `json` | Keep `json` in production |

### ai-service

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `COMMERCE_API_URL` | **yes in production** | — | `http://commerce-api:3001` in the reference stack |
| `AGENT_TURN_TIMEOUT_SECONDS` | no | `20` | Keep below web's 30 s turn timeout |
| `AGENT_MAX_CONCURRENT_TURNS` | no | `16` | Per process; the next turn gets 503 `AGENT_BUSY` |
| `COMMERCE_API_TIMEOUT_SECONDS` | no | `3.0` | Per commerce-api request; never retried |
| `FORWARDED_ALLOW_IPS` | no | empty (trust none) | |
| `SHUTDOWN_TIMEOUT_SECONDS` | no | `25` | Drain time on SIGTERM |
| `APP_ENV`, `HOST`, `PORT` | no | image: `production`, `0.0.0.0`, `3002` | API docs are served only in `development` |
| `LOG_LEVEL`, `LOG_FORMAT` | no | `INFO`, `json` | |
| `LANGSMITH_*` / `LANGCHAIN_*` tracing | must stay off | — | The service refuses to start if tracing is on |

### web

| Variable | When | Notes |
| --- | --- | --- |
| `COMMERCE_API_URL`, `AI_SERVICE_URL` | **build time** (image build args) **and** runtime | The proxy rewrites are fixed into the build. The image build sets `WEB_REQUIRE_SERVICE_URLS=true`, so a missing URL fails the build. `COMMERCE_API_URL` is read again at runtime by Server Components. |
| `HOSTNAME`, `PORT` | runtime | image: `0.0.0.0`, `3000` |

### Compose-level

| Variable | Notes |
| --- | --- |
| `TLS_CERT_DIR` | Host directory holding `fullchain.pem` and `privkey.pem`, mounted read-only into the proxy |
| `RELEASE_TAG` | Image tag to run (default `latest`). Set it per release so a rollback is a tag change. |
| `COMMERCE_LOG_LEVEL`, `AI_LOG_LEVEL` | Optional log levels |
| `COMPOSE_PROJECT_NAME` | `food-ordering-platform-prod` or `-staging`. Overrides the file's `name:` so environments never share containers, networks or volumes. |

Every variable with its suggested staging and prod value: `environment-variables.md`.

## 3. Secrets

- The only secret today is `DATABASE_URL`. There are no model or voice
  provider keys.
- Supply secrets at runtime from the host's secret store: exported
  variables, or an env file **outside the repository** with `0600`
  permissions, passed with `docker compose --env-file`. Never put them in
  an image, a build argument, or a committed file.
  `.dockerignore` excludes every `.env*` from build contexts.
- Start the env file from the committed template
  (`infrastructure/docker/env/.env.prod.example` or
  `.env.staging.example`), which lists every variable and holds only
  `CHANGE_ME` for secrets:
  `sudo install -D -m 0600 -o deploy infrastructure/docker/env/.env.prod.example /etc/fop/prod/compose.env`
  (`-D` creates `/etc/fop/prod`; `deploy` is the user that runs compose),
  then fill it in. Generate the database password with
  `openssl rand -hex 32`.
- Database roles: use two.
  - `commerce_migrator` owns the schema and is used only by the `migrate`
    service.
  - `commerce_app` gets `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the six
    tables only (`menu_categories`, `menu_items`, `carts`, `cart_lines`,
    `orders`, `order_lines`).

  The compose file passes one `DATABASE_URL` to both services. To split
  them, override `migrate`'s `DATABASE_URL`. This split is a recommendation;
  the repository does not create roles.

## 4. Deploy

Prerequisites: Docker Engine with Compose v2, DNS pointing at the host,
certificates in `TLS_CERT_DIR`, and a reachable managed PostgreSQL with TLS.

```bash
export RELEASE_TAG=<git sha or version>
export TLS_CERT_DIR=/etc/fop/certs
export DATABASE_SSL=verify-full
# DATABASE_URL from the secret store — never typed into shell history.

docker compose -f infrastructure/docker/compose.prod.yaml build
docker compose -f infrastructure/docker/compose.prod.yaml up -d --wait
```

`up` starts, in order:

1. `migrate`: forward-only migrations. On failure nothing else starts.
2. `commerce-api`, once healthy.
3. `ai-service`.
4. `web`.
5. `proxy`.

**First deploy only: load the menu.** There is no other production
menu-loading path yet (checklist D4):

```bash
docker compose -f infrastructure/docker/compose.prod.yaml run --rm --no-deps \
  migrate node dist/seed.js --allow-production
```

The seed is an upsert of the in-code demo menu (`DEMO_MENU_SEED`, 8
categories and 30 items, since mcdelivery-redesign Phase 2; before that
it was the 3-category test menu). Re-running it restores the seeded
items' names, prices, availability and presentation fields.

- **It never deletes.** On a database seeded before Phase 2, the demo
  categories' positions collide with the old ones. The seed then writes
  nothing and prints "an earlier menu's categories already hold these
  positions". Remove the old menu rows first (`menu_items`, then
  `menu_categories`). Carts and orders do not reference `menu_items` by
  foreign key, and order lines keep their own name and price snapshot.
  This is a manual, reviewed step: there is no command for it.
- **Deploy order for this change.** `@contracts/api-contracts` is strict,
  so a `web` or `ai-service` build older than the Phase 2 contract rejects
  the whole `/v1/menu` once it carries the new optional fields (image,
  weight, badge, featured). They appear only after the demo seed is
  loaded. So deploy every service first, and seed last.

**Verify** after every deploy:

```bash
curl -sI http://<host>/            # 301 to https
curl -s  https://<host>/api/health # {"status":"ok"} (web liveness)
curl -sI https://<host>/cart       # CSP, HSTS, X-Frame-Options; no X-Powered-By
docker compose -f infrastructure/docker/compose.prod.yaml ps   # all healthy; migrate exited 0
docker compose -f infrastructure/docker/compose.prod.yaml exec commerce-api \
  node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>r.text()).then(console.log)"
```

### Staging

Staging is a second server with the same shape as prod: the same compose
file, images built from the same commit, its own hostname, TLS certificate
and managed PostgreSQL (ADR-0028). Only the env file differs. There is no
registry yet, so each server builds its own images: prod's are rebuilt
from the commit staging tested, not copied from staging.

1. Provision the server, DNS for the staging hostname, a certificate in
   `/etc/fop/staging/certs`, and a managed PostgreSQL instance for staging
   only. Never point staging at the prod database.
2. Create the env file from `infrastructure/docker/env/.env.staging.example`
   at `/etc/fop/staging/compose.env` (`0600`, see §3). Set `RELEASE_TAG` to
   the release candidate.
3. Deploy with the env file:

   ```bash
   E=/etc/fop/staging/compose.env
   docker compose -f infrastructure/docker/compose.prod.yaml --env-file $E build
   docker compose -f infrastructure/docker/compose.prod.yaml --env-file $E up -d --wait
   # First deploy only: load the demo menu.
   docker compose -f infrastructure/docker/compose.prod.yaml --env-file $E \
     run --rm --no-deps migrate node dist/seed.js --allow-production
   ```

4. Run the **Verify** checks above against the staging host, adding
   `--env-file $E` to each `docker compose` command. Without it, compose
   uses the prod project name and sees no containers.
5. Promote: check out the **same commit** on the prod server and deploy it
   with the same `RELEASE_TAG`. The base images are pinned by digest, so
   the rebuild uses the same toolchain; a registry that ships the one
   tested image is a follow-up.

To smoke-test either env file on one machine without a managed database,
see `environment-variables.md` (`LOCAL_DB_PASSWORD`, `--profile local-db`).

## 5. Health checks

| Service | Liveness (container `HEALTHCHECK`) | Readiness |
| --- | --- | --- |
| web | `GET /api/health`: no upstream call | none: web itself has no dependency to be ready for |
| commerce-api | `GET /health`: no dependency | `GET /health/ready`: 200 `ready` if PostgreSQL answers `select 1` within 1 s, else 503 `not_ready` |
| ai-service | `GET /health` | `GET /health/ready`: static `ready`, and never calls commerce-api or a provider |
| proxy | Docker process state | — |

None of these routes is reachable through the proxy except web's
`/api/health`. Probe the others from inside the host or container network.
Liveness never depends on another service, so a database outage never gets
a healthy process restarted.

## 6. Migrations and rollback

- **Forward-only in production.** `dist/migrate.js down` refuses to run with
  `NODE_ENV=production`.
- **Every migration must stay compatible with the previous release**
  (expand/contract). Add columns and tables in one release, start using
  them in the next, and remove old ones only after no running release reads
  them.
- **Application rollback:** set `RELEASE_TAG` to the previous release and
  run `docker compose ... up -d --wait`. The schema stays; the previous code
  must work with it, which expand/contract guarantees.
- **A broken migration:** `migrate` exits non-zero, and commerce-api keeps
  running the previous release, because a compose rollout never replaces a
  healthy container whose dependency failed. Fix forward with a new
  migration. For data damage, restore from backup (§7).
- Migrations take Kysely's migration lock, so two concurrent runs cannot
  interleave.

## 7. Backup and restore

**Nothing in this repository takes backups.** Verify each of these with the
hosting provider before go-live. The checklist keeps backups BLOCKED until
you do.

| Requirement | Recommended starting point |
| --- | --- |
| Automated backups | Managed PostgreSQL daily snapshots plus point-in-time recovery (PITR), 7-day retention |
| RPO / RTO | **Placeholders: ≤ 5 min / ≤ 1 h.** The business must set these (checklist D6). |
| Restore drill | At least once before launch and then quarterly: restore to a *new* instance, point a staging deployment's `DATABASE_URL` at it, check `GET /health/ready` and a known order by id, then discard it |
| Restore for real | Restore PITR to a new instance, run `migrate` against it (a no-op if the schema matches), switch `DATABASE_URL` in the secret store, then `docker compose up -d --wait` |
| Personal data | Orders hold customer name, phone and email. There is no retention or erasure policy yet (checklist D5). Backups inherit that data. |

## 8. Observability

- Every service logs one JSON line per request to stdout. The request id
  (`X-Request-Id`) and correlation id (`X-Correlation-Id`) are on every
  line; ai-service forwards the correlation id to commerce-api. Collect
  stdout with the host's log driver.
- **Never logged:** request bodies, headers, query strings, customer
  messages, replies, tool arguments, audio or transcripts. The proxy logs
  the client address and path, without the query string, for abuse
  investigation.
- **Signals to derive from logs.** There is no metrics endpoint (ADR-0024
  decision 12).

| Signal | Source |
| --- | --- |
| Request rate, status mix, latency | `request handled` (commerce-api), `request completed` (ai-service), proxy JSON lines |
| Agent executions, outcome, duration, tool calls and rounds | `agent turn completed` / `agent turn failed` / `agent turn timed out` / `agent turn refused` (`outcome` field) |
| Tool calls and failures | `tool call completed` / `tool call failed` (`tool`, `outcome`, `error_code`, `duration_ms`) |
| Rate-limit hits | proxy lines with `"status":429`; nginx `limiting requests` warnings |
| Database trouble | commerce-api 503 `SERVICE_UNAVAILABLE`, pool `connection lost` warnings, readiness `not_ready` |

- There is no external error tracker. Alert on 5xx rate, 429 rate, agent
  `timeout`/`busy` outcomes and readiness failures in the log system.

## 9. Incident response

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Menu page shows "We couldn't load this page"; `/api/commerce/*` 503 | Database unreachable | Check commerce-api readiness and the provider's status. The pool reconnects by itself once the database is back; no restart is needed. |
| Chat answers "The assistant is busy" (503 `AGENT_BUSY`) | More than `AGENT_MAX_CONCURRENT_TURNS` turns at once | Look for a burst in the proxy logs. Raise the cap only after checking cost and latency. |
| Chat answers "took too long" (504 `AGENT_TIMEOUT`) | Slow commerce-api (each tool call up to 3 s) | Check commerce-api latency. The cart shown is re-read after every turn, so the customer sees the truth. |
| Many 429s from one address | Abuse, or a client retry loop | Limits are per client address in `nginx.conf`. Block at the host firewall if needed. |
| 429s for everyone behind one NAT | Shared address | Raise the burst for the affected zone in `nginx.conf` and reload the proxy |
| commerce-api container restarting | Startup failure | `docker compose logs commerce-api`: a `fatal` `commerce-api failed to start` line names the reason: invalid configuration (variable named), database unreachable (code only), or port in use |
| `migrate` exited non-zero | Migration failure | The old release is still serving. Read `docker compose logs migrate`, then fix forward (§6). |
| Duplicate-looking cart items | Repeated agent add (no idempotency key on cart add yet, checklist D3) | The cart is authoritative; the customer can correct it. It is a known limitation. |
| Suspected data exposure | B1: order ids are the only protection | Take the deployment off the public internet, then follow your data-breach process |

After any incident, collect the logs by `X-Request-Id` or `X-Correlation-Id`,
which tie one request's lines together across web, ai-service and
commerce-api.

## 10. Troubleshooting

- **Web build fails with "COMMERCE_API_URL must be set when
  WEB_REQUIRE_SERVICE_URLS=true".** Pass both `--build-arg` values
  (`apps/web/Dockerfile` header).
- **commerce-api exits with "DATABASE_SSL (required when NODE_ENV=production)".**
  Set `DATABASE_SSL`.
- **commerce-api exits with "loopback host refused".** The database URL
  points at this host. Use the database's real address, or set
  `ALLOW_LOOPBACK_DATABASE=true` if that is intended.
- **The proxy fails to start.** Check that `TLS_CERT_DIR` contains
  `fullchain.pem` and `privkey.pem` and is readable by Docker. Docker
  Desktop can only mount shared paths.
- **Pages load without styles or scripts.** The web image copies
  `.next/static` beside the standalone server. Rebuild the image rather than
  mounting files into it.
- **The CSP blocks something.** The policy allows only this origin
  (`apps/web/src/lib/security/headers.ts`). A new third-party asset needs a
  deliberate CSP change and review.
- **The agent can't reach a model provider** (future real model). The `app`
  network is internal, with no egress. Adding one is part of the real-model
  phase (D2).
