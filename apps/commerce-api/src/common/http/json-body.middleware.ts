import {
  Injectable,
  type NestMiddleware,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

// Read by main.ts's app.useBodyParser("json", { limit: JSON_BODY_LIMIT })
// call — defined here, next to the middleware that enforces "JSON only",
// so the two halves of "a 16kb JSON body, nothing else" stay in one place.
export const JSON_BODY_LIMIT = "16kb";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hasBody(req: Request): boolean {
  if (!METHODS_WITH_BODY.has(req.method)) {
    return false;
  }
  const contentLength = req.header("content-length");
  if (contentLength !== undefined && contentLength !== "0") {
    return true;
  }
  return req.header("transfer-encoding") !== undefined;
}

// Registered in AppModule.configure(), after RequestContextMiddleware: a
// rejection here still carries X-Request-Id and X-Correlation-Id
// (requirements.md AC8), because it runs after those headers are already
// set, but before main.ts's `app.useBodyParser("json", ...)` — which
// remains Nest's own body-parsing mechanism (JSON_BODY_LIMIT there), not
// reimplemented here.
//
// Only application/json is accepted. Express's own json() parser would
// silently skip a non-matching content-type rather than reject it — this
// service needs a real rejection (requirements.md AC5's 415 case), so this
// check runs, and can throw, before any parsing is attempted.
@Injectable()
export class JsonContentTypeGuardMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (hasBody(req)) {
      const contentType = req.header("content-type");
      if (!contentType?.toLowerCase().startsWith("application/json")) {
        throw new UnsupportedMediaTypeException();
      }
    }

    next();
  }
}
