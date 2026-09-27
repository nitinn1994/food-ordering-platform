import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_API_BASE,
  DEV_AI_SERVICE_URL,
  DEV_COMMERCE_API_URL,
  resolveApiBase,
  resolveServerApiBase,
} from "./config";

describe("resolveServerApiBase", () => {
  it("uses COMMERCE_API_URL, without a trailing slash", () => {
    expect(
      resolveServerApiBase({ COMMERCE_API_URL: "http://api.internal:9000/" }),
    ).toBe("http://api.internal:9000");
  });

  it("falls back to commerce-api's dev address outside production", () => {
    expect(resolveServerApiBase({ NODE_ENV: "development" })).toBe(
      DEV_COMMERCE_API_URL,
    );
    expect(resolveServerApiBase({ NODE_ENV: "test", COMMERCE_API_URL: " " })).toBe(
      DEV_COMMERCE_API_URL,
    );
  });

  it("refuses to guess in production", () => {
    expect(() => resolveServerApiBase({ NODE_ENV: "production" })).toThrow(
      /COMMERCE_API_URL is not set/,
    );
  });
});

describe("resolveApiBase", () => {
  it("uses the same-origin proxy path in the browser, never the API origin", () => {
    expect(
      resolveApiBase(false, { COMMERCE_API_URL: "http://api.internal:9000" }),
    ).toBe(BROWSER_API_BASE);
  });

  it("uses the server base on the server", () => {
    expect(
      resolveApiBase(true, { COMMERCE_API_URL: "http://api.internal:9000" }),
    ).toBe("http://api.internal:9000");
  });
});

describe("next.config headers", () => {
  afterEach(() => {
    vi.resetModules();
  });

  // Phase 16 review finding 5c: the microphone for this origin only, on
  // every route.
  it("limits the microphone to this origin on every route", async () => {
    vi.resetModules();
    const { default: nextConfig } = await import("../../../next.config");

    const headers = await nextConfig.headers?.();

    expect(headers).toHaveLength(1);
    expect(headers?.[0]?.source).toBe("/:path*");
    expect(headers?.[0]?.headers).toContainEqual({
      key: "Permissions-Policy",
      value: "microphone=(self)",
    });
  });

  // Phase 18 (plan.md §3 S-1, S-5; AC16): the full security set from
  // src/lib/security/headers.ts, for this build's NODE_ENV, on every route.
  it("sends the security headers on every route and hides the framework", async () => {
    vi.resetModules();
    const { default: nextConfig } = await import("../../../next.config");
    const { securityHeaders } = await import("../security/headers");

    const headers = await nextConfig.headers?.();

    expect(headers?.[0]?.headers).toEqual([
      ...securityHeaders(process.env.NODE_ENV === "production"),
    ]);
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.output).toBe("standalone");
  });

  // AC17 as amended: the production image build sets the flag, and a
  // missing service URL then fails the build at config load.
  it("refuses to load without service URLs when WEB_REQUIRE_SERVICE_URLS=true", async () => {
    vi.resetModules();
    vi.stubEnv("WEB_REQUIRE_SERVICE_URLS", "true");
    vi.stubEnv("COMMERCE_API_URL", "");
    vi.stubEnv("AI_SERVICE_URL", "");
    try {
      await expect(import("../../../next.config")).rejects.toThrow(
        "COMMERCE_API_URL must be set when WEB_REQUIRE_SERVICE_URLS=true",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("next.config rewrites", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("proxies only /api/commerce/v1/* to commerce-api's /v1/*", async () => {
    vi.stubEnv("COMMERCE_API_URL", "http://api.internal:9000/");
    vi.stubEnv("AI_SERVICE_URL", "");
    vi.resetModules();
    const { default: nextConfig } = await import("../../../next.config");

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        source: "/api/commerce/v1/:path*",
        destination: "http://api.internal:9000/v1/:path*",
      },
      {
        source: "/api/ai/v1/agent/turns",
        destination: `${DEV_AI_SERVICE_URL}/v1/agent/turns`,
      },
    ]);
  });

  it("falls back to the dev address when unset", async () => {
    vi.stubEnv("COMMERCE_API_URL", "");
    vi.stubEnv("AI_SERVICE_URL", "");
    vi.resetModules();
    const { default: nextConfig } = await import("../../../next.config");

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        source: "/api/commerce/v1/:path*",
        destination: `${DEV_COMMERCE_API_URL}/v1/:path*`,
      },
      {
        source: "/api/ai/v1/agent/turns",
        destination: `${DEV_AI_SERVICE_URL}/v1/agent/turns`,
      },
    ]);
  });

  // Phase 15 plan.md §14: exactly one ai-service path, never a wildcard.
  it("proxies only the one turn path to ai-service", async () => {
    vi.stubEnv("AI_SERVICE_URL", "http://ai.internal:9100/");
    vi.resetModules();
    const { default: nextConfig } = await import("../../../next.config");

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toContainEqual({
      source: "/api/ai/v1/agent/turns",
      destination: "http://ai.internal:9100/v1/agent/turns",
    });
    const sources = Array.isArray(rewrites) ? rewrites.map((r) => r.source) : [];
    expect(sources.filter((source) => source.startsWith("/api/ai"))).toEqual([
      "/api/ai/v1/agent/turns",
    ]);
  });
});
