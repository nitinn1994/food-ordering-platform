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
//
// The prefix is compared case-insensitively (Phase 15 security review S2,
// closed in Phase 18): next.config.ts's rewrite matches its source without
// regard to case, so `/API/COMMERCE/v1/../health` is forwarded exactly like
// the lowercase path, and must be judged exactly like it.

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
  if (pathname.slice(0, PROXY_V1_PREFIX.length).toLowerCase() !== PROXY_V1_PREFIX) {
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
