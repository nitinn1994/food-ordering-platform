import { BROWSER_API_BASE } from "./config";

// Decides whether a request to the same-origin commerce proxy may be
// forwarded — docs/features/phase-11-web-commerce-integration/
// review-report.md, security finding S1.
//
// next.config.ts's rewrite matches `/api/commerce/v1/:path*` *before* dot
// segments are resolved, so `/api/commerce/v1/../health` (or `%2e%2e`)
// matched and was forwarded to a destination that resolved outside /v1.
// middleware.ts calls this first and answers 404 for anything that is not
// plainly inside /v1: every segment, once decoded, must be neither "." nor
// ".." nor contain a path separator.

const PROXY_V1_PREFIX = `${BROWSER_API_BASE}/v1/`;

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding — not something this app ever sends.
    return null;
  }
}

export function isForwardableProxyPath(pathname: string): boolean {
  if (!pathname.startsWith(PROXY_V1_PREFIX)) {
    return false;
  }
  const rest = pathname.slice(PROXY_V1_PREFIX.length);
  for (const raw of rest.split("/")) {
    const segment = decodeSegment(raw);
    if (
      segment === null ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\")
    ) {
      return false;
    }
  }
  return true;
}
