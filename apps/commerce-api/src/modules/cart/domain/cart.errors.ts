import { API_ERROR_CODES } from "../../../common/errors/api-error-codes";
import { DomainError } from "../../../common/errors/domain.error";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

// The Cart domain's errors, each a DomainError subclass that
// AllExceptionsFilter turns into a ContractError — no filter change, no
// second error format (docs/features/phase-8-cart-domain/plan.md §18).
// Messages are static and never echo the itemId or quantity, the same rule
// menu.errors.ts follows.

// An add or set-quantity named a well-formed itemId that is not on the menu.
// Reuses MENU_ITEM_NOT_FOUND rather than a cart-specific code (plan.md
// OD13); a Cart-owned class rather than Menu's MenuItemNotFoundError so
// this domain does not import another domain's internals.
export class UnknownMenuItemError extends DomainError {
  constructor() {
    super(
      HTTP_NOT_FOUND,
      API_ERROR_CODES.MENU_ITEM_NOT_FOUND,
      "Menu item not found.",
    );
  }
}

// An add or set-quantity named an item whose `available` is false. 422: the
// request is well-formed; the business refuses it (commerce-api.md §6).
export class MenuItemUnavailableError extends DomainError {
  constructor() {
    super(
      HTTP_UNPROCESSABLE_ENTITY,
      API_ERROR_CODES.MENU_ITEM_UNAVAILABLE,
      "Menu item is currently unavailable.",
    );
  }
}

// A set-quantity or remove named an item that has no line in this cart —
// never an upsert, never a silent no-op (plan.md OD7).
export class CartItemNotFoundError extends DomainError {
  constructor() {
    super(
      HTTP_NOT_FOUND,
      API_ERROR_CODES.CART_ITEM_NOT_FOUND,
      "Item is not in the cart.",
    );
  }
}

// Merging an add into an existing line would exceed MAX_QUANTITY. Each
// request quantity is valid on its own; the resulting state is not — the
// exact case commerce-api.md §6 reserved 422 for. Rejected, not clamped
// (plan.md §12, OD6).
export class CartItemQuantityLimitExceededError extends DomainError {
  constructor() {
    super(
      HTTP_UNPROCESSABLE_ENTITY,
      API_ERROR_CODES.CART_ITEM_QUANTITY_LIMIT_EXCEEDED,
      "Item quantity would exceed the per-line limit.",
    );
  }
}

// CartRepository.save found a stored version other than the one this write
// was based on — another write got there first. The caller re-reads and
// retries; nothing retries internally (plan.md §19, OD10).
export class CartVersionConflictError extends DomainError {
  constructor() {
    super(
      HTTP_CONFLICT,
      API_ERROR_CODES.CART_CONFLICT,
      "The cart was changed by another request. Retry.",
    );
  }
}
