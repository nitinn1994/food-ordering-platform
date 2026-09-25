import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ContractError } from "@contracts/common";
import type { Response } from "express";
import { API_ERROR_CODES, type ApiErrorCode } from "./api-error-codes";
import { ApiException } from "./api.exception";

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.NOT_FOUND]: API_ERROR_CODES.ROUTE_NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: API_ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
};

// A body-parser (express.json()) rejection never reaches this filter as a
// Nest HttpException — it is a plain `http-errors`-shaped object with a
// numeric `status`/`statusCode` and, for a too-large body specifically,
// `type: "entity.too.large"`. Detected structurally rather than by
// `instanceof`, since this service never imports body-parser's own error
// class — the same "can this possibly be trusted" reasoning apps/web's
// dispatch.ts already applies to untyped input.
function isPayloadTooLargeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "entity.too.large"
  );
}

// The one place every thrown error in this service becomes an HTTP
// response (requirements.md AC5, AC7). Every branch below produces exactly
// a @contracts/common ContractError body — nothing else does, and nothing
// here ever includes a stack trace, an exception message, or an echo of
// the request payload for the 500 branch specifically.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, error } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full detail server-side only. AppLogger (common/logging/logger.ts)
      // attaches the active request's requestId automatically from
      // AsyncLocalStorage — nothing here needs to pass it explicitly
      // (requirements.md AC7).
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    }

    response.status(status).json(error);
  }

  private resolve(exception: unknown): {
    status: number;
    error: ContractError;
  } {
    if (exception instanceof ApiException) {
      return { status: exception.getStatus(), error: exception.error };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
        const code = STATUS_TO_CODE[status] ?? API_ERROR_CODES.REQUEST_FAILED;
        return {
          status,
          error: { code, message: exception.message || "Request failed." },
        };
      }
      // A 5xx HttpException falls through to the generic branch below —
      // it gets the same "no exception message" treatment as anything
      // else unexpected (requirements.md AC7).
    } else if (isPayloadTooLargeError(exception)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        error: {
          code: API_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: "Request body is too large.",
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: "An unexpected error occurred.",
      },
    };
  }
}
