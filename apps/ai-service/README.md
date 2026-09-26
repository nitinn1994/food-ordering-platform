# ai-service

The Food Ordering Platform's Python AI service (FastAPI).

**Phase 12 foundation only.** It has configuration, one error shape,
structured logging with request correlation, and a liveness endpoint. There
is no AI behaviour yet: no LangChain or LangGraph, no model provider, no
Commerce API calls, no conversational endpoint. Those arrive in later phases
(`docs/features/phase-12-ai-service-foundation/`, ADR-0019).

## Boundaries

- It never touches the commerce database: no driver, no connection string,
  no credentials. Commerce data will come from `apps/commerce-api` over
  HTTP only (`docs/architecture/system-architecture.md` §4.1).
- It never holds or changes cart or order state itself. It will submit
  business intents to commerce-api, which decides (§4.2).
- `tests/test_boundaries.py` fails if a database driver, model SDK, AI
  framework or HTTP client becomes a dependency or is imported. Adding one
  later means changing that allowlist in the same reviewed change.

## Commands

Run from this directory. You need [uv](https://docs.astral.sh/uv/). It
installs Python 3.12 itself if the machine does not have it.

| Task | Command |
| --- | --- |
| Install | `uv sync` |
| Run | `uv run python -m ai_service` (add `--reload` while developing) |
| Run with a `.env` | `uv run --env-file .env python -m ai_service` |
| Test | `uv run pytest` |
| Lint | `uv run ruff check .` |
| Format check | `uv run ruff format --check .` |
| Type check | `uv run mypy` |

The service listens on `http://127.0.0.1:3002`. `GET /health` returns
`{"status":"ok"}`. It needs no `.env`, no running commerce-api, no
database and no network. Neither does the test suite.

These commands are not part of `pnpm turbo run …`. This service is outside
the pnpm workspace (ADR-0002), so run its checks separately. The HTTP
surface is described in `docs/api/ai-service.md`.

## Layout

```text
ai_service/
  __main__.py   entry: validate config → configure logging → uvicorn
  main.py       create_app(): the one place HTTP behaviour is wired
  config.py     Settings (environment variables)
  api/          routes (HTTP only)
  core/         errors, logging, request context
  schemas/      HTTP request/response models
tests/          pytest; fixtures_routes.py holds test-only routes
```

Future packages (`llm/`, `agents/`, `tools/`, `clients/commerce/`, …) sit
beside `api/`. They are not created until a phase needs them.
