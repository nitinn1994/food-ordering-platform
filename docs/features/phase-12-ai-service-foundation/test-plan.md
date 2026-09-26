# Test Plan — Phase 12: Python AI Service Foundation

## What will be tested

| Acceptance criterion | How it is verified | Type |
| -------------------- | ------------------ | ---- |
| AC1: project files, outside the pnpm workspace | Files exist. `pnpm ls -r --depth -1` does not list ai-service. There is no `apps/ai-service/package.json`. | manual (command output recorded) |
| AC2: clean install, and tests with no network, `.env`, API or DB | Delete `.venv`, then run `uv sync --locked` and `uv run pytest` with commerce-api and PostgreSQL stopped and no `.env` present | automated + manual setup |
| AC3: runs on 127.0.0.1:3002 and `/health` is independent | `test_health.py`. Live: start the service with commerce-api and DB stopped, then `curl -i http://127.0.0.1:3002/health`. | automated + manual |
| AC4: invalid config exits before binding, and the value is never printed | `test_config.py`, `test_main.py` (sentinel value, `uvicorn.run` never called). Live: `PORT=abc` and `APP_ENV=staging` each exit 1, and nothing listens on the port. | automated + manual |
| AC5: `ContractError` on every error, conforming to `error.v1.json` | `test_errors.py` (404, 405, 400, 500, `AiServiceError` subclass). Each body is validated with `jsonschema` against the committed schema. | automated |
| AC6: `X-Request-Id` and `X-Correlation-Id` on every response, including 500 | `test_request_context.py`, parametrized over 200/400/404/405/500 | automated + live curl on 404 and 200 |
| AC7: JSON logs, completion line, redaction | `test_logging.py` (sentinel header, query and body values are absent; traceback plus `request_id` on 500). Live: inspect stdout for one request with `?secret=SENTINEL` and an `Authorization: Bearer SENTINEL` header. | automated + manual |
| AC8: no CORS, loopback default, docs only in development | `test_docs_toggle.py`. An assertion that no `CORSMiddleware` is in `app.user_middleware`. A default-`HOST` test in `test_config.py`. | automated |
| AC9: boundary guard | `test_boundaries.py` (dependency allowlist, AST import scan, `Settings` field-name check). Shown able to fail: a temporary forbidden import makes it fail, then the import is removed. | automated + one manual negative run |
| AC10: lint, format and types | `ruff check`, `ruff format --check`, `mypy` | automated |
| AC11: docs | Review: every command in `getting-started.md` for ai-service was actually run, and its output recorded in the implementation report | manual |
| AC12: changes only in allowed paths | `git status --porcelain` shows only `apps/ai-service/`, `docs/` and `.gitignore` | manual |
| AC13: TS regression | `pnpm turbo run lint typecheck test build --force` passes. Test count unchanged from 815. | automated |

## New or changed tests

All new, under `apps/ai-service/tests/`:

| Test | Covers | File |
| ---- | ------ | ---- |
| Settings defaults, bounds, enums, frozen, ignores unknown keys; `ConfigError` hides values | AC4, AC8 (default host) | `test_config.py` |
| Entry point exits 1 on bad env without starting uvicorn; passes host, port, `access_log=False` and `log_config=None` | AC3, AC4, AC7 | `test_main.py` |
| `/health` returns 200 and the exact body | AC3 | `test_health.py` |
| Error mapping and `error.v1.json` conformance | AC5 | `test_errors.py` |
| Header presence across all response classes; correlation echo and replace rules | AC6 | `test_request_context.py` |
| JSON format, completion line, redaction, 500 traceback | AC7 | `test_logging.py` |
| OpenAPI and docs routes per `APP_ENV`; no CORS middleware | AC8 | `test_docs_toggle.py` |
| Dependency allowlist, forbidden imports, config field names | AC9 | `test_boundaries.py` |
| Test-only router (`/__test/echo`, `/__test/boom`), not shipped | fixtures | `fixtures_routes.py`, `conftest.py` |

No existing test changes. No file outside `apps/ai-service` gains or loses a
test.

## Validation commands

**Current state: every ai-service check is `NOT_CONFIGURED`.** No Python
command is declared anywhere in the repository today. The commands below are
*introduced by this plan* (12.1). They become declared commands only once
`pyproject.toml` and `getting-started.md` contain them. Until then, they must
not be reported as anything but `NOT_CONFIGURED`.

From `apps/ai-service/`:

| Check  | Command | Expected |
| ------ | ------- | -------- |
| install | `uv sync --locked` | PASS |
| format | `uv run ruff format --check .` | PASS |
| lint   | `uv run ruff check .` | PASS |
| types  | `uv run mypy` | PASS |
| test   | `uv run pytest` | PASS |
| build  | — (unpackaged application; no build step) | NOT_APPLICABLE |

From the repository root (existing, declared commands, used as a regression
check):

| Check  | Command | Expected |
| ------ | ------- | -------- |
| lint   | `pnpm turbo run lint --force` | PASS |
| types  | `pnpm turbo run typecheck --force` | PASS |
| test   | `pnpm turbo run test --force` | PASS (815 tests, unchanged) |
| build  | `pnpm turbo run build --force` | PASS |

`pnpm --filter commerce-api test:db`: `NOT_APPLICABLE`. Phase 12 does not
touch commerce-api or the database.

## Manual checks

Run against the live process, with the output recorded in the implementation
report:

1. With commerce-api and PostgreSQL stopped, start ai-service with the
   documented run command. `curl -i http://127.0.0.1:3002/health` returns
   `200 {"status":"ok"}` with both correlation headers.
2. `curl -i http://127.0.0.1:3002/nope` returns `404 ROUTE_NOT_FOUND` with
   both headers. `curl -i -X POST http://127.0.0.1:3002/health` returns
   `405 METHOD_NOT_ALLOWED`.
3. `curl -i -H 'X-Correlation-Id: abc-123' .../health` echoes `abc-123`.
   Sending `X-Request-Id: evil` does not echo `evil`.
4. `curl -i -H 'Authorization: Bearer SENTINEL_TOKEN' '.../health?k=SENTINEL_QS'`:
   neither sentinel appears anywhere in stdout or stderr. Exactly one
   completion line is logged, with path `/health`.
5. `PORT=abc uv run python -m ai_service` exits 1, and the message names
   `PORT` but not `abc`. The same check with `APP_ENV=staging`.
6. With `APP_ENV=production`, `/docs` and `/openapi.json` return 404. With
   `APP_ENV=development`, they return 200.
7. `ss -ltnp | grep 3002` shows the listener on `127.0.0.1` only.

## Not covered

- **Live 500 path.** There is no shipped route that raises, and one will not
  be added to production code. It is covered in-process by the test-only
  router instead. This is acceptable because the same `create_app` and
  middleware run in both.
- **Browser checks:** `NOT_APPLICABLE`. There is no UI, and `apps/web` does
  not call ai-service in this phase.
- **Concurrency, load or performance:** one trivial route. Out of scope.
- **Dependency vulnerability scanning:** not configured in the repository.
  Recorded as optional in `plan.md` "Not doing".
- **CI:** none exists. The Python checks have to be run by hand alongside
  turbo (ADR-0002's recorded cost).
