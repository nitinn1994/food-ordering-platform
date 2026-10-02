# Development toolchain for ai-service in compose.dev.yaml
# (docs/features/docker-environments/plan.md, Phase 3). Never used for
# staging or prod. The source is not copied in: compose.dev.yaml mounts the
# repository, and the virtualenv lives in a container-only volume.
#
# The same pinned Python and uv images as apps/ai-service/Dockerfile.
ARG PYTHON_IMAGE=python:3.12.14-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.19@sha256:04d046b13e60d6bcec73cbc5e1cad25d680dea90c8573340950a0ac2d1aef424

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE}
COPY --from=uv /uv /usr/local/bin/uv
# The venv sits outside the mounted source (/opt/venv), so the host's
# apps/ai-service/.venv is never touched. No bytecode is written into the
# mounted source either.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_CACHE_DIR=/opt/uv-cache \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /repo/apps/ai-service
