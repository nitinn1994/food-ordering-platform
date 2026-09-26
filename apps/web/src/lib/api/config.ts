// Where apps/web reaches commerce-api — docs/features/phase-11-web-commerce-
// integration/plan.md §14 (OD1).
//
// The browser never talks to commerce-api's origin directly: it calls this
// app's own same-origin path, which next.config.ts rewrites to
// COMMERCE_API_URL. So commerce-api needs no CORS, and its URL is never
// shipped to the browser (server-only, deliberately not NEXT_PUBLIC_).
// Server Components (getMenu()) have no origin to be relative to, so they
// call COMMERCE_API_URL directly.

export const BROWSER_API_BASE = "/api/commerce";

// commerce-api's own development default (apps/commerce-api/.env.example:
// HOST=127.0.0.1, PORT=3001). next.config.ts repeats this literal for its
// rewrite fallback rather than importing this module — see its comment.
export const DEV_COMMERCE_API_URL = "http://127.0.0.1:3001";

type Env = Record<string, string | undefined>;

// Production has no default: a missing URL there is a configuration error,
// surfaced loudly on the first server-side request rather than silently
// pointing at a developer's localhost. Production deployment itself is out
// of scope (plan.md §14 — "placeholder only").
export function resolveServerApiBase(env: Env = process.env): string {
  const configured = env.COMMERCE_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "COMMERCE_API_URL is not set. It is required in production — see apps/web/.env.example.",
    );
  }
  return DEV_COMMERCE_API_URL;
}

// Where apps/web reaches ai-service — docs/features/phase-15-ai-ui-commands/
// plan.md §14. The same same-origin pattern as commerce-api (ADR-0018): the
// browser calls /api/ai/v1/agent/turns, and next.config.ts rewrites exactly
// that one path to AI_SERVICE_URL (server-only). Only the browser calls
// ai-service — ChatInput is a client component, and no Server Component
// does — so unlike commerce-api there is no server-side base to resolve.
export const BROWSER_AI_BASE = "/api/ai";
export const AGENT_TURN_PATH = "/v1/agent/turns";

// ai-service's own development default (apps/ai-service/.env.example:
// HOST=127.0.0.1, PORT=3002). next.config.ts repeats this literal, for the
// same reason as DEV_COMMERCE_API_URL.
export const DEV_AI_SERVICE_URL = "http://127.0.0.1:3002";

export function resolveApiBase(
  isServer: boolean = typeof window === "undefined",
  env: Env = process.env,
): string {
  return isServer ? resolveServerApiBase(env) : BROWSER_API_BASE;
}
