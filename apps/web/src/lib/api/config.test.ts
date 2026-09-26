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
