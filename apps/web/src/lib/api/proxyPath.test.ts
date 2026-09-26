import { describe, expect, it } from "vitest";
import { isForwardableProxyPath } from "./proxyPath";

// Security finding S1: the proxy must never forward outside commerce-api's
// /v1 surface.

describe("isForwardableProxyPath", () => {
  it.each([
    "/api/commerce/v1/menu",
    "/api/commerce/v1/cart",
    "/api/commerce/v1/cart/items",
    "/api/commerce/v1/cart/items/tiramisu",
    "/api/commerce/v1/orders",
    "/api/commerce/v1/orders/9d3a5a7b-3458-41c1-8585-871e24db8cfd",
    "/api/commerce/v1/cart/items/a%20b",
  ])("forwards %s", (path) => {
    expect(isForwardableProxyPath(path)).toBe(true);
  });

  it.each([
    ["a plain dot-dot segment", "/api/commerce/v1/../health"],
    ["a nested dot-dot climb", "/api/commerce/v1/menu/../../health"],
    ["an encoded dot-dot", "/api/commerce/v1/%2e%2e/health"],
    ["a mixed-case encoded dot-dot", "/api/commerce/v1/%2E%2e/health"],
    ["a single dot segment", "/api/commerce/v1/./cart"],
    ["an encoded slash", "/api/commerce/v1/..%2fhealth"],
    ["an encoded backslash", "/api/commerce/v1/..%5chealth"],
    ["malformed percent-encoding", "/api/commerce/v1/%E0%A4%A"],
    ["anything outside /v1", "/api/commerce/health"],
    ["another version", "/api/commerce/v2/cart"],
    ["the bare prefix", "/api/commerce/v1"],
  ])("refuses %s", (_case, path) => {
    expect(isForwardableProxyPath(path)).toBe(false);
  });
});
