// Response headers and service-URL resolution for next.config.ts (Phase 18,
// docs/features/phase-18-production-hardening/plan.md §3 S-1, §20 C-1,
// AC16, AC17).
//
// This module imports nothing, on purpose: next.config.ts loads it through
// Next's own config loader, which does not reliably resolve this app's other
// modules. Keep it self-contained.

export interface HeaderEntry {
  readonly key: string;
  readonly value: string;
}

// OD3: a static policy, not a per-request nonce. Next's inline hydration
// scripts need 'unsafe-inline' without a nonce, and XSS sinks are verified
// absent from this app (no dangerouslySetInnerHTML/innerHTML/eval, Phase 15
// security review S8). What the policy still buys: no script, style, frame,
// form target or connection to any other origin; no plugins; no framing
// (clickjacking the checkout); no <base> hijack. Development adds only what
// Next's dev server needs: eval for React's dev tooling and a WebSocket for
// hot reload.
export function contentSecurityPolicy(isProduction: boolean): string {
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": isProduction
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'",
    // Inline style attributes (React style props, Next's route announcer).
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data:",
    "font-src": "'self'",
    // Same-origin API proxies only; never ai-service or commerce-api directly.
    "connect-src": isProduction ? "'self'" : "'self' ws:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  return Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
}

export function securityHeaders(isProduction: boolean): readonly HeaderEntry[] {
  const headers: HeaderEntry[] = [
    // Only this origin may use the microphone — never an embedded frame
    // (docs/features/phase-16-voice-interaction/review-report.md finding
    // 5c). Voice input asks for it only on the customer's press (ADR-0023).
    { key: "Permissions-Policy", value: "microphone=(self)" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isProduction) },
    // For browsers that predate CSP frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
  if (isProduction) {
    // Browsers honour it only over HTTPS, which the reverse proxy
    // terminates in production (plan.md §15). No `preload`: that is a
    // one-way commitment for the whole domain, and a decision for its owner.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return headers;
}

// A service URL for the rewrites, which `next build` bakes into the build.
// Falls back to the development default so the repository's own build works
// with nothing configured — unless WEB_REQUIRE_SERVICE_URLS=true, which the
// production image build sets: then a missing URL fails the build instead of
// shipping a server that proxies to localhost (AC17, as amended 2026-09-27:
// `next build` always runs with NODE_ENV=production, so NODE_ENV cannot tell
// a production build from a developer's).
export function resolveServiceUrl(
  name: string,
  developmentDefault: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const configured = env[name]?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (env.WEB_REQUIRE_SERVICE_URLS === "true") {
    throw new Error(
      `${name} must be set when WEB_REQUIRE_SERVICE_URLS=true (production build).`,
    );
  }
  return developmentDefault;
}
