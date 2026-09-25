import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

// One line per request, once the response has finished sending. Applied
// after RequestContextMiddleware (see app.module.ts's `configure()`), so
// AppLogger (common/logging/logger.ts) can already attach requestId and
// correlationId to this line without either being passed here explicitly.
//
// Deliberately just method, path, status, and duration — never the body,
// headers, or query string (plan.md, Phase 6, §11; requirements.md AC9).
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLogMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      this.logger.log("request handled", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  }
}
