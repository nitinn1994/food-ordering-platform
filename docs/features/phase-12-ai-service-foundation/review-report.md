# Review Report — Phase 12: Python AI Service Foundation

**Reviewed:** `requirements.md`, `plan.md` and `test-plan.md` first, then every
new file under `apps/ai-service/` (except `.venv/`; `uv.lock` only
sanity-checked), `docs/api/ai-service.md`, and the diffs of `.gitignore`,
`architecture-decisions.md`, `system-architecture.md` and `getting-started.md`.
There were two passes: my own, and an independent `implementation-reviewer`
agent. The agent re-ran `pytest`, `ruff check`, `ruff format --check`, `mypy`,
`pnpm ls -r --depth -1`, `git status` and the live checks itself. It also
reproduced finding 1 end to end.
**Path:** Full

## Verdict

Sound, and within the approved scope. All acceptance criteria are met. There
is one MEDIUM correctness gap in the error mapping (finding 1). It is small,
it leaks nothing, and it should be fixed before later phases copy the
pattern. Nothing is BLOCKER or HIGH.

## Findings

| # | Severity | File:line | Finding | Suggested fix |
| - | -------- | --------- | ------- | ------------- |
| 1 | MEDIUM — **FIXED** (after review, at the human's request) | `apps/ai-service/ai_service/core/errors.py:114` (`_handle_http`) | `HTTPStatus(exc.status_code).phrase` raises `ValueError` for a status code that is not in Python's `HTTPStatus` enum (reproduced: `HTTPStatus(299)` → `ValueError`). A route that raises `HTTPException(status_code=299)` therefore makes the *handler* fail. The request-context middleware catches that, so the client gets `500 INTERNAL_ERROR` instead of the documented "its own status, `HTTP_ERROR`" (`plan.md` §11; `docs/api/ai-service.md` §5). Nothing leaks: headers and body stay correct, and the traceback stays server-side. It is dormant today, because the only test route uses 418, which is in the enum. It matters because a later phase that passes through a downstream status would hit it. Confirmed by running code (the reviewer agent), not inferred. | Fall back to a static phrase when the code is not in the enum, for example `try: phrase = HTTPStatus(code).phrase` / `except ValueError: phrase = "HTTP error."`. Add a test with a non-enum code (such as 299 or 499) to the `test_errors.py` parametrization, run through the `error.v1.json` check. **Done:** `_status_phrase()` falls back to `"HTTP error."`. The test-only route `/__test/nonstandard-status` raises 499, and two tests (the `non-enum-http` case in the contract-error check, and `test_non_enum_status_keeps_its_status_and_a_static_phrase`) failed before the fix and pass after it. 78 tests. |
| 2 | LOW | `apps/ai-service/ai_service/core/request_context.py:96-109` | If the app raises *after* the response has started (possible only with a streaming response, and none exists), the middleware logs the exception and records `status: 500` on the completion line. The client, meanwhile, already received the original status and an unfinished body. The log then disagrees with what the client saw. This path has no test. | When the first streaming route arrives, log the started status and a `response_started: true` flag instead of overwriting it with 500, and add a test. No change is needed while no route streams. |
| 3 | NOTE | `apps/ai-service/ai_service/core/errors.py:208-221` | For an unknown body key (`extra_forbidden`), the caller-supplied *key name* appears in `field` and `message`, capped at 64 and 500 characters. Values are never echoed, as required. Echoing the location is how commerce-api's `field` works too, so this is consistent, not a defect. | None. Recorded so the security review sees it. |
| 4 | NOTE | `apps/ai-service/ai_service/core/logging.py:48-50` | `JsonFormatter` merges `extra={"fields": …}` over the core keys, so a caller *could* overwrite `message` or `request_id`. Only internal code passes `fields` today, and only the request middleware does so. | None now. If call sites multiply, reject or prefix colliding keys. |
| 5 | NOTE | `apps/ai-service/ai_service/core/errors.py:131,136,152` | The handlers narrow their type with `assert isinstance(...)`, marked `# noqa: S101`. Under `python -O` the asserts disappear. That is harmless, because Starlette only calls each handler with the exception type it was registered for. | None. |
| 6 | NOTE | `apps/ai-service/ai_service/config.py` | `HOST` accepts any non-empty value, including `0.0.0.0`. The *default* is loopback (AC8), and commerce-api behaves the same way. Binding wider is a deliberate operator choice. | None. |

No findings on scope, conventions, tests or maintainability beyond the
above.

## Requirements check

| AC | Satisfied? | How it was established |
| --- | --- | --- |
| AC1 | yes | Files present; no `package.json`; `pnpm ls -r --depth -1` does not list ai-service (both reviewers) |
| AC2 | yes | `rm -rf .venv && uv sync --locked`; 76 tests with no network interface up (`unshare -rn`) and no `.env` |
| AC3 | yes | Live `/health` returns 200 on 127.0.0.1:3002 with commerce-api and PostgreSQL stopped |
| AC4 | yes | `test_config.py`, `test_main.py`. Live `PORT=abc` / `APP_ENV=staging` exit 1, naming the field only. |
| AC5 | yes | The 400/404/405/418/499/409/500 bodies are all checked against `error.v1.json`. The non-enum case was added by the finding 1 fix. |
| AC6 | yes | Parametrized over 200/400/404/405/500; checked live on 200 and 404 |
| AC7 | yes | Sentinel tests, shown able to fail by injecting a leak; checked live with 0 sentinel hits |
| AC8 | yes | `test_docs_toggle.py`, and live under production and development |
| AC9 | yes | `test_boundaries.py`, shown to fail with a forbidden import and with a disallowed dependency |
| AC10 | yes | ruff, format and mypy strict all pass |
| AC11 | yes | Every documented ai-service command was run, including the `--env-file` form |
| AC12 | yes | `git status --porcelain`: changes only in `apps/ai-service/`, `docs/` and `.gitignore` |
| AC13 | yes | `pnpm turbo run lint|typecheck|test|build --force` all exit 0. The test count is 842, unchanged by this phase. `getting-started.md` records 815, which was already stale in 7627566 (follow-up). |

## Scope check

| Changed file | Serves plan phase | In scope? |
| ------------ | ----------------- | --------- |
| `apps/ai-service/pyproject.toml`, `uv.lock`, `.python-version` | 12.1 (§5, §20) | yes |
| `ai_service/{__init__,__main__,main,config}.py`, `api/*`, `schemas/health.py` | 12.1 | yes |
| `ai_service/core/{__init__,request_context,logging}.py` | 12.2 | yes |
| `ai_service/core/errors.py`, `schemas/errors.py`, `schemas/__init__.py` | 12.3 | yes |
| `tests/{conftest,fixtures_routes,test_config,test_main,test_health}.py`, `tests/__init__.py` | 12.1–12.3 | yes |
| `tests/{test_request_context,test_logging}.py` | 12.2 | yes |
| `tests/{test_errors,test_docs_toggle}.py` | 12.3 | yes |
| `tests/test_boundaries.py` | 12.4 | yes |
| `apps/ai-service/{README.md,.env.example}` | 12.4 (§18) | yes |
| `docs/api/ai-service.md` | 12.4 (§18) | yes |
| `docs/architecture/architecture-decisions.md` (ADR-0019, index row, ADR-0006 note) | 12.4 (§19) | yes |
| `docs/architecture/system-architecture.md` (§1, §6, §8 gap 2) | 12.4 (§19) | yes |
| `docs/development/getting-started.md` | 12.4 (§19). The stale Q1 clause and the stale 815 count were deliberately left alone. | yes |
| `.gitignore` (`.mypy_cache/`) | 12.4 (§19, OD13) | yes |
| `docs/features/phase-12-ai-service-foundation/*` | `/plan`, `/review` | yes |

Deviations from the plan were all reported during implementation and are
small:

- The run command has no `--env-file` by default (A3 turned out false).
- `Settings` uses `extra="forbid"` rather than `extra="ignore"`, with no
  change in behaviour.
- mypy uses an override for `jsonschema` instead of a stub package.
- mypy also covers the tests.
- One redaction assertion excludes the test client's own `httpx` logger.

## Follow-up (not done), to carry into `pr-description.md`

```text
FOLLOW-UP (not done): apps/ai-service/ai_service/core/request_context.py:96-109 — completion status after a mid-stream exception (finding 2) — handle with the first streaming route — low
FOLLOW-UP (not done): docs/development/getting-started.md (Test row) — 815 / web 277 recorded; actual 842 / web 304 since 7627566 — low
FOLLOW-UP (not done): docs/development/getting-started.md:24-26 — stale "Nothing calls the Commerce API yet" (Q1) — low
FOLLOW-UP (not done): future Commerce API client phase — silence httpx/httpcore INFO logging (rule recorded in ADR-0019) — medium
FOLLOW-UP (not done): apps/ai-service — Starlette httpx→httpx2 TestClient deprecation warning — low
```

## Not reviewed

- `uv.lock`, line by line. It was resolved by `uv add` and proved current by
  `uv sync --locked`, but individual transitive packages were not audited,
  and no vulnerability scanner is configured.
- A live 500 response. No shipped route can raise, so it was covered only
  in-process (`tests/fixtures_routes.py`), as the test plan states.
- Behaviour at `LOG_LEVEL=DEBUG`. It was not checked whether any runtime
  library (uvicorn, starlette, asyncio) emits request details at DEBUG level.
  The redaction tests run at INFO. Worth a look during the security review.
- The dedicated **security review** that `plan.md` flags (the Full Path). This
  review covered security only as part of its checklist.
