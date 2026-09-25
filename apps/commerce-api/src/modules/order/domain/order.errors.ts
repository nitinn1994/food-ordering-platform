import { API_ERROR_CODES } from "../../../common/errors/api-error-codes";
import { DomainError } from "../../../common/errors/domain.error";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

// The Order domain's errors, each a DomainError subclass that
// AllExceptionsFilter turns into a ContractError — no filter change, no
// second error format (docs/features/phase-9-order-domain/plan.md §16).
// Messages are static: they never echo an order id, an idempotency key, or
// any customer detail — the last of those is personal data (plan.md §25).

// No order with this id exists for the resolved owner. Another owner's
// order is indistinguishable from a missing one (plan.md §13).
export class OrderNotFoundError extends DomainError {
  constructor() {
    super(HTTP_NOT_FOUND, API_ERROR_CODES.ORDER_NOT_FOUND, "Order not found.");
  }
}

// The cart has no lines. 422: the request is well-formed; there is nothing
// to order (plan.md §10).
export class CartEmptyError extends DomainError {
  constructor() {
    super(
      HTTP_UNPROCESSABLE_ENTITY,
      API_ERROR_CODES.CART_EMPTY,
      "The cart is empty.",
    );
  }
}

// A cart line's item is unavailable, or no longer on the menu at all. The
// same code a cart add or set-quantity returns for an unavailable item
// (plan.md OD9) — a caller branches on one code for "this item cannot be
// ordered right now" wherever it surfaces. An Order-owned class rather than
// Cart's MenuItemUnavailableError so this domain does not import another
// domain's internals.
export class OrderItemUnavailableError extends DomainError {
  constructor() {
    super(
      HTTP_UNPROCESSABLE_ENTITY,
      API_ERROR_CODES.MENU_ITEM_UNAVAILABLE,
      "An item in the cart is currently unavailable.",
    );
  }
}

// The cart changed between being priced and being consumed — another
// request got there first. Nothing was ordered and the cart is as the other
// request left it. Reuses CART_CONFLICT (plan.md OD9); the caller re-reads
// and retries — with the same idempotency key, which replays the order if
// the other request was this one's own earlier attempt (plan.md §12).
export class CheckoutCartConflictError extends DomainError {
  constructor() {
    super(
      HTTP_CONFLICT,
      API_ERROR_CODES.CART_CONFLICT,
      "The cart was changed by another request. Retry.",
    );
  }
}

// The idempotency key was already used, by this owner, for an order with
// different customer details. Nothing changes (plan.md §12, OD7).
export class IdempotencyKeyReusedError extends DomainError {
  constructor() {
    super(
      HTTP_CONFLICT,
      API_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      "This idempotency key was already used for a different order request.",
    );
  }
}

// OrderRepository.create found an order with the same id or the same
// (owner, idempotency key). A plain Error, not a DomainError: OrderService
// checks the key first and the cart version serializes placements, so
// reaching this is a bug — a generic 500, logged, never a client-facing code
// (plan.md §11, §16).
export class OrderAlreadyExistsError extends Error {
  constructor() {
    super("Order already exists.");
    this.name = "OrderAlreadyExistsError";
  }
}
