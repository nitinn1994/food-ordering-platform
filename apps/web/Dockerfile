# syntax=docker/dockerfile:1
# apps/web production image (Phase 18, docs/features/phase-18-production-
# hardening/plan.md §15, §18, AC17, AC23). Build from the repository root,
# naming the services as the web container will reach them:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg COMMERCE_API_URL=http://commerce-api:3001 \
#     --build-arg AI_SERVICE_URL=http://ai-service:3002 \
#     -t web .
#
# The same-origin proxy rewrites are fixed when `next build` runs, so both
# URLs are build arguments. WEB_REQUIRE_SERVICE_URLS=true makes a missing one
# fail the build instead of baking in 127.0.0.1 (AC17). They are service
# addresses, not secrets. Server Components also read COMMERCE_API_URL at
# runtime; the compose file sets it again there.

ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

FROM ${NODE_IMAGE} AS build
ARG COMMERCE_API_URL
ARG AI_SERVICE_URL
ENV COMMERCE_API_URL=${COMMERCE_API_URL} \
    AI_SERVICE_URL=${AI_SERVICE_URL} \
    WEB_REQUIRE_SERVICE_URLS=true \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
RUN npm install -g pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter web...
RUN pnpm --filter web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# The standalone server traces only what it needs; static assets are copied
# beside it, as Next's standalone output requires.
COPY --from=build --chown=root:root /repo/apps/web/.next/standalone ./
COPY --from=build --chown=root:root /repo/apps/web/.next/static ./apps/web/.next/static
# The only path the server may write: Next's own cache (the compose file
# mounts a tmpfs here so the rest of the filesystem can be read-only).
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
