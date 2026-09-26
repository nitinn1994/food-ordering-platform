# Plan — Phase 12: Python AI Service Foundation

**Approval Status:** APPROVED

Each decision is tagged:

- **[ESTABLISHED]**: already decided by an Accepted ADR or `CLAUDE.md`. Not
  up for approval here.
- **[OD-n]**: needs approval. Every one has a recommendation in §24.
- **[ASSUMPTION]**: believed but not verified. See "Assumptions".
- **[OPTIONAL]**: a possible improvement, not planned.

### Findings from inspection that shape this plan

1. **The toolchain is a blocker.** `/usr/bin/python3` is 3.12.3, with no `pip`
   (`No module named pip`) and no `ensurepip`, so `python3 -m venv` cannot
   seed pip. `uv` and Poetry are not installed. The project rules forbid me
   from installing tools to make a check runnable, so the human installs the
   chosen tool before sub-phase 12.1 (OD1).
2. **commerce-api is the template to follow.** ADR-0013 already settled the
   same foundation questions for the TypeScript service:
   - config validated before listen, naming fields but never values
   - errors in the `ContractError` shape
   - `X-Request-Id` / `X-Correlation-Id` on every response, error responses
     included
   - JSON logs with redaction
   - an unversioned `/health` that checks liveness only
   - no CORS, no readiness endpoint, loopback bind

   Matching these on purpose gives future callers (apps/web, tools) one error
   model and one correlation model to deal with.
3. **ADR-0013's real bug is a live risk here too.** A real 413 response went
   out without correlation headers because of middleware ordering. Starlette
   has the same trap: `ServerErrorMiddleware` sits outside all user middleware,
   so a naive `BaseHTTPMiddleware` never sees a 500 and cannot put headers on
   it. The plan tests header presence on the 500 path from the first
   sub-phase (§12, §23).
4. **ADR-0003 has a gap Phase 12 steps into.** "Pydantic is generated" is
   Accepted, and `system-architecture.md` §6 says Pydantic generation is "future
   work for whichever phase creates `apps/ai-service`". But Phase 12 consumes
   no intent, no UI command and no api-contract. The only shared shape it
   needs is the error body (OD9).
5. **The docs are already set up for this phase.** `.gitignore` already covers
   `__pycache__/`, `.venv/`, `.pytest_cache/`, `.ruff_cache/` and `.env`.
   `pnpm-workspace.yaml`'s `apps/*` glob only matches directories that have a
   `package.json`, so ai-service stays out of the workspace as long as it
   never gets one.
6. **A stale sentence sits next to one this phase must edit.** The top status
   paragraph of `getting-started.md` still says "Nothing calls the Commerce API
   yet — `apps/web` still uses its own fixture". Phase 11 made that false.
   Phase 12 has to rewrite "`apps/ai-service` does not exist yet", which is in
   the same sentence (see §19 and Open question Q1).

---

## 1. Current repository architecture [ESTABLISHED]

- Monorepo (ADR-0001) with pnpm + Turborepo, covering the TypeScript subset
  only (ADR-0002).
- **`apps/web`**: Next.js. It calls commerce-api through a same-origin proxy
  `/api/commerce/v1/*` and has one validating API client (ADR-0018). It
  listens on `127.0.0.1:3000`.
- **`apps/commerce-api`**: NestJS on Vite + SWC, listening on
  `127.0.0.1:3001`. It is the authority for menu, cart and order data,
  persisted to PostgreSQL through Kysely (ADR-0017). It provides:
  - config validated with Zod
  - errors as `ContractError`
  - `AppLogger` JSON logs carrying request and correlation ids
  - `GET /health` (liveness only)
  - `/v1` URI versioning
- **`packages/contracts/{common,ui-commands,agent-intents,api-contracts}`**:
  Zod schemas with committed JSON Schema `schema/*.v1.json`, protected by
  freshness tests. There is no Pydantic yet.
- **`infrastructure/docker/compose.yaml`**: local PostgreSQL only, and
  deliberately nothing else (Phase 10 OD11).
- **No CI.** Tests are Vitest; pytest was named for Python in ADR-0006/0008.
- **`apps/ai-service/`**: empty directory.

## 2. Existing Python tooling

**None.** There is no `pyproject.toml`, `requirements*.txt`, `uv.lock`,
`poetry.lock` or `.python-version` anywhere. `.gitignore` already lists
Python caches, planned in advance. The machine has `python3.12` (3.12.3) with
no pip, no ensurepip, no uv and no Poetry. Docker 29.7.2 is available but not
needed (§17).

## 3. AI service location [ESTABLISHED]

`apps/ai-service/` (ADR-0001, `CLAUDE.md`). It is outside the pnpm workspace
and Turborepo (ADR-0002): no `package.json`, no `turbo.json` entry.
`turbo run` will not see it. ADR-0002 names this as its main cost. It is
handled by documenting a separate command set (§16), because there is no CI
to wire.

## 4. Python version [OD2]

**Recommend Python 3.12**, pinned with:

- `.python-version`: `3.12`
- `requires-python = ">=3.12,<3.13"`

3.12 is the version already on this machine and in the current FastAPI and
Pydantic support window. With uv, a contributor without 3.12 gets it
installed by uv automatically.

The upper bound keeps the lockfile honest: every dependency is resolved and
tested on one minor version. Widening it is a one-line change later.

## 5. Dependency strategy [OD1]

**Recommend `uv`, with PEP 621 `pyproject.toml` and a committed `uv.lock`.**

- **Why uv.** It matches the repository's existing discipline: pnpm has a
  committed lockfile and a pinned tool version. uv gives the same thing in
  one static binary, and it also installs Python itself, which solves
  finding 1. It replaces venv, pip, pip-tools and pyenv. It does not add a
  layer on top of them.
- **The project is not packaged** (`[tool.uv] package = false`). This is an
  application, not a library. No build backend, no wheel, no `src/` install
  step. pytest finds the package via `pythonpath = ["."]`.
- **Dependency groups** (PEP 735): runtime `[project.dependencies]`, and a
  `dev` group for test and lint tools. `uv sync` installs both by default.
- **Versions** are whatever `uv add` resolves at implementation time. They
  are recorded in `uv.lock` with `>=` lower bounds at the resolved version.
  No version is invented in this plan.

Alternatives:

- **pip + venv + `requirements.txt`**: needs `sudo apt install python3.12-venv
  python3-pip`. There is no lockfile unless pip-tools is added.
- **Poetry**: heavier, and it needs its own installer.

## 6. FastAPI application structure

The package is named `ai_service`, not `app` (OD3). A bare `app` is ambiguous
in imports, tracebacks and logger names. Layout (the full tree is in §26):

```text
ai_service/
├── __main__.py        process entry: parse config → configure logging → uvicorn.run
├── main.py            create_app(settings) → FastAPI   (the one app factory)
├── config.py          Settings model + load_settings() + ConfigError
├── api/
│   ├── __init__.py    build_router(): includes every route module
│   └── health.py      GET /health
├── core/
│   ├── errors.py      AiServiceError base, error codes, exception handlers
│   ├── logging.py     JSON formatter, configure_logging()
│   └── request_context.py   pure-ASGI middleware + contextvars
└── schemas/
    ├── errors.py      ErrorResponse (HTTP schema for ContractError)
    └── health.py      HealthResponse
```

Rules this sets up (the ADR-0013 §4 lesson, translated):

- **`create_app()` is the single source of truth for HTTP behaviour.**
  Middleware order, exception handlers, routers and docs toggling all live
  there. `__main__.py` and every test call the same factory. Nothing is
  registered at module import time.
- **`api/` holds HTTP only:** routes, parsing and mapping. When there is
  logic, it goes in a future `services/`, `agents/` or `llm/` package that
  `api/` calls. `schemas/` holds HTTP request and response models only.
  Internal models go beside the code that owns them, and none exist yet.
- **Future packages slot in beside `api/`** with no restructuring:
  `llm/`, `agents/`, `tools/`, `clients/commerce/`, `memory/`, `rag/`,
  `orchestration/`. None are created now. Empty packages would be guessed
  interfaces, the same reasoning Phase 5 (D12) applied to `api-contracts`.

## 7. API boundary

| Route | Phase 12 | Notes |
| --- | --- | --- |
| `GET /health` | **Yes** | Liveness. `{"status":"ok"}`. Unversioned. No dependency check. Same shape as commerce-api §9. |
| `GET /v1/status` | **No** (OD5) | It would have no consumer. Anything useful it could return (provider, model, environment, version) is internal configuration the brief says not to expose. |
| `/docs`, `/redoc`, `/openapi.json` | Development only (OD12) | FastAPI generates them. They are disabled when `APP_ENV != development`. |
| Any conversational route | **No** | Out of scope. No placeholder, no fake response. |

**Versioning [OD5 / follows ADR-0013 §5]:** future business routes go under
`/v1/...`, not `/api/v1/...`, to match commerce-api. `apps/web`'s proxy
already namespaces with its own `/api/<service>/` prefix (ADR-0018), so a
second `/api` inside the service would be redundant.

**Commerce boundary [ESTABLISHED, §4.1/§4.2]:** the service has no database
driver, no connection string and no credentials. It will reach commerce-api
over HTTP only, in a later phase. Phase 12 makes this structural where it
can (§15, `test_boundaries.py`): a dependency allowlist, plus a scan for
forbidden imports.

## 8. Configuration architecture [OD4]

**Recommend a plain Pydantic model parsed from `os.environ`, with no config
library.** This mirrors ADR-0013 §7, where commerce-api chose a Zod schema
over `@nestjs/config`.

- `Settings(BaseModel)` is frozen (`model_config = ConfigDict(frozen=True,
  extra="ignore")`). Its fields are typed with `Literal[...]` enums and
  bounded ints.
- `load_settings(environ: Mapping[str, str] = os.environ) -> Settings` reads
  only its own field names. On failure it raises
  `ConfigError(field_errors: list[str])`, built from
  `ValidationError.errors(include_input=False, include_url=False)`, as
  `"<field> (<type>)"` only. The value is never included. Pydantic's default
  message *does* echo the input, so this matters (AC4).
- `__main__.py` calls `load_settings()` before anything else. On
  `ConfigError` it writes the message to stderr and calls `sys.exit(1)`. This
  happens before uvicorn is imported and started, so nothing binds.
- `create_app(settings)` receives settings explicitly and stores them on
  `app.state.settings`. Tests build a `Settings` directly and never touch
  `os.environ`.
- **`.env` loading:** `uv run --env-file .env`, the equivalent of commerce-api's
  `node --env-file-if-exists`. No `python-dotenv`. This depends on
  [ASSUMPTION A3] (how uv behaves when the file is missing), which 12.1
  verifies. If uv errors on a missing file, the run command needs a
  documented fallback: either `cp .env.example .env` as a documented
  first step, or `UV_ENV_FILE`. That is decided then, not guessed now.
- **Secrets, for later phases:** every future secret field will be
  `pydantic.SecretStr`, whose `repr` and `str` are masked. The rule and the
  pattern are recorded in ADR-0019 and in a `config.py` comment. No secret
  field exists in Phase 12.

Alternative: `pydantic-settings`. It is the FastAPI-idiomatic choice, with
`.env` support through python-dotenv. The cost is one more dependency and its
own error formatting, which must still be wrapped to hide values.

## 9. Environment variables

Only variables Phase 12 actually reads:

| Variable | Type / allowed | Default | Why now |
| --- | --- | --- | --- |
| `APP_ENV` | `development` \| `test` \| `production` | `development` | Toggles the OpenAPI docs (OD12) and the default log format. The same three values as commerce-api's `NODE_ENV`. |
| `HOST` | non-empty string | `127.0.0.1` | Bind address. Loopback by default, matching commerce-api and web (ADR-0018 S2). |
| `PORT` | int, 1–65535 | `3002` | web is 3000 and commerce-api is 3001 (OD14). |
| `LOG_LEVEL` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` \| `CRITICAL` | `INFO` | Python's own level names, rather than inventing a mapping from Nest's names. |
| `LOG_FORMAT` | `json` \| `pretty` | `json` | Same as commerce-api. `pretty` is for local reading only. |

**Deliberately not added:** `AI_PROVIDER`, `AI_MODEL`, any `*_API_KEY`
(OD7), `COMMERCE_API_BASE_URL` (OD8), `CORS_*` (OD11) and `DATABASE_URL`
(forbidden by §4.1). A variable nothing reads is configuration that lies.

`.env.example` lists exactly the five variables above, with comments, in the
same style as `apps/commerce-api/.env.example`. `.env` is already ignored by
git.

## 10. AI provider abstraction [OD7]

**Recommend: no provider interface, no provider config, and no `llm/`
package in Phase 12.** Only the extension point is recorded.

- There is no caller, so any interface written now is a guess. ADR-0007 made
  the same call for voice: "an interface guessed now would almost certainly
  be wrong in the way that matters". Here, what matters is streaming,
  tool-call shapes and structured output.
- The target stack is LangChain/LangGraph, and it already *is* a provider
  abstraction (`BaseChatModel`, `init_chat_model("provider:model")`). A
  hand-rolled `ModelProvider` Protocol now would either duplicate it or
  fight it.
- **The extension point that is established:**
  - Provider selection will be configuration (`AI_PROVIDER`, `AI_MODEL`, and
    `SecretStr` keys), added by the phase that adds the first provider.
  - Provider code will live in `ai_service/llm/`, and only there. Nothing
    else imports a provider SDK. `test_boundaries.py` enforces this today by
    forbidding all provider SDKs. The later phase changes that to "allowed
    only under `llm/`".
  - `/health` will never depend on a provider (§13).

Alternative: a `ModelProvider` Protocol with a `NullProvider` and
`AI_PROVIDER=none`. It is small, but it is code with no behaviour and an
interface fixed before its constraints are known.

## 11. Error-handling strategy

**Wire shape [OD9]:** always a `@contracts/common` `ContractError`
(`{code, message, field?}`), the same body commerce-api returns (§5 of
`commerce-api.md`). `code` is the only field a caller may branch on.

**Model [OD9, recommended]:** `schemas/errors.py:ErrorResponse` is a
hand-written Pydantic model of that shape (`extra="forbid"`). A test validates
every error body the app can produce against the *committed*
`packages/contracts/common/schema/error.v1.json`, using `jsonschema`. The
file is read from the repository at test time, so if the shared schema
changes, this test fails.

This is a scoped, guarded exception to ADR-0003's "Pydantic is generated",
and it needs explicit approval. The codegen pipeline stays deferred to the
first phase that consumes a contract family (see §24 OD9 for the
alternatives).

**Mapping** (all in `core/errors.py`, registered by `create_app`):

| Source | Status | Code | Message |
| --- | --- | --- | --- |
| `RequestValidationError` | **400** (OD10) | `INVALID_PAYLOAD` | `"<loc>: <type>"`, bounded to 500 characters. `field` is the dotted location, bounded to 64. The input is never included. |
| `StarletteHTTPException` 404 | 404 | `ROUTE_NOT_FOUND` | static |
| `StarletteHTTPException` 405 | 405 | `METHOD_NOT_ALLOWED` | static (keeps the `Allow` header) |
| Other `StarletteHTTPException` | its status | `HTTP_ERROR` | static per status, never `exc.detail` |
| `AiServiceError` (service base) | its `status` | its `code` | its `message` (the author is responsible for keeping it safe) |
| Any other `Exception` | 500 | `INTERNAL_ERROR` | `"Internal server error."` The traceback is logged with `request_id` and never returned. |

- `AiServiceError(code, status, message, field=None)` is the one base class
  for future service errors (downstream commerce-api errors, model errors).
  **No concrete codes beyond the rows above are defined now.** Codes like
  `COMMERCE_API_UNAVAILABLE` or `MODEL_TIMEOUT` arrive with the phase that
  can raise them, the same rule as `common/errors.ts`.
- **Configuration errors are not HTTP errors.** They stop the process at
  boot (§8).
- **Unhandled errors and headers:** the 500 handler is registered for
  `Exception`, which Starlette routes to its outermost `ServerErrorMiddleware`.
  That is why the request-context middleware must be pure ASGI and must add
  headers itself when it catches the exception (§12). A test asserts headers
  on the 500 response (AC6).

## 12. Logging strategy [OD16]

- **Standard library `logging` plus one small JSON formatter.** No
  structlog or loguru. Output is one JSON object per line on stdout, with
  keys `timestamp` (ISO-8601 UTC), `level`, `logger`, `message`,
  `request_id` and `correlation_id` (when in a request), plus `exc_info` for
  errors. `LOG_FORMAT=pretty` uses a plain human-readable formatter.
- **Request context:** `core/request_context.py` is a *pure ASGI* middleware,
  installed outermost among user middleware. For each request it:
  - generates a `request_id` (UUID4)
  - accepts the inbound `X-Correlation-Id` if it satisfies the same bounds as
    `correlationIdSchema` (a non-empty string of at most
    `MAX_CORRELATION_ID_LENGTH` characters, the value read from
    `common/src/ids.ts` at implementation time), and otherwise generates one
  - sets both in `contextvars`
  - adds both response headers on every `http.response.start`
  - if the app raises, catches the exception once, logs it with traceback,
    sends the 500 `ContractError` with headers itself, and does not re-raise
    to the server

  A logging `Filter` copies the contextvars onto every record, so call sites
  never pass ids explicitly. This is the Python equivalent of `AppLogger` plus
  `AsyncLocalStorage`.
- **One completion line per request** from the same middleware: `method`,
  `path` (from `scope["path"]`, with no query string), `status` and
  `duration_ms`.
- **Uvicorn's access log is off** (`access_log=False`), because it prints the
  query string. Uvicorn's own `uvicorn` and `uvicorn.error` loggers are
  routed through our formatter (`log_config=None`, handlers configured by
  `configure_logging`).
- **Never logged, by any code path:** request or response headers
  (including `Authorization`), bodies, query strings, config values, and in
  future prompts or completions unless explicitly approved. AC7 tests assert
  this with sentinel values.
- **Not doing:** OpenTelemetry, tracing, metrics (all out of scope per
  `CLAUDE.md`).

## 13. Health / readiness strategy [OD6]

- `GET /health` means "the process is up and the event loop answers". It
  returns `200 {"status":"ok"}`, is unversioned and checks no dependency.
- **No readiness endpoint.** There is nothing to be ready *for*: no provider,
  no commerce-api client and no database. A readiness check with no checks is
  the same as liveness. This matches commerce-api (ADR-0013, ADR-0017 OD15).
- **Future rule (recorded in ADR-0019):** liveness never depends on an LLM
  provider or on commerce-api. If readiness is added later, it covers
  dependencies the service *must* have in order to serve. Even then, a
  provider outage should degrade responses, not fail readiness. That is for
  the provider phase to decide.

## 14. CORS strategy [OD11]

**Recommend: no CORS middleware, and loopback bind.** The only future browser
caller is `apps/web`, and ADR-0018 already set the pattern: the browser calls
its own origin, and Next.js rewrites to a server-only URL. The phase that
connects web to ai-service adds `/api/ai/v1/*` to that proxy. No
cross-origin browser access exists, so allowing any is only surface area.
The rejected alternative for commerce-api (ADR-0018 OD1) was also CORS.

## 15. Testing strategy

- **pytest** (ADR-0006, named for Python) with FastAPI's `TestClient`
  (needs `httpx`). Everything runs in-process: no sockets, no network, no
  provider and no database. It runs in seconds.
- **Fixtures:**
  - `conftest.py` builds `Settings(app_env="test", ...)` directly and
    creates the app with `create_app(settings)`, never through `os.environ`.
  - A test-only router (inside `tests/`, never shipped) adds:
    - `POST /__test/echo`, with a Pydantic body, to exercise validation
    - `GET /__test/boom`, to exercise the 500 path

    It is included through `create_app(settings, extra_routers=[...])`. This
    is the same idea as commerce-api's `validation-fixture.controller.ts`.
- **Test files and what they cover:**

| File | Covers |
| --- | --- |
| `test_config.py` | Defaults. Each field's valid and invalid values. `ConfigError` names field and type, never the value (sentinel check). Frozen settings. Unknown env keys ignored. |
| `test_main.py` | `__main__` with invalid env exits non-zero, and `uvicorn.run` is never called (monkeypatched). With valid env, `uvicorn.run` is called with host, port, `access_log=False`, `log_config=None`. |
| `test_health.py` | 200, exact body, no dependency. |
| `test_errors.py` | 404, 405, 400 (field bounded, no echo of a sentinel input), 500 (static message, no traceback text, no sentinel from the exception), a `AiServiceError` subclass. **Every body validated against `error.v1.json`.** |
| `test_request_context.py` | Both headers on 200, 400, 404, 405, 500. Request id always new, even when a client sends one. A valid correlation id is echoed; an empty, over-long or missing one is replaced. |
| `test_logging.py` | JSON lines parse. The completion line has method, path, status, duration and ids. Sentinel header values, query string and body never appear in captured output. The 500 path logs a traceback with `request_id`. |
| `test_docs_toggle.py` | `/docs`, `/redoc`, `/openapi.json`: 200 in development, 404 `ROUTE_NOT_FOUND` in test and production. |
| `test_boundaries.py` | Dependencies in `pyproject.toml` are a subset of a declared allowlist. An AST scan of `ai_service/**/*.py` finds no import of forbidden top-level modules (`psycopg`, `psycopg2`, `asyncpg`, `sqlalchemy`, `sqlmodel`, `pg8000`, `openai`, `anthropic`, `langchain*`, `langgraph*`, `ollama`, `httpx` (runtime; test use is fine), `requests`, `redis`, `qdrant_client`, …). No `Settings` field name matches `database`, `db_`, `_url` or `api_key`. |

- **The boundary test is checked to be able to fail.** A temporary forbidden
  import is added, the test is run and seen to fail, then the import is
  removed. This follows the precedent of ADR-0012/0013 verifying their lint
  rules.
- **Not in Phase 12:** load, performance or network tests, and coverage
  thresholds.

## 16. Development workflow

All commands run from `apps/ai-service/` (OD1 = uv assumed):

| Task | Command |
| --- | --- |
| One-time: install uv | *(human, outside the repo)* e.g. the official installer or a distro package. The command used is recorded in `getting-started.md`. |
| Install / sync | `uv sync` (creates `.venv`; installs Python 3.12 if missing) |
| Run (dev, reload) | `uv run --env-file .env python -m ai_service --reload` *(the reload flag is passed to uvicorn by `__main__`; exact form is settled in 12.1)* |
| Run (no reload) | `uv run --env-file .env python -m ai_service` |
| Test | `uv run pytest` |
| Lint | `uv run ruff check .` |
| Format check | `uv run ruff format --check .` |
| Type check | `uv run mypy` |

- There are no root-level wrappers. Adding a `package.json` script for the
  Python service would pull it into the pnpm graph, which ADR-0002 forbids.
  `getting-started.md` gains an **"Running the three apps independently"**
  table: web (`pnpm --filter web dev`), commerce-api (DB + `pnpm --filter
  commerce-api dev`), and ai-service (the command above). The note makes
  clear the three do not depend on each other at startup.
- **Lint and type tooling [OD13]:** Ruff (lint + format, one tool) and
  mypy (`strict = true`, `files = ["ai_service"]`, with the Pydantic mypy
  plugin). Tests are type-checked non-strictly, or excluded if that proves
  noisy; decided in 12.1 and recorded.

## 17. Docker decision [OD15]

**No Dockerfile and no Compose service for ai-service.** Docker in this
repository has one job: local PostgreSQL. The Compose file says so in its
header, and Phase 10 OD11 set that scope. ai-service has no infrastructure
dependency, and `uv` already gives a reproducible environment. A container
would also be the first step toward production packaging, which is out of
scope. Revisit when a deploy phase exists.

## 18. Files to create

All under `apps/ai-service/` unless stated otherwise.

| File | Purpose |
| --- | --- |
| `pyproject.toml` | PEP 621 metadata. Runtime and `dev` dependency groups. Config for `[tool.uv]`, `[tool.pytest.ini_options]`, `[tool.ruff]` and `[tool.mypy]`. |
| `uv.lock` | Generated and committed. |
| `.python-version` | `3.12` |
| `.env.example` | The five variables in §9 |
| `README.md` | What the service is and is not. Its boundary rules. Commands. Pointer to `getting-started.md`. |
| `ai_service/__init__.py` | Package marker. Exposes `__version__`, read from package metadata or a constant (settled in 12.1). |
| `ai_service/__main__.py` | Entry point (§8) |
| `ai_service/main.py` | `create_app()` |
| `ai_service/config.py` | `Settings`, `load_settings`, `ConfigError` |
| `ai_service/api/__init__.py`, `api/health.py` | Router and `/health` |
| `ai_service/core/__init__.py`, `core/errors.py`, `core/logging.py`, `core/request_context.py` | §11, §12 |
| `ai_service/schemas/__init__.py`, `schemas/errors.py`, `schemas/health.py` | HTTP schemas |
| `tests/__init__.py`, `tests/conftest.py`, `tests/fixtures_routes.py` | Fixtures and the test-only router |
| `tests/test_config.py`, `test_main.py`, `test_health.py`, `test_errors.py`, `test_request_context.py`, `test_logging.py`, `test_docs_toggle.py`, `test_boundaries.py` | §15 |
| `docs/api/ai-service.md` | HTTP surface, in the same format as `commerce-api.md`: style, versioning, response and error body, codes, headers, logging, health, and what it does not cover |
| `docs/features/phase-12-ai-service-foundation/*` | These three documents (already created by `/plan`) |

## 19. Files to modify

| File | Change |
| --- | --- |
| `docs/development/getting-started.md` | Status paragraph, "Current state" row, the Python prerequisite row (with the verified version), the ai-service command table (replacing the `NOT_CONFIGURED` row), the "run the three apps independently" table, repository layout line, "Next step". *Q1: the stale "Nothing calls the Commerce API yet" clause next to it.* |
| `docs/architecture/architecture-decisions.md` | Add **ADR-0019**: ai-service foundation (toolchain, layout, config, errors, logging, health, boundaries, the scoped ADR-0003 exception). Add an index row. Note on ADR-0006: the pytest half is now in force for Python (the ADR stays Superseded for TypeScript; a one-line note only). |
| `docs/architecture/system-architecture.md` | §1 row: stack "Python, FastAPI (LangChain, LangGraph later)". §6 last paragraph: Pydantic generation deferred to the first phase that consumes a contract family (ADR-0019). §8 gap 2: a test now guards §4.1 (dependency and import scan), but it is still not network or credential separation. |
| `.gitignore` | Add `.mypy_cache/` (only if OD13 adopts mypy). |

Not modified: `CLAUDE.md`, the root `package.json`, `pnpm-workspace.yaml`,
`turbo.json`, `eslint.config.mjs`, any file under `apps/web`,
`apps/commerce-api` or `packages/`, and `infrastructure/`.

## 20. Dependencies to add

Versions are resolved by `uv add` at implementation time and recorded in
`uv.lock`. None are invented here.

| Package | Group | Why |
| --- | --- | --- |
| `fastapi` | runtime | The framework (plain `fastapi`, not `fastapi[standard]`, which pulls in the CLI, email-validator, and more) |
| `uvicorn` | runtime | ASGI server (plain, not `[standard]`: no uvloop or httptools until they are needed) |
| `pydantic` | *(transitive via FastAPI; declared explicitly because `config.py` imports it directly)* | Settings and schemas |
| `pytest` | dev | Test runner |
| `httpx` | dev | Required by `TestClient` |
| `jsonschema` | dev | Conformance test against `error.v1.json` (OD9) |
| `ruff` | dev | Lint and format (OD13) |
| `mypy` | dev | Type check (OD13) |

Not added: `pydantic-settings`, `python-dotenv`, `structlog`,
`pytest-asyncio` (nothing async to test directly), `pytest-cov`, and any
LangChain, provider, HTTP-client or DB package.

## 21. Acceptance criteria

AC1–AC13 in `requirements.md`. They are not restated here, to avoid drift.

## 22. Validation commands

**Today every Python check is `NOT_CONFIGURED`.** The commands below are
*introduced* by 12.1 and become the declared commands once
`getting-started.md` records them:

| Check | Command (from `apps/ai-service`) |
| --- | --- |
| install | `uv sync` (and `uv sync --locked` to prove the lock is current) |
| test | `uv run pytest` |
| lint | `uv run ruff check .` |
| format | `uv run ruff format --check .` |
| types | `uv run mypy` |
| live | run command + `curl -i http://127.0.0.1:3002/health`, plus error, header and log checks (test plan, manual checks) |

Regression, using existing declared commands from the repository root:
`pnpm turbo run lint typecheck test build --force`.

## 23. Risks

| Risk | Impact | Handling |
| --- | --- | --- |
| Toolchain unavailable (no pip, no uv) | 12.1 cannot start | OD1. The human installs uv first. I do not install anything. |
| Correlation headers missing on 500s (Starlette `ServerErrorMiddleware` sits outside user middleware; the same class of bug as ADR-0013's 413) | Untraceable failures, precisely when tracing matters | Pure ASGI context middleware that owns the 500 response. The 500-path header test is written in 12.2 before the handler code. A live curl check covers it too. |
| Pydantic error messages echo input values (`ValidationError` `input` field) | A secret or customer text in logs or config errors | `errors(include_input=False)`. Sentinel-value tests for config and request validation. |
| `jsonschema`/draft 2020-12 support, or reading a file outside the app dir, makes the conformance test brittle | A flaky or failing guard | Read by a path relative to the repository root, and fail clearly if the file is missing. Check that `jsonschema` supports 2020-12 in 12.3. |
| `uv run --env-file` behaviour on a missing `.env` [A3] | A confusing run command | Verified in 12.1. The fallback is documented, not guessed. |
| Hand-written `ErrorResponse` drifts from `ContractError` | Different error shapes for two services | The conformance test fails on drift in the committed schema. OD9 names the long-term fix (codegen). |
| Two languages, two command sets, no CI (ADR-0002 cost) | Python checks forgotten on a TS change and the other way round | Documented side by side in `getting-started.md`. CI stays a recorded gap. |
| Precedent risk: later phases copy these patterns | A mistake repeats with real keys and prompts | Security review of 12.2 and 12.3. ADR-0019 states the redaction and secret rules explicitly. |
| Over-building (empty future packages, fake endpoints) | Guessed interfaces | Explicitly excluded (§6, §7, §10). The reviewer checks it. |

## 24. Open decisions (each with a recommendation)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| OD1 | Dependency tool (**blocker**) | **uv + `pyproject.toml` + committed `uv.lock`**. The human installs uv before 12.1. | `apt install python3.12-venv python3-pip` + venv + `requirements.txt` (no lock), or Poetry |
| OD2 | Python version | **3.12** (`>=3.12,<3.13`, `.python-version`) | 3.13 via `uv python install` |
| OD3 | Package name and layout | **`ai_service/` at the app root, unpackaged** (`package = false`) | `app/` (the brief's example), or `src/ai_service/` with a build backend |
| OD4 | Config mechanism | **Plain Pydantic `BaseModel` over `os.environ`, `.env` via `uv run --env-file`** | `pydantic-settings` (+ python-dotenv) |
| OD5 | Routes beyond `/health` | **None**. Future routes go under `/v1`, not `/api/v1`. | Add `GET /v1/status` returning `{service, version}` only |
| OD6 | Readiness | **None**. `/health` is liveness only. | `GET /health/ready` with no checks (the same as liveness) |
| OD7 | Provider abstraction | **None now**. `llm/` is the reserved location. No `AI_PROVIDER`/`AI_MODEL`. | `ModelProvider` Protocol + `NullProvider` + `AI_PROVIDER=none` |
| OD8 | `COMMERCE_API_BASE_URL` | **Not added** (nothing calls commerce-api) | Add it, validated but unused |
| OD9 | Error model vs ADR-0003 | **Hand-written `ErrorResponse`, conformance-tested against the committed `error.v1.json`**. Codegen is deferred to the first contract-consuming phase. Recorded in ADR-0019 as a scoped exception. | (a) Build the JSON Schema → Pydantic codegen now (new tool, e.g. `datamodel-code-generator`; answers ADR-0012's discriminated-union question early, but for no consumer). (b) FastAPI's default `{"detail": ...}` (inconsistent with commerce-api). |
| OD10 | Validation status code | **400 `INVALID_PAYLOAD`** (same as commerce-api) | FastAPI's default 422 |
| OD11 | CORS | **None**. Future browser access goes through the `apps/web` proxy (ADR-0018 pattern). | `CORSMiddleware` with an env allowlist |
| OD12 | OpenAPI docs routes | **Enabled only when `APP_ENV=development`** | Always on, or always off |
| OD13 | Lint and type tools | **Ruff (lint + format) + mypy strict on `ai_service/`** | Ruff only (defer typing), or pyright |
| OD14 | Default port | **3002** | Any other free port |
| OD15 | Docker | **None this phase** | Dockerfile + a Compose service |
| OD16 | Logging library | **stdlib `logging` + own JSON formatter** | `structlog` |

## 25. Implementation order

Four sub-phases. Each ends green on the Python checks as they exist so far.
The Full Path suggests approving phase by phase, so the human may approve
12.1 on its own first.

### 12.1 — Toolchain and skeleton *(blocked on OD1)*
- [ ] Confirm the human installed the chosen tool, and record its version.
- [ ] `pyproject.toml` (Ruff, mypy, pytest config), `uv add` the §20
  dependencies, `uv.lock`, `.python-version`.
- [ ] `ai_service/{__init__,__main__,main,config}.py`, `api/health.py`,
  `schemas/health.py`. Minimal `create_app`.
- [ ] `test_config.py`, `test_main.py`, `test_health.py`.
- [ ] Verify A3 (`--env-file` with a missing file) and settle the run
  command.
- **Done when:** AC1, AC2, AC3 and AC4 pass, and `ruff`, `format --check`
  and `mypy` pass.

### 12.2 — Request context and logging
- [ ] `core/request_context.py` (pure ASGI) and `core/logging.py`. Uvicorn
  logging routed through them, with the access log off.
- [ ] The test-only router (`/__test/echo`, `/__test/boom`).
  `test_request_context.py` and `test_logging.py`, **with the 500-path
  header test written first**.
- **Done when:** AC6 and AC7 pass.

### 12.3 — Error model
- [ ] `schemas/errors.py`, `core/errors.py` (the §11 mapping,
  `AiServiceError`), the docs toggle.
- [ ] `test_errors.py` (including the `error.v1.json` conformance check),
  `test_docs_toggle.py`.
- **Done when:** AC5 and AC8 pass.

### 12.4 — Boundary guard, docs and full validation
- [ ] `test_boundaries.py`. Show it fails once with a temporary forbidden
  import, then remove the import.
- [ ] `README.md`, `.env.example`, `docs/api/ai-service.md`, ADR-0019,
  `system-architecture.md`, `getting-started.md`, `.gitignore`.
- [ ] Full Python check set. Root turbo regression with `--force`. Live
  checks with evidence. AC12 diff check (`git status --porcelain`).
- **Done when:** AC9–AC13 pass. Ready for `/validate` → `/review` →
  security review → `/final-review`.

## 26. Expected final directory structure

```text
apps/ai-service/
├── .env.example
├── .python-version
├── README.md
├── pyproject.toml
├── uv.lock
├── ai_service/
│   ├── __init__.py
│   ├── __main__.py
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── health.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── errors.py
│   │   ├── logging.py
│   │   └── request_context.py
│   └── schemas/
│       ├── __init__.py
│       ├── errors.py
│       └── health.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── fixtures_routes.py
    ├── test_boundaries.py
    ├── test_config.py
    ├── test_docs_toggle.py
    ├── test_errors.py
    ├── test_health.py
    ├── test_logging.py
    ├── test_main.py
    └── test_request_context.py

# future, not created: ai_service/{llm,agents,tools,clients/commerce,memory,rag,orchestration}/
```

---

## Assumptions

- **A1 [verified]** The pnpm `apps/*` glob ignores directories without a
  `package.json`, so ai-service stays out of the workspace. This is
  re-verified in 12.4 with `pnpm ls -r --depth -1`.
- **A2 [unverified]** The current FastAPI, Starlette, uvicorn and Pydantic
  releases support Python 3.12 (expected; confirmed by `uv add` resolving).
- **A3 [unverified]** How `uv run --env-file` behaves when the file is
  missing. Verified in 12.1.
- **A4 [unverified]** `jsonschema` validates draft 2020-12 (which
  `error.v1.json` declares). Verified in 12.3.
- **A5 [verified]** `.gitignore` already covers `.venv/`, `__pycache__/`,
  `.pytest_cache/`, `.ruff_cache/` and `.env`.
- **A6 [verified]** commerce-api's header, error and health rules are as
  documented in `docs/api/commerce-api.md` §5–§9. This plan mirrors them.
- **A7 [verified]** No existing file references `apps/ai-service` in a way
  that breaks when it gains content (only docs mention it).

## Not doing

- Everything in `requirements.md` "Out of scope".
- Root `package.json` scripts or turbo tasks for Python.
- CI workflows.
- [OPTIONAL] pre-commit hooks, `pytest-cov`, `uvicorn[standard]`,
  `pip-audit` for dependency hygiene. `uv lock` plus reviewed diffs of
  `uv.lock` are the hygiene in this phase. A `uv pip audit` step, or
  similar, is a candidate for a later phase and is noted in ADR-0019.
- [OPTIONAL] A body-size limit and JSON content-type guard like
  commerce-api's. Nothing accepts a body yet, so these arrive with the first
  POST route. Recorded as a rule in ADR-0019.

## Open questions

- **Q1:** `getting-started.md`'s status paragraph says "Nothing calls the
  Commerce API yet". That has been stale since Phase 11, and it is in the
  sentence Phase 12 must edit. Can it be corrected in that same edit, or
  should it only be recorded as a follow-up?
- **Q2:** Keep the risk at HIGH/Full, or lower it to MEDIUM/Standard (see
  `requirements.md`)?

## Specialised review needed?

- **security: yes.** It is a new listener. The review should cover the
  error handlers (no leakage), log redaction, config-error value hiding, the
  loopback default, the docs toggle, and the future-secrets rule. It is a
  small surface, but it sets the pattern every AI phase inherits.
- **performance: no.** One trivial route.
- **data / migration: no.** No data, no schema, no persistence.
