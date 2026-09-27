import type { NextConfig } from "next";
import { resolveServiceUrl, securityHeaders } from "./src/lib/security/headers";

// commerce-api's development default — the same value as
// DEV_COMMERCE_API_URL in src/lib/api/config.ts, repeated as a literal
// because next.config.ts is loaded by Next's own config loader, which does
// not reliably resolve this app's ESM TypeScript modules (the one module it
// does import, src/lib/security/headers.ts, has no imports of its own).
//
// Unlike config.ts, this falls back even under NODE_ENV=production: rewrites
// are evaluated when `next build` runs, and the repository's build must
// succeed without a commerce-api URL configured. A production build must set
// COMMERCE_API_URL at build time (docs/features/phase-11-web-commerce-
// integration/plan.md §14); the production image build enforces that with
// WEB_REQUIRE_SERVICE_URLS=true (Phase 18, resolveServiceUrl).
const DEV_COMMERCE_API_URL = "http://127.0.0.1:3001";

// ai-service's development default — DEV_AI_SERVICE_URL in
// src/lib/api/config.ts, repeated for the same reason, under the same
// build-time rule (docs/features/phase-15-ai-ui-commands/plan.md §14).
const DEV_AI_SERVICE_URL = "http://127.0.0.1:3002";

const commerceApiUrl = resolveServiceUrl(
  "COMMERCE_API_URL",
  DEV_COMMERCE_API_URL,
  process.env,
);
const aiServiceUrl = resolveServiceUrl(
  "AI_SERVICE_URL",
  DEV_AI_SERVICE_URL,
  process.env,
);

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Don't advertise the framework (commerce-api does the same).
  poweredByHeader: false,
  // A self-contained server (`.next/standalone/.../server.js`) that honours
  // HOSTNAME and PORT, for the production image (Phase 18, plan.md §15).
  // `next start` keeps working for local use.
  output: "standalone",
  // Security headers on every route (Phase 18, plan.md §3 S-1, OD3) — see
  // src/lib/security/headers.ts. They include the Permissions-Policy that
  // limits the microphone to this origin (Phase 16).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders(isProduction)],
      },
    ];
  },
  // Same-origin proxy to commerce-api (plan.md OD1): the browser calls
  // /api/commerce/v1/*, so commerce-api needs no CORS and its URL never
  // reaches the browser. Only /v1 is forwarded — not /health or anything
  // else commerce-api may serve. This pattern alone does not guarantee
  // that: it matches before dot segments are resolved, so src/middleware.ts
  // rejects `..`/`.` segments first (security finding S1).
  //
  // package.json binds `next dev` / `next start` to 127.0.0.1: through this
  // proxy the web app now exposes commerce-api, which is itself bound to
  // loopback, so the web app must not listen on every interface either
  // (security finding S2).
  async rewrites() {
    return [
      {
        source: "/api/commerce/v1/:path*",
        destination: `${commerceApiUrl}/v1/:path*`,
      },
      // Same-origin proxy to ai-service (Phase 15 plan.md §14): exactly one
      // path, no wildcard, and a fixed destination — so no request path can
      // steer it anywhere else, and ai-service's /health, /docs and anything
      // added later stay unreachable from the browser (Next answers 404 for
      // every other /api/ai/* path: nothing matches it). Deliberately NOT
      // guarded in src/middleware.ts: at runtime middleware sees an
      // already-normalized URL, and an AI branch there let
      // /api/commerce/v1/../../ai/v1/agent/turns through to the commerce
      // rewrite (security-review.md S1). Next's default proxy timeout (30 s)
      // covers the worst-case turn (8 tool calls x 3 s).
      {
        source: "/api/ai/v1/agent/turns",
        destination: `${aiServiceUrl}/v1/agent/turns`,
      },
    ];
  },
};

export default nextConfig;
