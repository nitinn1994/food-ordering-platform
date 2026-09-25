import { HttpStatus } from "@nestjs/common";
import { CONTRACT_ERROR_CODES, type ContractError } from "@contracts/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ApiException } from "../errors/api.exception";

const MAX_FIELD_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 500;

function issuePath(issue: StandardSchemaV1.Issue): string {
  if (!issue.path || issue.path.length === 0) {
    return "";
  }
  return issue.path
    .map((segment) =>
      String(typeof segment === "object" ? segment.key : segment),
    )
    .join(".");
}

// Maps Standard Schema validation issues (Zod 4 schemas implement this
// spec) to exactly a @contracts/common ContractError (plan.md, Phase 6,
// §9), thrown as an ApiException. Passed as the global
// StandardSchemaValidationPipe's `exceptionFactory` — see main.ts. Rejected
// input is never echoed here: only field names and issue messages appear,
// never `issue.input` or the value that failed (requirements.md AC6).
export function validationExceptionFactory(
  issues: readonly StandardSchemaV1.Issue[],
): ApiException {
  const [firstIssue] = issues;
  const field = firstIssue
    ? issuePath(firstIssue).slice(0, MAX_FIELD_LENGTH)
    : undefined;

  // contractVersion failing validation means the caller is speaking a
  // contract major version this service does not implement — a distinct
  // failure from "the payload doesn't match the shape at all"
  // (requirements.md AC6).
  const isVersionMismatch = issues.some(
    (issue) => issuePath(issue) === "contractVersion",
  );

  const message = issues
    .map((issue) => `${issuePath(issue) || "(root)"}: ${issue.message}`)
    .join("; ")
    .slice(0, MAX_MESSAGE_LENGTH);

  const error: ContractError = {
    code: isVersionMismatch
      ? CONTRACT_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION
      : CONTRACT_ERROR_CODES.INVALID_PAYLOAD,
    message,
    ...(field ? { field } : {}),
  };

  return new ApiException(HttpStatus.BAD_REQUEST, error);
}
