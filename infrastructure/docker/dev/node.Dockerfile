# Development toolchain for web and commerce-api in compose.dev.yaml
# (docs/features/docker-environments/plan.md, Phase 3). Never used for
# staging or prod. The source is not copied in: compose.dev.yaml mounts the
# repository, and node_modules live in container-only volumes.
#
# The same pinned Node image and pnpm version as apps/*/Dockerfile.
ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

FROM ${NODE_IMAGE}
RUN npm install -g pnpm@12.3.4
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
