// The one error type every commerce-api call rejects with — plan.md §6,
// §11 (AC16). Callers branch on `kind`, then on `code`; never on `message`.
//
// `message` is a developer-facing summary for logs and test output. It is
// never shown to a user: user-facing copy comes from userMessages.ts, which
// reads `kind`/`code` only. The backend's own ContractError.message is not
// kept at all, so it cannot leak into the UI by accident.

export type ApiErrorKind = "network" | "timeout" | "http" | "invalid-response";

export type ApiErrorInit = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  field?: string;
  requestId?: string;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly field?: string;
  // commerce-api's X-Request-Id, for correlating with its logs. Debugging
  // only — never rendered.
  readonly requestId?: string;

  constructor(init: ApiErrorInit) {
    super(describe(init));
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.field = init.field;
    this.requestId = init.requestId;
  }
}

function describe(init: ApiErrorInit): string {
  const parts = [`Commerce API request failed (${init.kind}`];
  if (init.status !== undefined) {
    parts.push(` ${init.status}`);
  }
  if (init.code) {
    parts.push(` ${init.code}`);
  }
  parts.push(")");
  return parts.join("");
}

const SERVICE_UNAVAILABLE = 503;

// Transient faults only — plan.md §13. A 4xx is a business answer, not a
// fault, and retrying it cannot change the result. Whether a *request* may
// be retried at all (a cart add may not) is the caller's decision; this only
// says whether the failure is the retryable kind.
export function isRetryable(error: ApiError): boolean {
  return (
    error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" && error.status === SERVICE_UNAVAILABLE)
  );
}
