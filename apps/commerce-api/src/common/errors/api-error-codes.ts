import { CONTRACT_ERROR_CODES } from "@contracts/common";

// Codes commerce-api itself introduces, beyond the ones @contracts/common
// already defines for the contract-parsing layer. INVALID_PAYLOAD and
// UNSUPPORTED_CONTRACT_VERSION are reused as-is from there, not redefined:
// contractErrorCodeSchema validates by pattern, not by z.enum, specifically
// so a service can introduce its own codes without a contract change
// (packages/contracts/common/src/errors.ts).
export const API_ERROR_CODES = {
  ...CONTRACT_ERROR_CODES,
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // The Menu domain's own code (modules/menu/domain/menu.errors.ts) — the
  // first domain-owned code this file carries, per the same "domain codes
  // arrive with the service that owns them" rule @contracts/common's
  // errors.ts states.
  MENU_ITEM_NOT_FOUND: "MENU_ITEM_NOT_FOUND",
  // Fallback only, for a Nest HttpException status this filter has no
  // explicit mapping for. Nothing in this phase throws one — see
  // all-exceptions.filter.ts's STATUS_TO_CODE map, which is where the real
  // mapping belongs once a future phase introduces one.
  REQUEST_FAILED: "REQUEST_FAILED",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
