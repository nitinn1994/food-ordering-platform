// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

// Security finding S1, at the middleware boundary: anything not plainly
// inside /v1 is answered 404 here, before next.config.ts's rewrite can
// forward it.

describe("middleware — commerce proxy scope", () => {
  // Phase 15 S2: the matcher must match every case variant the rewrite
  // does, and nothing else. Next compiles matchers with path-to-regexp;
  // this mirrors the parameter patterns it declares.
  it("runs for the commerce proxy in any letter case, and only for it", () => {
    const [, apiPattern, commercePattern] =
      /^\/:api\(([^)]+)\)\/:commerce\(([^)]+)\)\/:path\*$/.exec(config.matcher) ?? [];
    expect(apiPattern).toBeDefined();
    const api = new RegExp(`^${apiPattern}$`);
    const commerce = new RegExp(`^${commercePattern}$`);
    for (const variant of ["api", "API", "Api", "aPi"]) {
      expect(api.test(variant)).toBe(true);
    }
    for (const variant of ["commerce", "COMMERCE", "Commerce", "cOmMeRcE"]) {
      expect(commerce.test(variant)).toBe(true);
    }
    for (const other of ["ai", "apis", "commerc", "commerces", "ſ"]) {
      expect(api.test(other) || commerce.test(other)).toBe(false);
    }
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
    "http://localhost:3000/API/COMMERCE/v1/../health",
    "http://localhost:3000/API/COMMERCE/health",
    "http://localhost:3000/Api/Commerce/v1/..%2fhealth",
  ])("answers 404 for %s", (url) => {
    const response = middleware(new NextRequest(url));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
});
