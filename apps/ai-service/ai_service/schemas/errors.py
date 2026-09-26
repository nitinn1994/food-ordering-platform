"""The one error body this service returns: @contracts/common's
``ContractError`` (``{code, message, field?}``), the same body commerce-api
returns (docs/api/commerce-api.md section 5).

Hand-written, not generated - a scoped, guarded exception to ADR-0003
(plan.md OD9, ADR-0019). tests/test_errors.py validates every error body
this service can produce against the committed
packages/contracts/common/schema/error.v1.json, and checks these bounds
against it, so drift in either direction fails the suite. ``details`` is
reserved by the contract and populated by nothing, so it is not modelled.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

MAX_CODE_LENGTH = 64
MAX_MESSAGE_LENGTH = 500
MAX_FIELD_LENGTH = 64


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Annotated[
        str,
        Field(min_length=1, max_length=MAX_CODE_LENGTH, pattern=r"^[A-Z][A-Z0-9_]*$"),
    ]
    message: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)]
    field: Annotated[str, Field(min_length=1, max_length=MAX_FIELD_LENGTH)] | None = (
        None
    )

    def to_body(self) -> dict[str, str]:
        return self.model_dump(exclude_none=True)
