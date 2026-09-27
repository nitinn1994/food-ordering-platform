# syntax=docker/dockerfile:1
# commerce-api production image (Phase 18, docs/features/phase-18-production-
# hardening/plan.md §18, AC23, AC24). Build from the repository root:
#
#   docker build -f apps/commerce-api/Dockerfile -t commerce-api .
#
# The image holds the built API (dist/main.js), the one-shot database
# commands (dist/migrate.js, dist/seed.js) and production dependencies only.
# No .env, no secrets: configuration comes from the runtime environment.

ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# The packageManager version from the root package.json.
RUN npm install -g pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/commerce-api ./apps/commerce-api
RUN pnpm install --frozen-lockfile --filter commerce-api...
RUN pnpm --filter commerce-api build
# package.json, dist/ and a production-only node_modules (the @contracts/*
# packages are inlined into dist by vite.config.ts).
RUN pnpm --filter commerce-api deploy --prod /deploy

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY --from=build --chown=root:root /deploy/package.json ./package.json
COPY --from=build --chown=root:root /deploy/node_modules ./node_modules
COPY --from=build --chown=root:root /deploy/dist ./dist
# Code is owned by root and read-only to the process; it runs as the image's
# unprivileged `node` user (uid 1000) and needs no writable path.
USER node
EXPOSE 3001
# Liveness only: a database outage must not get the container restarted
# (readiness is GET /health/ready, for the proxy or orchestrator).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
