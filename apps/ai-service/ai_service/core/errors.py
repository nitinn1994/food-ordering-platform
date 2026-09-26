"""Every error response is built here, as an ``ErrorResponse``.

Mapping (plan.md section 11):

- request validation        -> 400 INVALID_PAYLOAD (not FastAPI's 422, to
                               match commerce-api), bounded ``field``, never
                               the rejected value
- no matching route         -> 404 ROUTE_NOT_FOUND
- wrong method              -> 405 METHOD_NOT_ALLOWED (``Allow`` kept)
- body over 16 KB           -> 413 PAYLOAD_TOO_LARGE, sent by
                               core/request_limits.py
- body not application/json -> 415 UNSUPPORTED_MEDIA_TYPE, same
- any other HTTP exception  -> its status, HTTP_ERROR, a static phrase
- ``AiServiceError``        -> its own status/code/message
- anything else             -> 500 INTERNAL_ERROR, sent by
                               core/request_context.py (see there for why)

No handler ever returns an exception's own text, a stack trace, or the
request. Codes for failures this service cannot raise yet (a commerce-api
outage, a model timeout) arrive with the phase that can raise them.
"""

from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ai_service.schemas.errors import (
    MAX_FIELD_LENGTH,
    MAX_MESSAGE_LENGTH,
    ErrorResponse,
)

# @contracts/common's own code (CONTRACT_ERROR_CODES), reused, not redefined.
INVALID_PAYLOAD = "INVALID_PAYLOAD"
# This service's own API-level codes (commerce-api uses the same names).
ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND"
METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
HTTP_ERROR = "HTTP_ERROR"
PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
INTERNAL_ERROR = "INTERNAL_ERROR"

INTERNAL_ERROR_RESPONSE = ErrorResponse(
    code=INTERNAL_ERROR, message="Internal server error."
)


class AiServiceError(Exception):
    """Base for every error this service raises on purpose.

    ``message`` is returned to the caller verbatim, so it must be written
    for the caller: never an exception's text, a provider's response, a
    prompt, or configuration.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        field: str | None = None,
    ) -> None:
        super().__init__(code)
        self.response = ErrorResponse(code=code, message=message, field=field)
        self.status_code = status_code


def _json(
    status_code: int,
    error: ErrorResponse,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(error.to_body(), status_code=status_code, headers=headers)


def _truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[:limit]


def _validation_error(exc: RequestValidationError) -> ErrorResponse:
    first = exc.errors()[0] if exc.errors() else {}
    error_type = str(first.get("type", "invalid"))
    loc = [str(part) for part in first.get("loc", ())]
    # "body" is where FastAPI puts the request body; the field is the path
    # inside it, as in commerce-api ("intent.itemId"). Query, path and
    # header locations keep their prefix. An unparseable body has no field.
    if loc and loc[0] == "body":
        loc = loc[1:]
    field = ".".join(loc) if loc and error_type != "json_invalid" else None
    # The Pydantic *type* only, never its message or input: both can echo
    # the rejected value (the same rule as config.py).
    message = f"{field or 'body'}: {error_type}"
    return ErrorResponse(
        code=INVALID_PAYLOAD,
        message=_truncate(message, MAX_MESSAGE_LENGTH),
        field=_truncate(field, MAX_FIELD_LENGTH) if field else None,
    )


async def _handle_validation(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101 - registration contract
    return _json(400, _validation_error(exc))


def _status_phrase(status_code: int) -> str:
    # HTTPStatus knows only the registered codes; a non-standard one (499,
    # say) raises ValueError, which would turn this response into a 500.
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "HTTP error."


async def _handle_http(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101 - registration contract
    if exc.status_code == 404:
        error = ErrorResponse(code=ROUTE_NOT_FOUND, message="Route not found.")
    elif exc.status_code == 405:
        error = ErrorResponse(code=METHOD_NOT_ALLOWED, message="Method not allowed.")
    else:
        # A static phrase, never exc.detail: detail is free text from
        # whoever raised it.
        error = ErrorResponse(code=HTTP_ERROR, message=_status_phrase(exc.status_code))
    # Keeps protocol headers such as 405's Allow.
    return _json(exc.status_code, error, headers=exc.headers)


async def _handle_service_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AiServiceError)  # noqa: S101 - registration contract
    return _json(exc.status_code, exc.response)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _handle_validation)
    app.add_exception_handler(StarletteHTTPException, _handle_http)
    app.add_exception_handler(AiServiceError, _handle_service_error)
