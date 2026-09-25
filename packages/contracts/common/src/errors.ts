import { z } from "zod";

// The one error shape this phase defines for a future service-level
// rejection — a commerce-api response body, or whatever api-contracts ends
// up needing once it has a producer (requirements.md D12). It is not yet
// constructed anywhere in this codebase: parseCommand, parseBatch,
// parseIntent, and parseIntentRequest all keep their own pre-existing
// {accepted, reason, received} shape unchanged (D8), which is the correct
// call for them — this schema exists so the next service that needs a
// structured rejection has one already designed, not so today's contract
// parsers are rewritten to use it. Three rules matter for whoever does wire
// it in:
//
//   1. Parsers return results; they do not throw. See parse.ts in the
//      ui-commands and agent-intents packages.
//   2. `message` is for humans and is never parsed. `code` is the only field
//      a consumer may branch on.
//   3. `details` is structured data, never free HTML, and never rendered
//      without escaping.
//
// Endpoint-level error contracts — HTTP status mapping, per-route error sets —
// belong to api-contracts, which this phase deliberately does not write
// (requirements.md D12).

export const MAX_ERROR_MESSAGE_LENGTH = 500;
export const MAX_ERROR_FIELD_LENGTH = 64;

// A pattern rather than a z.enum, deliberately. An enum would mean commerce-api
// cannot introduce a domain error code without a contract change, and under
// the compatibility rules (§14) a producer adding an enum member is something
// old consumers reject. The codes below are the ones the *contract layer*
// itself can produce; domain codes arrive with the service that owns them.
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const contractErrorCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(ERROR_CODE_PATTERN);

export const CONTRACT_ERROR_CODES = {
  /** Shape validation failed against the schema. */
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  /** The discriminator named a command or intent that is not in the union. */
  UNKNOWN_TYPE: "UNKNOWN_TYPE",
  /** The envelope's contractVersion is one this consumer does not implement. */
  UNSUPPORTED_CONTRACT_VERSION: "UNSUPPORTED_CONTRACT_VERSION",
  /** A batch carried more commands than the envelope permits. */
  BATCH_LIMIT_EXCEEDED: "BATCH_LIMIT_EXCEEDED",
} as const;

export type ContractErrorCode =
  (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES];

export const contractErrorSchema = z.strictObject({
  code: contractErrorCodeSchema,
  message: z.string().min(1).max(MAX_ERROR_MESSAGE_LENGTH),
  /** Present for validation failures: which field was at fault. */
  field: z.string().min(1).max(MAX_ERROR_FIELD_LENGTH).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ContractError = z.infer<typeof contractErrorSchema>;
