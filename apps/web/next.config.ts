import type { NextConfig } from "next";

// commerce-api's development default — the same value as
// DEV_COMMERCE_API_URL in src/lib/api/config.ts, repeated as a literal
// because next.config.ts is loaded by Next's own config loader, which does
// not reliably resolve this app's ESM TypeScript modules.
//
// Unlike config.ts, this falls back even under NODE_ENV=production: rewrites
// are evaluated when `next build` runs, and the repository's build must
// succeed without a commerce-api URL configured. A production build must set
// COMMERCE_API_URL at build time (docs/features/phase-11-web-commerce-
// integration/plan.md §14).
const DEV_COMMERCE_API_URL = "http://127.0.0.1:3001";

const commerceApiUrl = (
  process.env.COMMERCE_API_URL?.trim() || DEV_COMMERCE_API_URL
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
