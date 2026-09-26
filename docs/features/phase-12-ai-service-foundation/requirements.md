# Requirements — Phase 12: Python AI Service Foundation

**Approval Status:** APPROVED
**Approved by:** nitin — 2026-09-26 (in conversation, "approved", given after the full plan including OD1–OD16 with a recommendation on each; the recommendations are therefore the decisions. Q2: risk stays HIGH/Full. Q1 unanswered — treated as follow-up only)
**Risk:** HIGH
**Path:** Full

## Problem

`apps/ai-service` is an empty directory. ADR-0001 fixes its location and
`system-architecture.md` §1 gives it an owner and a boundary: conversation,
tool selection, intent generation; never the database, never commerce state.
Nothing is built yet. Every later AI phase (LangGraph orchestration,
Commerce API tools, intents, UI commands, RAG, voice) needs somewhere to run.
If that "somewhere" is improvised inside the first agent phase, its
configuration, error, logging and boundary rules get decided in passing,
under pressure from agent work. This is how commerce-api got its
middleware-ordering bug (ADR-0013).

`getting-started.md` also requires that "whichever phase next scaffolds
`apps/ai-service` must update this file in the same change."

## Goal

A minimal FastAPI service in `apps/ai-service` that runs and tests on its own.
It has validated configuration, one error shape, structured logging with
request correlation, a liveness endpoint, and mechanically checked boundary
rules. It contains no AI behaviour and no Commerce API calls. It runs with no
LLM provider, no commerce-api and no database.

## Risk assessment (Full Path)

- **Classification: HIGH.** Two dimensions set it:
  - **Infrastructure — HIGH:** a new service, with a new network listener
    and a new toolchain (Python) in the repository.
  - **Security — HIGH (by the table's definition):** a new input trust
    boundary (an HTTP listener). It also sets the rules for secret-bearing
    configuration and error and log redaction, which later phases will add
    provider API keys to.
  - The other dimensions are LOW or none. No data impact. No change to any
    existing API or contract. No user-facing behaviour.
- **Blast radius:** small. No existing app, package or contract changes. The
  risk is the *precedent*: a bad pattern here (a leaking error handler, a log
  line that echoes headers, config that prints values) gets copied into every
  AI phase, where provider keys and customer utterances exist.
- **Reversibility:** trivial. Delete `apps/ai-service/`, then revert the
  docs and the `.gitignore` line.
- **Detection:** the automated suite (header presence on every response
  class, log redaction, no-leak 500s, boundary allowlist), plus a live check
  against the running process.
- **Could this drop to MEDIUM?** Arguably. The attack surface is one GET
  route on loopback. The table is explicit that a new service is HIGH, so
  HIGH is recorded here. The human may lower it. That would remove the
  security review and `/final-review` steps.

## In scope

- Scaffold `apps/ai-service` as a Python project that sits outside the pnpm
  workspace and Turborepo graph (ADR-0002).
- Dependency management and a lockfile (OD1). Pin the Python version (OD2).
- An application factory. A process entry point that validates config before
  it starts listening.
- Centralized configuration from environment variables. Include only the
  variables Phase 12 actually reads.
- `GET /health`: liveness, unversioned, the same shape as commerce-api.
- An error model: every error response is a `@contracts/common`
  `ContractError`, covering validation, not-found, method-not-allowed and
  unhandled errors. Nothing internal is leaked.
- Request context: `X-Request-Id` and `X-Correlation-Id` on every response,
  following the same rules as commerce-api (`docs/api/commerce-api.md` §7).
- Structured JSON logging with a redaction discipline: one completion line
  per request, and no headers, bodies or query strings in logs.
- Boundary guards: tests that fail if a database driver, ORM, LLM SDK or
  LangChain/LangGraph becomes a dependency or is imported.
- Lint, format and type-check tooling (OD13), and a pytest suite that needs
  no network.
- Docs: `getting-started.md`, ADR-0019, `system-architecture.md` (the lines
  this makes wrong), `apps/ai-service/README.md`, `docs/api/ai-service.md`.

## Out of scope

Everything in the brief's §19, restated: LangChain, LangGraph, agents,
chains, tool calling, Commerce API tools or clients, business intents, UI
commands, RAG, embeddings, vector DBs, memory, conversation persistence, any
LLM call (OpenAI, Anthropic, local), voice, LiveKit, MCP, authentication,
payment, notifications, delivery tracking, Redis, Kafka, RabbitMQ,
Kubernetes, production deployment and autonomous loops.

Also out of scope, by decision in this plan:

- Any model-provider interface or provider configuration (OD7).
- `COMMERCE_API_BASE_URL` and any HTTP client (OD8).
- A conversational endpoint, a placeholder endpoint or fake AI responses.
- A readiness endpoint (OD6).
- CORS (OD11).
- Docker or Compose for the AI service (OD15).
- The Zod → JSON Schema → Pydantic codegen pipeline from ADR-0003 (OD9).
  Phase 12 has no contract consumer.
- CI (none exists in the repository).
- Any change to `apps/web`, `apps/commerce-api` or `packages/contracts`.

## Acceptance criteria

- [ ] **AC1** — `apps/ai-service` contains `pyproject.toml`, a committed
  lockfile and a Python version pin. It has no `package.json`, and pnpm does
  not list it as a workspace package (`pnpm ls -r --depth -1` does not show
  it).
- [ ] **AC2** — From a clean checkout, the documented install command
  creates the environment. The documented test command passes with no `.env`
  file, no network access, no running commerce-api and no database.
- [ ] **AC3** — The documented run command starts the service on
  `127.0.0.1:3002` by default. `GET /health` returns `200` with body exactly
  `{"status":"ok"}` while commerce-api and PostgreSQL are both stopped.
- [ ] **AC4** — An invalid environment value (for example `PORT=abc` or
  `APP_ENV=staging`) makes the process exit non-zero *before* it binds the
  port. The message names each failing field and the kind of failure, and
  never prints the offending value.
- [ ] **AC5** — Every error response body is a `ContractError`
  (`{code, message, field?}`) and validates against the committed
  `packages/contracts/common/schema/error.v1.json`. In particular:
  - An unknown route returns `404 ROUTE_NOT_FOUND`.
  - A wrong method returns `405 METHOD_NOT_ALLOWED`.
  - A request-validation failure returns `400 INVALID_PAYLOAD` with a
    bounded `field` (at most 64 characters) and never the rejected value.
  - An unhandled exception returns `500 INTERNAL_ERROR` with a static
    message. The response has no stack trace, no exception text and no echo
    of the request.
- [ ] **AC6** — Every response has both `X-Request-Id` (always generated by
  the server, never taken from the request) and `X-Correlation-Id` (a valid
  inbound value is echoed; a missing or invalid one is replaced). This
  includes each error response class in AC5, and the 500 case specifically.
- [ ] **AC7** — Logs are one JSON object per line. Every line written during
  a request carries its `request_id` and `correlation_id`. Each request
  produces exactly one completion line with method, path (without the query
  string), status and duration. No log line contains a request header value,
  a query string or a request body. An unhandled exception is logged
  server-side with its traceback and request id. Uvicorn's own access log is
  off.
- [ ] **AC8** — No CORS middleware is installed. The default bind is
  loopback. `/docs`, `/redoc` and `/openapi.json` respond only when
  `APP_ENV=development`; otherwise they return `404 ROUTE_NOT_FOUND`.
- [ ] **AC9** — A test fails if any runtime or dev dependency outside a
  declared allowlist is added, or if any module under the service package
  imports a forbidden package: database drivers or ORMs, LLM SDKs, and
  LangChain/LangGraph. Nothing in the configuration names a database URL or
  a provider key.
- [ ] **AC10** — The declared lint, format-check and type-check commands all
  pass. Type checking is strict on the service package.
- [ ] **AC11** — `docs/development/getting-started.md` lists the AI service's
  prerequisites and every command it declares, each actually run. It also
  documents how to start web, commerce-api and ai-service independently.
  ADR-0019 records the decisions, and `system-architecture.md` no longer
  contradicts what was built.
- [ ] **AC12** — No file changes outside `apps/ai-service/`, `docs/` and
  `.gitignore`.
- [ ] **AC13** — Regression check: `pnpm turbo run lint typecheck test build`
  still passes, with the same test count as before.

## Open questions

All carried as OD1–OD16 in `plan.md` §24, each with a recommendation. Three
need a real answer before implementation:

1. **OD1: the toolchain is a blocker.** This machine's Python 3.12.3 has no
   `pip` or `ensurepip`, and `uv` is not installed. `.claude/rules/validation.md`
   forbids me from installing packages to make a check runnable, so the human
   must install the chosen tool first.
2. **OD9: the error model and ADR-0003.** Should a hand-written local error
   model, guarded by a conformance test, be accepted as a scoped exception to
   "Pydantic is generated"?
3. **Risk tier:** keep HIGH/Full, or lower it to MEDIUM/Standard?
