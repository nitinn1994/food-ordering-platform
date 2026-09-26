"""What a tool returns to the model (Phase 14 plan.md sections 7 and 12).

``ToolResult`` is serialized to JSON as the content of a tool message. On
success ``data`` is the commerce-api resource, validated against its
generated contract model and re-serialized, never a raw body. On failure
``error`` mirrors ``ContractError`` (``{code, message, field?}``), so the model
sees one error vocabulary across the platform.

``error.code`` is either a commerce-api domain code passed through unchanged
or one of this layer's codes below. ``error.message`` is always chosen here,
by code, and written for the model: never commerce-api's message text, a
body, an exception's text or the arguments.
"""

from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ai_service.contracts.api_contracts import CartResponse, MenuResponse
from ai_service.schemas.errors import (
    MAX_CODE_LENGTH,
    MAX_FIELD_LENGTH,
    MAX_MESSAGE_LENGTH,
)

# commerce-api's own codes a tool passes through unchanged
# (docs/api/commerce-api.md section 6).
MENU_ITEM_NOT_FOUND = "MENU_ITEM_NOT_FOUND"
CART_ITEM_NOT_FOUND = "CART_ITEM_NOT_FOUND"
MENU_ITEM_UNAVAILABLE = "MENU_ITEM_UNAVAILABLE"
CART_ITEM_QUANTITY_LIMIT_EXCEEDED = "CART_ITEM_QUANTITY_LIMIT_EXCEEDED"
CART_CONFLICT = "CART_CONFLICT"

# This layer's codes.
UNKNOWN_TOOL = "UNKNOWN_TOOL"
INVALID_TOOL_ARGUMENTS = "INVALID_TOOL_ARGUMENTS"
TOOL_CALL_LIMIT_EXCEEDED = "TOOL_CALL_LIMIT_EXCEEDED"
COMMERCE_UNAVAILABLE = "COMMERCE_UNAVAILABLE"
COMMERCE_OUTCOME_UNKNOWN = "COMMERCE_OUTCOME_UNKNOWN"
COMMERCE_REQUEST_REJECTED = "COMMERCE_REQUEST_REJECTED"
COMMERCE_BAD_RESPONSE = "COMMERCE_BAD_RESPONSE"

PASSED_THROUGH_CODES = frozenset(
    {
        MENU_ITEM_NOT_FOUND,
        CART_ITEM_NOT_FOUND,
        MENU_ITEM_UNAVAILABLE,
        CART_ITEM_QUANTITY_LIMIT_EXCEEDED,
        CART_CONFLICT,
    }
)

# Every code a tool can return, with the one message the model gets for it.
MESSAGES = {
    MENU_ITEM_NOT_FOUND: (
        "That item is not on the menu. Use get_menu to find valid item ids."
    ),
    CART_ITEM_NOT_FOUND: (
        "That item is not in the cart. If you just removed it, it is already gone."
    ),
    MENU_ITEM_UNAVAILABLE: "That item is currently unavailable.",
    CART_ITEM_QUANTITY_LIMIT_EXCEEDED: (
        "The quantity for that item would exceed 99. Nothing was changed."
    ),
    CART_CONFLICT: (
        "The cart was changed by another request at the same time. Nothing was "
        "changed. Call get_cart before trying again."
    ),
    UNKNOWN_TOOL: "No such tool. Use only the tools you were given.",
    INVALID_TOOL_ARGUMENTS: (
        "The arguments are invalid. Check the tool's parameters and try again."
    ),
    TOOL_CALL_LIMIT_EXCEEDED: (
        "Too many tool calls in this turn. This call was not run. Answer with "
        "the information you already have."
    ),
    COMMERCE_UNAVAILABLE: (
        "The ordering service is unavailable right now. Nothing was changed. "
        "Tell the customer to try again shortly."
    ),
    COMMERCE_OUTCOME_UNKNOWN: (
        "It is unknown whether this change was applied. Call get_cart before "
        "doing anything else, and do not repeat the change without checking."
    ),
    COMMERCE_REQUEST_REJECTED: (
        "The ordering service rejected the request. Nothing was changed."
    ),
    COMMERCE_BAD_RESPONSE: (
        "The ordering service returned an unexpected response. Do not assume "
        "the request succeeded; call get_cart to check the cart."
    ),
}

ToolData = MenuResponse | CartResponse


class ToolError(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Annotated[
        str,
        Field(min_length=1, max_length=MAX_CODE_LENGTH, pattern=r"^[A-Z][A-Z0-9_]*$"),
    ]
    message: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)]
    # INVALID_TOOL_ARGUMENTS only: the name of a declared parameter.
    field: Annotated[str, Field(min_length=1, max_length=MAX_FIELD_LENGTH)] | None = (
        None
    )


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    ok: bool
    data: ToolData | None = None
    error: ToolError | None = None

    @model_validator(mode="after")
    def _exactly_one_outcome(self) -> Self:
        if self.ok != (self.data is not None) or self.ok == (self.error is not None):
            raise ValueError("ok requires data and no error; not ok, the reverse")
        return self

    @classmethod
    def success(cls, data: ToolData) -> Self:
        return cls(ok=True, data=data)

    @classmethod
    def failure(cls, code: str, field: str | None = None) -> Self:
        message = MESSAGES[code]
        if field is not None:
            message = f"The argument '{field}' is invalid. {message}"
        return cls(ok=False, error=ToolError(code=code, message=message, field=field))

    def to_content(self) -> str:
        """The tool message content the model reads."""
        return self.model_dump_json(exclude_none=True)
