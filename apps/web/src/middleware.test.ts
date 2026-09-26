// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

// Security finding S1, at the middleware boundary: anything not plainly
// inside /v1 is answered 404 here, before next.config.ts's rewrite can
// forward it.

describe("middleware — commerce proxy scope", () => {
  it("only runs for the commerce proxy", () => {
    expect(config.matcher).toBe("/api/commerce/:path*");
  });

  it("lets a /v1 request through to the rewrite", () => {
    const response = middleware(new NextRequest("http://localhost:3000/api/commerce/v1/cart/items/tiramisu"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "http://localhost:3000/api/commerce/v1/../health",
    "http://localhost:3000/api/commerce/v1/%2e%2e/health",
    "http://localhost:3000/api/commerce/v1/menu/../../health",
    "http://localhost:3000/api/commerce/v1/..%2fhealth",
    "http://localhost:3000/api/commerce/health",
  ])("answers 404 for %s", (url) => {
    const response = middleware(new NextRequest(url));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
});
