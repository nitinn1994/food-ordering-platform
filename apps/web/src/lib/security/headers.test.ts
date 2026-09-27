import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, resolveServiceUrl, securityHeaders } from "./headers";

// Phase 18 (plan.md §3 S-1, AC16, AC17 as amended): next.config.ts's
// headers and rewrite targets come from these functions.

function header(isProduction: boolean, key: string): string | undefined {
  return securityHeaders(isProduction).find((entry) => entry.key === key)?.value;
}

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  it("locks production down to this origin, with no eval, plugins or framing", () => {
    const policy = directives(contentSecurityPolicy(true));

    expect(policy.get("default-src")).toBe("'self'");
    expect(policy.get("script-src")).toBe("'self' 'unsafe-inline'");
    expect(policy.get("connect-src")).toBe("'self'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'self'");
    expect(policy.get("form-action")).toBe("'self'");
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(contentSecurityPolicy(true)).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).not.toMatch(/https?:|\*/);
  });

  it("adds only eval and a hot-reload WebSocket in development", () => {
    const policy = directives(contentSecurityPolicy(false));

    expect(policy.get("script-src")).toBe("'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy.get("connect-src")).toBe("'self' ws:");
    expect(policy.get("frame-ancestors")).toBe("'none'");
  });
});

describe("securityHeaders", () => {
  it.each([true, false])("always sets the baseline headers (production: %s)", (isProduction) => {
    expect(header(isProduction, "Permissions-Policy")).toBe("microphone=(self)");
    expect(header(isProduction, "X-Frame-Options")).toBe("DENY");
    expect(header(isProduction, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(isProduction, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(isProduction, "Content-Security-Policy")).toBe(
      contentSecurityPolicy(isProduction),
    );
  });

  it("sends HSTS in production only, without preload", () => {
    expect(header(true, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(header(false, "Strict-Transport-Security")).toBeUndefined();
  });
});

describe("resolveServiceUrl", () => {
  const DEFAULT = "http://127.0.0.1:3001";

  it("uses the configured URL, trimmed and without trailing slashes", () => {
    expect(
      resolveServiceUrl("COMMERCE_API_URL", DEFAULT, {
        COMMERCE_API_URL: " http://commerce-api:3001/ ",
      }),
    ).toBe("http://commerce-api:3001");
  });

  it("falls back to the development default for an ordinary build", () => {
    expect(resolveServiceUrl("COMMERCE_API_URL", DEFAULT, {})).toBe(DEFAULT);
    expect(
      resolveServiceUrl("COMMERCE_API_URL", DEFAULT, { NODE_ENV: "production" }),
    ).toBe(DEFAULT);
  });

  it.each([{}, { COMMERCE_API_URL: "  " }])(
    "fails a production image build (WEB_REQUIRE_SERVICE_URLS=true) with no URL: %o",
    (env) => {
      expect(() =>
        resolveServiceUrl("COMMERCE_API_URL", DEFAULT, {
          ...env,
          WEB_REQUIRE_SERVICE_URLS: "true",
        }),
      ).toThrow("COMMERCE_API_URL must be set when WEB_REQUIRE_SERVICE_URLS=true");
    },
  );

  it("accepts a configured URL when the flag is set", () => {
    expect(
      resolveServiceUrl("AI_SERVICE_URL", "http://127.0.0.1:3002", {
        AI_SERVICE_URL: "http://ai-service:3002",
        WEB_REQUIRE_SERVICE_URLS: "true",
      }),
    ).toBe("http://ai-service:3002");
  });
});
