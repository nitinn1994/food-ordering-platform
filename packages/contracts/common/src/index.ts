export { CONTRACT_VERSION, contractVersionSchema } from "./version";
export type { ContractVersion } from "./version";

export {
  MAX_ID_LENGTH,
  MAX_CORRELATION_ID_LENGTH,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  menuItemIdSchema,
  menuCategoryIdSchema,
  correlationIdSchema,
  idempotencyKeySchema,
} from "./ids";
export type {
  MenuItemId,
  MenuCategoryId,
  CorrelationId,
  IdempotencyKey,
} from "./ids";

export { MAX_QUANTITY, quantitySchema, priceCentsSchema } from "./money";
export type { Quantity, PriceCents } from "./money";

export { isoTimestampSchema, envelopeBaseShape } from "./metadata";
export type { IsoTimestamp } from "./metadata";

export {
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_ERROR_FIELD_LENGTH,
  CONTRACT_ERROR_CODES,
  contractErrorCodeSchema,
  contractErrorSchema,
} from "./errors";
export type { ContractError, ContractErrorCode } from "./errors";
