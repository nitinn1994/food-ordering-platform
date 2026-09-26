import { NextResponse, type NextRequest } from "next/server";
import { isForwardableProxyPath } from "./lib/api/proxyPath";

// Runs before next.config.ts's rewrites. Keeps the commerce proxy inside
// commerce-api's /v1 surface — see lib/api/proxyPath.ts (security finding
// S1). Both the raw request path and Next's parsed pathname are checked, so
// the rule holds whichever form a dot segment arrives in.
export function middleware(request: NextRequest): NextResponse {
  const rawPath = request.url.replace(/^[a-z]+:\/\/[^/]+/i, "").split("?")[0] ?? "";
  if (
    !isForwardableProxyPath(request.nextUrl.pathname) ||
    !isForwardableProxyPath(rawPath)
  ) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/commerce/:path*",
};
