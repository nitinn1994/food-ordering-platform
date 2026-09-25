import { API_ERROR_CODES } from "../../../common/errors/api-error-codes";
import { DomainError } from "../../../common/errors/domain.error";

const HTTP_NOT_FOUND = 404;

// Thrown by MenuService when a well-formed itemId names no item — distinct
// from ROUTE_NOT_FOUND (no such route at all) so a caller, including
// ai-service, can tell "no such item" apart from "wrong URL"
// (docs/api/commerce-api.md §6). The message deliberately does not include
// the id — it never echoes any part of the request (requirements.md AC3).
export class MenuItemNotFoundError extends DomainError {
  constructor() {
    super(
      HTTP_NOT_FOUND,
      API_ERROR_CODES.MENU_ITEM_NOT_FOUND,
      "Menu item not found.",
    );
  }
}
