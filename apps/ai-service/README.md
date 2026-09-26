# ai-service

The Food Ordering Platform's Python AI service (FastAPI).

**Phase 14: a LangGraph agent with Commerce API tools, on a simulated
model.** On top of the Phase 12 foundation (configuration, one error shape,
structured logging with request correlation, a liveness endpoint) and the
Phase 13 agent (`POST /v1/agent/turns`), the agent can call five tools:
`get_menu`, `get_cart`, `add_cart_item`, `set_cart_item_quantity` and
`remove_cart_item`. Each makes one call to commerce-api through one Commerce
API client (`docs/features/phase-14-ai-tool-calling/`, ADR-0021).

The model is still the deterministic in-repo `SimulatedChatModel`, which
never calls a tool. So the tool loop runs in the tests, on scripted models,
until a provider arrives. There is no model provider, no API key, no order
tool, no intents, no UI commands and no memory yet.

## Boundaries

- It never touches the commerce database: no driver, no connection string,
  no credentials. Commerce data will come from `apps/commerce-api` over
  HTTP only (`docs/architecture/system-architecture.md` §4.1).
- It never holds or changes cart or order state itself. Its tools ask
  commerce-api, which validates and decides (§4.2). The tools check only the
  shape of their arguments, never availability, quantities or prices.
- Tools are a fixed allowlist (`tools/registry.py`). No argument can name a
  URL, a route, an HTTP method or a header. The Commerce API base URL comes
  only from `COMMERCE_API_URL`. Redirects are not followed, and requests are
  never retried.
- The agent's state holds the turn's messages and reply only, never cart,
  price, order or availability data (`agents/state.py`).
- `tests/test_boundaries.py` fails if a database driver, model SDK, unlisted
  HTTP client or unlisted AI package becomes a dependency or is imported. It
  confines `httpx` to `clients/`, `langgraph` to `agents/` and
  `langchain_core` to `agents/` and `llm/`. It keeps the layers apart:
  `agents/` never imports `clients/`, `tools/` and `clients/` never import
  upward, and the generated `contracts/` import nothing of ours. It forbids
  LangChain tools, prebuilt agents (ToolNode), checkpointers, the LangChain
  deserializer (`langchain_core.load`), `langsmith` and the contract
  generator everywhere. Adding one later means changing that allowlist in
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
| Regenerate contract models | `uv run python scripts/generate_contracts.py` |
| Live check against a running commerce-api (optional) | `AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 uv run pytest tests/test_live_commerce.py` |

The service listens on `http://127.0.0.1:3002`. `GET /health` returns
`{"status":"ok"}`. `POST /v1/agent/turns` with `{"message":"Hello"}` returns
the simulated `{"reply": ...}`. It needs no `.env`, no API key, no running
commerce-api, no database and no network. Neither does the test suite: its
commerce-api is a fake on httpx's `MockTransport`. The live check is skipped
unless its variable is set. It changes the one shared cart (it adds, changes
and then removes one item) and never places an order.

`ai_service/contracts/api_contracts.py` is generated from
`packages/contracts/api-contracts/schema/*.v1.json` (ADR-0003). Never edit
it by hand. After a contract changes, rebuild its JSON Schema, then
regenerate. `tests/test_generated_contracts.py` fails if the two drift.

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
  agents/       LangGraph: state, nodes, graph, prompt, the AgentService boundary
  tools/        the tool allowlist, strict inputs, ToolResult, ToolService
  clients/      the Commerce API client; the only package that imports httpx
  contracts/    Pydantic models generated from packages/contracts (never edited)
  llm/          the model boundary (BaseChatModel); only place for providers
  core/         errors, logging, request context, request body limits
  schemas/      HTTP request/response models
scripts/        generate_contracts.py (dev only)
tests/          pytest; fixtures_routes.py holds test-only routes,
                fakes.py test-only chat models, commerce_fakes.py a fake
                commerce-api
```

Future packages sit beside `api/`. They are not created until a phase needs
them.
