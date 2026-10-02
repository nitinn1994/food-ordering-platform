# Requirements — Docker environments (dev, staging, prod)

**Approval Status:** APPROVED
**Approved by:** the user, 2026-10-02 (in conversation; OQ1–OQ5 all resolved with the recommended option (a))
**Risk:** HIGH
**Path:** Full

## Risk justification

The highest dimension wins (`.claude/commands/forge.md`). Classified by
`/forge` on 2026-10-02 and reused here.

| Dimension | Level | Why |
| --- | --- | --- |
| Scope | HIGH | Every app plus `infrastructure/`. Adds a new environment (staging) and a containerized dev topology. |
| Security impact | **HIGH** | Secrets handling: database credentials and TLS material in env files. A `.gitignore` gap today would let `.env.staging` / `.env.prod` be committed. |
| Data impact | MEDIUM | New Postgres volumes for dev. Staging gets its own database. No schema change. |
| API compatibility | LOW | None |
| Infrastructure | **HIGH** | Deploy topology: a new staging stack and a new dev stack. The prod compose is reused. |
| User / business impact | MEDIUM | Availability of staging and prod depends on these files. |
| Reversibility | MEDIUM | Files revert easily. A leaked secret does not. |

## Problem

Only two Docker setups exist today:
- `infrastructure/docker/compose.yaml` starts PostgreSQL alone, for running
  the apps on the host.
- `infrastructure/docker/compose.prod.yaml` (Phase 18) is the hardened
  production topology: nginx, web, ai-service, commerce-api, a one-shot
  migrate service, and managed PostgreSQL.

What's missing:
- There is no way to bring the whole stack up in containers for development.
- There is no staging environment.
- No per-environment env templates exist. The Phase 18 prod file expects
  values "from the host's secret store" with no committed template that
  lists them.

Two defects were found during inspection:
- **D1.** `apps/web/Dockerfile` does not copy `apps/web/public/`, so the
  production image serves no `/menu/*.svg` illustrations (added by
  mcdelivery-redesign Phase 2). The image still builds, which is why CI never
  noticed.
- **D2.** `.gitignore` ignores `.env`, `.env.local` and `.env.*.local`, but
  not `.env.staging` or `.env.prod`.

## Decisions already made (2026-10-02)

| Question | Answer |
| --- | --- |
| What is "dev"? | Hot-reload containers. Source is mounted, and `next dev`, `vite-node --watch` and `uvicorn --reload` run inside Docker. |
| Where do staging and prod secrets come from? | Git-ignored env files on each host, created from committed `.env.*.example` templates and passed with `--env-file`. This matches Phase 18. |
| Where does staging run? | Its own server, the same shape as prod: same images and compose, its own hostname, TLS cert and database. |

## Goal

- One command brings up a working, hot-reloading dev stack.
- Staging and prod run the same hardened compose with different env files.
- Every variable has a committed template with a suggested value and a
  note on where secrets come from.
- No real secret can be committed.

## In scope

- **Dev stack** (`compose.dev.yaml`):
  - PostgreSQL;
  - a one-shot dependency install into container-only volumes;
  - a one-shot migrate and demo seed;
  - commerce-api, ai-service and web in watch/reload mode, published on
    127.0.0.1 only.
- **Staging:** `compose.prod.yaml` is reused unchanged in shape. The
  environment is chosen by the env file: project name, release tag,
  database, TLS directory and log levels.
- **Env templates**, committed, with suggested values:
  - `infrastructure/docker/env/.env.dev.example`
  - `infrastructure/docker/env/.env.staging.example`
  - `infrastructure/docker/env/.env.prod.example`
- **`.gitignore`:** ignore every real `.env.*`, keep the `*.example`
  templates (fixes D2).
- **`apps/web/Dockerfile`:** copy `apps/web/public` into the image (fixes D1).
- **Docs:**
  - getting-started: "everything in Docker";
  - runbook: staging deploy and seed;
  - ADR-0028;
  - an env-variable reference table with suggested values per
    environment.

## Out of scope

- Kubernetes, a container registry, a CI/CD deploy pipeline, or any actual
  deployment (`CLAUDE.md`: no deploys).
- A secret manager such as Vault or a cloud secret service (answered
  above).
- Provisioning managed PostgreSQL, DNS or certificates. The docs say what to
  provide.
- Changing app configuration schemas, ports or the prod hardening.
- Splitting database roles into a migration owner and an app user. This is
  recorded as a follow-up (OQ4).

## Acceptance criteria

- [ ] **AC1 dev up:** with only Docker installed,
  `docker compose -f infrastructure/docker/compose.dev.yaml --env-file infrastructure/docker/env/.env.dev up -d --wait`
  brings up postgres, commerce-api, ai-service and web as healthy.
  `http://127.0.0.1:3000/` renders the demo menu: the body contains
  "Our Menu" and a demo item, checked by grepping the body, not the status.
  `/api/commerce/v1/menu` returns 8 categories.
- [ ] **AC2 dev hot reload:** editing a source file on the host is picked up
  without rebuilding an image. For each app, a small change appears in its
  response within the watch cycle, then is reverted.
- [ ] **AC3 dev isolation:**
  - The containers never write to the host's `node_modules`, `.venv` or
    `apps/web/.next`, so host-run dev servers and builds keep working.
  - Dev ports bind to 127.0.0.1 only, and every host port is overridable
    from the env file.
- [ ] **AC4 dev data:** a fresh dev volume is migrated and loaded with the
  demo menu automatically. A second `up` is a no-op for both, and
  `down -v` resets it.
- [ ] **AC5 staging = prod shape:** staging is started with the same
  `compose.prod.yaml` plus `.env.staging`. `docker compose ... config`
  resolves for both env files. The two environments differ only in values
  that come from the env file. The project names differ, so containers,
  networks and volumes never collide.
- [ ] **AC6 prod smoke:**
  - With a self-signed certificate and the `local-db` profile, the prod
    stack and the staging stack each come up healthy.
  - `https://127.0.0.1/` serves the menu, including at least one
    `/menu/*.svg` illustration with status 200 and an SVG content type
    (proves D1 is fixed).
  - All images run as non-root, which the existing CI check covers.
- [ ] **AC7 secrets cannot be committed:** after creating real
  `.env.dev`, `.env.staging` and `.env.prod` next to the templates,
  `git status` shows none of them, and `git check-ignore` confirms each
  one. The templates stay tracked, and no template contains a real secret.
- [ ] **AC8 values documented:** every variable each compose file reads is
  in the matching template, with a suggested value (or `CHANGE_ME` plus a
  generation command for secrets) and a one-line purpose. The docs table
  lists them per environment.
- [ ] **AC9 nothing regresses:**
  - The existing host workflow (`db:up`, `pnpm dev`, `uv run ... --reload`)
    still works.
  - The existing CI commands still pass, including the three image builds
    and the non-root check.

## Open questions

All resolved 2026-10-02 with the recommended option (a); see `plan.md` § Open questions.
