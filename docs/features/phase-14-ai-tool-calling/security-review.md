# Security Review — Phase 14: AI Tool Calling → Commerce API

**Flagged by:** `plan.md` "Specialised review needed? security: yes" (Full
Path), for four reasons:

- a new trust boundary: model output becomes HTTP writes to commerce state;
- the first outbound HTTP client;
- relaxed import and setting guards;
- log redaction of tool arguments and commerce-api responses.

**Reviewed:** the uncommitted Phase 14 changes (everything under
`apps/ai-service/` plus the docs), after review findings 1, 2, 4, 5 and note
7 were fixed.

- The code was read: the client, tools, graph nodes, config, wiring and
  boundary tests.
- The full stack was probed with **real sockets**. A scripted model drove
  the real `create_app → AgentService → graph → ToolService →
  CommerceClient → httpx` path against two stub HTTP servers on loopback: a
  stand-in commerce-api (A) and an "attacker" host (B).
- Every socket connection and DNS lookup was intercepted. Proxy variables
  were set in the environment. The settings were `APP_ENV=production` and
  `LOG_LEVEL=DEBUG`.
- The runtime dependency set was compared with HEAD's `uv.lock`.

The probe script lived in the session scratchpad and is not committed.

**Method:** done by hand. The built-in `/security-review` skill could not
run: it diffs against `origin/HEAD`, which is not set in this clone, and
the work is uncommitted, so such a diff would not contain it anyway.
(Phase 13's review said "no remote". There is an `origin` remote; it is
`origin/HEAD` that is missing.)

**Date:** 2026-09-26

## Verdict

**No exploitable issue.** The design's central claims hold under live,
hostile input:

- the model cannot choose where a request goes, which method it uses or what
  it carries;
- commerce-api remains the only authority;
- nothing a model or commerce-api says reaches the logs.

One LOW item was found: review finding 3, restated here for its
availability angle (S1). **It was fixed after the review, at the human's
request.** Everything else is a NOTE: accepted design limits, or things to
revisit when the deployment topology changes.

## Findings

| # | Severity | Where | Finding | Evidence | Suggested fix |
| - | -------- | ----- | ------- | -------- | ------------- |
| S1 | LOW — **FIXED** (at the human's request; same as review finding 3) | `ai_service/agents/nodes.py` (`make_execute_tools`) | **Model output can amplify work, though not requests.** The per-turn cap stops execution after 8 calls, but every tool call in a model message still gets a tool message and a log line, and `invalid_tool_calls` are not capped at all. A model steered by prompt injection could emit thousands of calls in one message: thousands of refusals and log lines, but **no commerce-api request** past the eighth. It is bounded in practice by the provider's output-token limit. The simulated model emits none. | Code read. The per-call behaviour is pinned by `test_calls_past_the_turn_limit_are_refused_not_run`. | Treat a message with more than about 2 × `MAX_TOOL_CALLS_PER_TURN` calls (valid plus invalid) as unusable output (`AgentOutputError`, which gives `AGENT_FAILED`). Decide before a real provider is connected. **Done:** `MAX_TOOL_CALLS_PER_MESSAGE = 2 × MAX_TOOL_CALLS_PER_TURN` (16) in `agents/nodes.py`. `execute_tools` checks the count (tool calls plus invalid tool calls) before anything runs, and over the limit raises `AgentOutputError`, which gives `AGENT_FAILED`. No commerce request, no refusals and no per-call log lines. Four tests were written first and failed first: 16 calls are still answered call by call, 17 raise, invalid calls count, and an end-to-end flood gives `AGENT_FAILED` with no commerce request. With the check disabled, 3 fail; with it restored, all pass. |
| S2 | NOTE | `tools/results.py` (`ToolResult.data`) | **Indirect prompt injection channel.** Commerce data enters the model's context as tool results, including menu `description` and `longDescription`. The probe's menu description, and a `longDescription` reading "Ignore previous instructions.", both reached the model, as designed. Today that text is seeded server-side by commerce-api, not written by users, and the prompt marks tool results as data. Even a fully steered model can only call the five cart and menu tools, which commerce-api validates. | Probe: the menu sentinel is present in the model's tool messages. commerce-api's *error* text is **not** (static messages by code). | None now. Revisit if menu text ever becomes user- or merchant-editable: consider a projection that drops free text the model does not need. |
| S3 | NOTE | `clients/commerce/client.py` | **No confused deputy.** ai-service holds no credential, sends no identity, and binds to loopback. Any local process that can reach ai-service can already call commerce-api directly, so the agent adds no privilege. | Probe: the headers commerce-api saw were `accept`, `accept-encoding`, `connection`, `content-length`, `content-type`, `host`, `user-agent` and `x-correlation-id`. There was no `authorization`, `cookie` or `proxy-authorization`. | Keep ADR-0021's rule for the auth phase: forward the end user's own credential, never a service-wide one. |
| S4 | NOTE | tools design | **Writes run without a confirmation step.** Cart changes are reversible and cost nothing until an order is placed, and there is no order or payment tool. A model message that repeats `add_cart_item` adds twice, because the route is not idempotent (`system-architecture.md` §8 gap 3). This is bounded by 8 calls per turn and 99 per line. | Plan §5, §15. `test_calls_in_one_message_run_in_order_one_at_a_time`. | The recorded follow-up: an idempotency key on `POST /v1/cart/items` before a real model. |
| S5 | NOTE | `clients/commerce/client.py` (`_send`) | **No size cap on commerce-api response bodies.** The client reads the whole body before validating it. The inbound 16 KB limit protects ai-service's own route only. commerce-api is a trusted service on loopback today, so this is not an attack surface. | Code read. | When commerce-api is remote or shared, stream the body with a byte cap (for example 1 MB), mapping an overrun to `CommerceBadResponseError`. |
| S6 | NOTE | graph and timeouts | **No per-turn deadline.** Each request is capped at `COMMERCE_API_TIMEOUT_SECONDS` (default 3 s), but a turn can make 8, so about 24 s if commerce-api hangs. This is availability, not confidentiality or integrity. | Probe: a 1.5 s commerce-api delay with a 0.5 s timeout gave `COMMERCE_OUTCOME_UNKNOWN` for the write, and the turn completed. | A per-turn deadline when exposed beyond loopback (already a follow-up). |
| S7 | NOTE | `uv.lock` | **Dev-only supply chain grew; the runtime did not.** `datamodel-code-generator` brought 12 packages: argcomplete 3.7.2, black 26.5.1, datamodel-code-generator 0.83.0, genson 1.4.0, inflect 7.5.0, isort 8.0.1, jinja2 3.1.6, markupsafe 3.0.3, more-itertools 11.1.0, platformdirs 4.11.15, pytokens 0.4.1 and typeguard 4.6.0. They run only in `scripts/generate_contracts.py` and in the drift test. Service code cannot import the generator (boundary test). | `uv export --no-dev` gives an identical 44-package runtime set at HEAD and now. `httpx` 0.28.1 was already installed at runtime through `langchain-core`. | Vulnerability scanning is `NOT_CONFIGURED`; the versions above are for a human check. |

## Verified — no finding

| Area | How it was checked | Result |
| --- | --- | --- |
| **Egress is confined to `COMMERCE_API_URL`** | Real-socket probe. The model called all five tools plus four hostile calls: `get_menu` with a `url` argument pointing at host B, `add_cart_item` with `itemId: "../../steal"`, an unknown `http_get` tool with a `url` and `method`, and a `remove_cart_item` carrying a sentinel id. `socket.connect` and `getaddrinfo` were intercepted. | Socket connections: **only** `127.0.0.1:<A>`. DNS lookups: none. Host B: **0 hits**. |
| **Hostile tool calls never became requests** | The same probe, reading the tool messages the model received | `url` argument → `INVALID_TOOL_ARGUMENTS`. `../../steal` → `INVALID_TOOL_ARGUMENTS`. `http_get` → `UNKNOWN_TOOL`. commerce-api received exactly 5 requests, all to the fixed routes. |
| **Redirects are not followed** | commerce-api stub answered `POST /v1/cart/items` with `302 Location: http://127.0.0.1:<B>/steal` | The tool got `COMMERCE_BAD_RESPONSE`, and host B got 0 hits. |
| **Environment proxies ignored** | `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` set to `http://127.0.0.1:9` for the probe | No connection to port 9. Direct connection to A only (`trust_env=False`). |
| **Timeout and unknown outcome** | commerce-api stub delayed `PATCH` by 1.5 s, with the timeout at 0.5 s | `COMMERCE_OUTCOME_UNKNOWN`, no retry, and the turn completed. |
| **Log redaction at DEBUG, real stack** | `LOG_LEVEL=DEBUG`, with sentinels in the customer message, a tool argument (the item id used in a path), commerce-api's menu body and commerce-api's error message | **0** sentinel hits, neither port number logged, no commerce-api path logged (the only `/v1/` in the logs is ai-service's own `/v1/agent/turns`), no `Traceback`. Loggers seen: `ai_service.agent`, `ai_service.request`, `ai_service.tools`, `asyncio`. httpx and httpcore stay at WARNING. |
| **commerce-api text never reaches the model** | The same probe | The error-message sentinel is absent from every tool message (fixed messages by code). |
| **Correlation forwarding** | Inbound `X-Correlation-Id: probe-corr-14` | commerce-api received exactly `probe-corr-14`. The value comes only from `correlation_id_var`, which holds a validated inbound id (1–64 visible ASCII characters, so no CR or LF) or a generated UUID (Phase 12, ADR-0019). |
| **Configuration** | `test_config.py` and the live entry point | The URL must be http or https with a host, and no userinfo, path, query or fragment. It is required in production. Errors name the variable and type, never the value (a sentinel test covers this). Nothing logs `Settings` (grep). |
| **TLS** | grep for `verify=` under `ai_service/` | No override, so certificate verification stays at httpx's default (on) for an `https` `COMMERCE_API_URL`. |
| **Guard relaxations are narrow** | `test_boundaries.py`, with probe files during implementation | `httpx` is allowed only under `clients/`. The `_url` rule exempts exactly `commerce_api_url` (and still refuses `database_url`, `other_url`, `commerce_api_callback_url`, `*_token` and `*_key`). The generator is import-forbidden. `langchain_core.tools`, `langgraph.prebuilt`, `langgraph.checkpoint` and `langchain_core.load` stay forbidden. Each new rule was shown to fail. |
| **No database reach** | The existing boundary tests, plus the runtime dependency comparison | No driver added, and the runtime set is unchanged (`system-architecture.md` §4.1). |
| **Client surface** | `test_commerce_client.py` introspection | Five public methods. No parameter can carry a URL, path, method or headers. `_send` is private, and its method is a `Literal`. |
| **Validation errors never leak input** (ADR-0019 S2) | Code read and sentinel tests | Argument, response and request-body `ValidationError`s are caught inside `tools/` and `clients/`. Only error locations and types are used, and every re-raise is `from None`. |

## Not covered

- **The real commerce-api.** At review time, the live client check and the
  manual log check (commerce-api's log carrying the same `correlation_id`)
  were not run, because Docker (PostgreSQL) was unavailable. The stub
  servers exercised the client's HTTP behaviour, not commerce-api's.
  **Update:** 2026-09-26, once Docker was available: `db:up`, `db:migrate` (already up to date), `db:seed`, `dev`, then the live check: 2 passed. The shared cart was exactly as before (its one existing line untouched). A live end-to-end turn (scripted model, real stack, real commerce-api) calling `get_menu` and `get_cart` returned 200 with both results `ok`, and commerce-api's log lines for both calls carried the turn's `correlationId`.
- **Vulnerability scanning** of dependencies: `NOT_CONFIGURED`. No scanner
  is declared in the repository. S7 lists versions for a manual check.
- **A real model provider.** Prompt-injection resistance, and whether a
  provider accepts the dict tool schemas, cannot be judged with the
  simulated model. That belongs to the provider phase, with an evaluation.
- **Deployment topology.** Everything is loopback. Rate limiting, a
  concurrency cap, response-size caps and a per-turn deadline matter once
  either service is exposed (S5, S6, and Phase 13 S7).
