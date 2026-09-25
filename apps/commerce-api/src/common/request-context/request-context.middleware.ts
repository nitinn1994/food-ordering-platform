import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { correlationIdSchema } from "@contracts/common";
import type { NextFunction, Request, Response } from "express";
import { requestContextStorage } from "./request-context";

export const REQUEST_ID_HEADER = "X-Request-Id";
export const CORRELATION_ID_HEADER = "X-Correlation-Id";

// Establishes this request's ids and makes them available to everything
// downstream via AsyncLocalStorage (requirements.md AC8):
//
// - X-Request-Id is always server-generated. An inbound value is never
//   trusted or echoed — it identifies this process's handling of the
//   request, not something a caller gets to claim.
// - X-Correlation-Id is echoed back when the inbound value is a valid
//   correlationId (reusing @contracts/common's own schema — the same field
//   an agent-intents or ui-commands envelope carries); a missing or
//   invalid one is replaced with a generated id, never rejected outright.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();

    const inboundCorrelationId = req.header(CORRELATION_ID_HEADER);
    const parsedCorrelationId =
      inboundCorrelationId === undefined
        ? undefined
        : correlationIdSchema.safeParse(inboundCorrelationId);
    const correlationId = parsedCorrelationId?.success
      ? parsedCorrelationId.data
      : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    requestContextStorage.run({ requestId, correlationId }, () => {
      next();
    });
  }
}
