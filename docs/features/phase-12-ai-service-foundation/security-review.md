# Security Review — Phase 12: Python AI Service Foundation

**Flagged by:** `plan.md`, "Specialised review needed? security: yes"
(Full Path).
**Reviewed:** the uncommitted Phase 12 changes, meaning everything under
`apps/ai-service/` plus the docs. The code was read, and the running service
was probed live on 127.0.0.1:3002, with `APP_ENV=production` and
`LOG_LEVEL=DEBUG`.
**Method:** done by hand. The built-in `/security-review` skill could not
run: it diffs against `origin/HEAD`, and this repository has no remote.
**Date:** 2026-09-26

## Verdict

No exploitable issue in the current surface: one GET route, on loopback. One
LOW is worth fixing (S1), and one rule should be recorded now, before AI
phases add real customer text (S2). Everything else is a NOTE.

## Findings

| # | Severity | Where | Finding | Evidence | Suggested fix |
| - | -------- | ----- | ------- | -------- | ------------- |
| S1 | LOW — **FIXED** (at the human's request) | `ai_service/core/request_context.py:49-56` | An inbound `X-Correlation-Id` counts as valid if it is 1–64 characters, so control characters are accepted and **echoed back in the response header**. RFC 9110 does not allow control characters (other than tab) in a header value, so the service emits a malformed header. A strict proxy may reject or rewrite the response, and a log pipeline downstream may choke on it. CR, LF and NUL cannot get in: the HTTP parser splits on CR/LF and rejects NUL with a 400. So this is **not** response-header injection. | Raw socket: `X-Correlation-Id: abc\x7f\x01` returns 200 with `x-correlation-id: abc\x7f\x01`. The CRLF payload is split by the parser (`pwned` header not reflected). NUL returns 400. | Treat only visible ASCII (`0x21`–`0x7E`) as valid, and replace anything else with a generated id. That fits the existing rule that an invalid id is "replaced, never rejected". Add parametrized tests for `\x7f`, `\x01` and a high byte. This is stricter than `@contracts/common`'s `correlationIdSchema`, which allows any string, so record it in `docs/api/ai-service.md` §6 (see also follow-up F1). **Done:** a `[\x21-\x7e]{1,64}` full match is required. Six new tests cover DEL, other control characters, a space, a non-ASCII byte, a tab, and full printable-ASCII acceptance; the five replacement cases failed before the fix. The live raw-socket re-probe of `abc\x7f\x01` now gets a fresh UUID. Documented in `docs/api/ai-service.md` §6 and ADR-0019 §6. 84 tests. |
| S2 | LOW now, MEDIUM once AI phases parse model or customer data — **RULE RECORDED** (ADR-0019, "Rules this sets for later AI phases") | `ai_service/core/request_context.py:99` (`logger.exception`) | The last-resort 500 path logs the full traceback, **including the exception's message**. That is intended. But a Pydantic `ValidationError` raised by *internal* code (not FastAPI's request parsing, which is handled separately) puts the rejected input values in its message. Once a later phase validates model output or customer utterances with Pydantic, such a failure would write that text to the logs, breaking ADR-0019's "prompts, completions, customer utterances are never logged". There is no such code today. | `str(ValidationError)` contains the input: `M(n='SENTINEL_CUSTOMER_TEXT')` returns `True` for the substring check. | Record a rule in ADR-0019, now: internal code that validates untrusted or customer data must catch `ValidationError` and raise an `AiServiceError`, or log only `errors(include_input=False)`. Optionally, make the 500 logger log only the exception *type* and traceback frames for `ValidationError`. Decide in the first phase that parses model output. |
| S3 | NOTE | uvicorn defaults, `ai_service/__main__.py` | uvicorn sends `server: uvicorn` (a fingerprint), and trusts `X-Forwarded-*` from `127.0.0.1` by default (`proxy_headers=True`). The service never reads or logs the client address, so the proxy trust has no effect. | `uvicorn.Config` defaults: `proxy_headers True`, `forwarded_allow_ips None` (meaning 127.0.0.1), `server_header True`. `curl -I` shows `server: uvicorn`. | None now. When a deploy phase puts this behind a proxy, set `forwarded_allow_ips` and `server_header=False` explicitly. |
| S4 | NOTE | uvicorn/h11 limits | A 100 KB request header was accepted (200). Loopback-only, so there is no remote DoS today. | `curl -H "X-Big: <100000 chars>"` returns 200 | When the service is exposed beyond loopback, set `h11_max_incomplete_event_size` or front it with a proxy that limits headers. |
| S5 | NOTE | `core/logging.py` | The caller-controlled correlation id **is** logged. It is a correlation id, so this is intended, and it matches commerce-api. It is capped at 64 characters, and the JSON formatter escapes it, so it cannot forge log lines. The pretty format does not print it. | DEBUG-level run: the only sentinel found in the logs was `SENTINEL_CORR` | None. After S1, it will also be printable ASCII only. |
| S6 | NOTE (not security) | `api/health.py` | `HEAD /health` returns 405, because FastAPI does not answer HEAD for a GET route automatically. A liveness probe configured with HEAD would fail. | `curl -I /health` returns `405`, `allow: GET` | Relevant to a future deploy phase, not now. |

## Verified — no finding

| Area | How it was checked | Result |
| --- | --- | --- |
| Error leakage | Code read. Tests with sentinel values for exception text, `HTTPException.detail`, and rejected input. Live 404/405 checks. | No stack trace, exception text, detail or input value in any response. 500 is a static body. A non-enum status keeps its status (review finding 1, fixed). |
| Log redaction at INFO **and DEBUG** | Live with `LOG_LEVEL=DEBUG`: sentinel values in `Authorization`, `Cookie`, the query string and JSON bodies, on 200, 405 and 404 routes | 0 hits for every sentinel except the intended correlation id (S5). At DEBUG, the only extra lines were asyncio's selector line and uvicorn's `Invalid HTTP request received.` (no request content). This closes the review's "not reviewed" item. |
| Config value hiding | `test_config.py` sentinels; live `PORT=abc` | Names the variable and error type, never the value. `from None` drops the exception chain. |
| Bind / exposure | Default `HOST=127.0.0.1`; `ss -ltnp` during the earlier live checks | Listens on loopback only |
| Docs routes | Live with `APP_ENV=production`: `/docs`, `/redoc`, `/openapi.json`, `/docs/oauth2-redirect` | All 404 |
| CORS | `test_docs_toggle.py` (no `CORSMiddleware`; no `access-control-allow-origin` for a foreign `Origin`) | None |
| Header injection (CRLF/NUL) | Raw-socket requests | Blocked by the parser (see S1 for other control characters) |
| Request bodies | Code read: no shipped route accepts a body. Starlette answers 404/405 before reading one. | No body-parsing surface |
| Dangerous calls | grep for `eval`, `exec`, `subprocess`, `os.system`, `pickle`, `yaml.load`, `__import__`, `importlib`, `shell=True`, `open(` in `ai_service/` | None. The only file read (`error.v1.json`) is in `tests/`. |
| Static analysis | `uv run ruff check --select S .` (flake8-bandit rules, already enabled in `pyproject.toml`) | PASS |
| Secrets in the repo | grep for key, token and private-key patterns across the new files; `git check-ignore` | None. `.env`, `.venv/` and `.mypy_cache/` are ignored. No cache or env file would be committed. |
| Future-secret handling | `config.py` doc comment, and the ADR-0019 rule (`SecretStr`, never logged) | Recorded. No secret field exists yet. |
| DB boundary (§4.1) | `test_boundaries.py`, shown able to fail | No driver or ORM can be added or imported without failing the suite |
| Dependency sources | `uv.lock` | All 33 packages come from `https://pypi.org/simple`. Runtime: fastapi 0.141.1, pydantic 2.13.5, uvicorn 0.54.0. |

## Not covered

- **Vulnerability scanning of dependencies: `NOT_CONFIGURED`.** No scanner
  is declared in the repository, so none was run and nothing was installed to
  run one. Versions are listed above for a human to check.
- **Authentication and rate limiting:** out of scope by `CLAUDE.md`. Any
  local process can call the service, the same as commerce-api.
- **Deployment hardening** (TLS, proxy configuration, header limits): there
  is no deployment. S3 and S4 note what a deploy phase must set.

## Follow-up (not done)

```text
FOLLOW-UP (not done): first phase that parses model output / customer utterances — enforce ADR-0019's S2 rule with a sentinel-input log test — medium
FOLLOW-UP (not done, unverified, outside this phase): apps/commerce-api/src/common/request-context/request-context.middleware.ts:29-35 — correlationIdSchema accepts control chars and the value goes to res.setHeader(); Node rejects invalid header chars (ERR_INVALID_CHAR), so a crafted X-Correlation-Id may make commerce-api fail the request — verify, then consider tightening correlationIdSchema in @contracts/common (F1) — low
```
