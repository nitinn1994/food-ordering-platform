import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

// Set on every response this service sends, including errors — the service
// only ever answers JSON to other programs, so each value is the strictest
// one (Phase 18, plan.md §3 S-2, AC5):
//
// - nosniff: a JSON body is never reinterpreted as script or HTML;
// - CSP `default-src 'none'`: were a body ever rendered, it could load and
//   run nothing, and `frame-ancestors 'none'` refuses framing;
// - no-referrer: nothing leaks from a followed link;
// - no-store: cart, order, price and availability are authoritative,
//   mutable state (plan.md §13). Applied to every route rather than matched
//   by path, so no path spelling can miss it; the menu is uncached today
//   anyway (docs/operations/performance-baseline.md, OD5).
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
});

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  }
}
