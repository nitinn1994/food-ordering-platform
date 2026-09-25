import { HttpException, type HttpStatus } from "@nestjs/common";
import type { ContractError } from "@contracts/common";

// The exception type commerce-api's own code throws when it wants precise
// control over both the ContractError body and the HTTP status — as
// opposed to Nest's own HttpException subclasses (the router's automatic
// 404, our own UnsupportedMediaTypeException) and body-parser's
// payload-too-large error, which AllExceptionsFilter maps separately by
// status (requirements.md AC5).
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly error: ContractError,
  ) {
    super(error, status);
  }
}
