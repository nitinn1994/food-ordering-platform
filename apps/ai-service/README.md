# ai-service

The Food Ordering Platform's Python AI service (FastAPI).

**Phase 13: a LangGraph agent on a simulated model.** On top of the Phase 12
foundation (configuration, one error shape, structured logging with request
correlation, a liveness endpoint), it has a two-node LangGraph agent and one
conversational route, `POST /v1/agent/turns`. The model is a deterministic
in-repo `SimulatedChatModel`: there is no model provider, no API key, no
tools, no Commerce API calls, no intents, no UI commands and no memory yet
(`docs/features/phase-13-langgraph-agent-foundation/`, ADR-0019, ADR-0020).

## Boundaries

- It never touches the commerce database: no driver, no connection string,
  no credentials. Commerce data will come from `apps/commerce-api` over
  HTTP only (`docs/architecture/system-architecture.md` §4.1).
- It never holds or changes cart or order state itself. It will submit
  business intents to commerce-api, which decides (§4.2).
- The agent's state holds the turn's messages and reply only, never cart,
  price, order or availability data (`agents/state.py`).
- `tests/test_boundaries.py` fails if a database driver, model SDK, HTTP
  client or unlisted AI package becomes a dependency or is imported. It
  confines `langgraph` to `agents/` and `langchain_core` to `agents/` and
  `llm/`, and forbids LangChain tools, prebuilt agents, checkpointers, the
  LangChain deserializer (`langchain_core.load`) and `langsmith` everywhere. Adding one later means changing that allowlist in
  the same reviewed change.
- The service refuses to start if LangSmith/LangChain tracing is switched on
  by environment variable (`.env.example`), and `create_app` refuses to build
  an app in that case, however it is called. `langsmith` is installed only
  because `langchain-core` requires it.

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
`{"status":"ok"}`. `POST /v1/agent/turns` with `{"message":"Hello"}` returns
the simulated `{"reply": ...}`. It needs no `.env`, no API key, no running
commerce-api, no database and no network. Neither does the test suite.

These commands are not part of `pnpm turbo run …`. This service is outside
the pnpm workspace (ADR-0002), so run its checks separately. The HTTP
surface is described in `docs/api/ai-service.md`.

## Layout

```text
ai_service/
  __main__.py   entry: validate config → configure logging → uvicorn
  main.py       create_app(): the one place HTTP behaviour is wired
  config.py     Settings (environment variables)
  api/          routes (HTTP only; never imports LangGraph or LangChain)
  agents/       LangGraph: state, nodes, graph, the AgentService boundary
  llm/          the model boundary (BaseChatModel); only place for providers
  core/         errors, logging, request context, request body limits
  schemas/      HTTP request/response models
tests/          pytest; fixtures_routes.py holds test-only routes,
                fakes.py test-only chat models
```

Future packages (`tools/`, `clients/commerce/`, …) sit beside `api/`. They
are not created until a phase needs them.
