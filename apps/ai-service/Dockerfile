# syntax=docker/dockerfile:1
# ai-service production image (Phase 18, docs/features/phase-18-production-
# hardening/plan.md §18, AC23). Build from the repository root:
#
#   docker build -f apps/ai-service/Dockerfile -t ai-service .
#
# Runtime dependencies from uv.lock only (no dev tools), the service source,
# no .env and no secrets: configuration comes from the runtime environment.

ARG PYTHON_IMAGE=python:3.12.14-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.19@sha256:04d046b13e60d6bcec73cbc5e1cad25d680dea90c8573340950a0ac2d1aef424

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock apps/ai-service/.python-version ./
# --locked: fail rather than resolve anything not already in uv.lock.
RUN uv sync --locked --no-dev

FROM ${PYTHON_IMAGE} AS runtime
# An unprivileged user with no home and no shell.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
ENV APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=3002 \
    PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=build --chown=root:root /app/.venv ./.venv
COPY --chown=root:root apps/ai-service/ai_service ./ai_service
USER app
EXPOSE 3002
# Liveness only; it never touches commerce-api or a model provider.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ['PORT'], timeout=2).status == 200 else 1)"]
CMD ["python", "-m", "ai_service"]
