"""The Commerce API client's four failures (Phase 14 plan.md sections 9, 11
and 12).

Each carries only what a caller may act on: the HTTP status when there was
one, and for ``CommerceApiError`` commerce-api's ``code``. Messages are fixed.
None of them keeps the URL, a body, a header, commerce-api's ``message`` or
httpx's exception text, any of which could reach a log.
"""


class CommerceClientError(Exception):
    """Base for every failure the client raises on purpose."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class CommerceUnavailableError(CommerceClientError):
    """commerce-api could not be used: no connection, a timeout on a read,
    or a 5xx (including 503 SERVICE_UNAVAILABLE). Nothing was changed, or the
    request was a read."""

    def __init__(self, status: int | None = None) -> None:
        super().__init__("The commerce service is unavailable.", status)


class CommerceOutcomeUnknownError(CommerceClientError):
    """A write may or may not have been applied: the request may have been
    sent, but no response arrived. Never retried (a cart add is a delta,
    system-architecture.md section 8 gap 3); the caller must re-read."""

    def __init__(self) -> None:
        super().__init__("The outcome of the commerce request is unknown.")


class CommerceApiError(CommerceClientError):
    """commerce-api answered with a 4xx ``ContractError``. ``code`` is the only
    field a caller may branch on (docs/api/commerce-api.md section 5)."""

    def __init__(self, status: int, code: str) -> None:
        super().__init__("The commerce service refused the request.", status)
        self.code = code


class CommerceBadResponseError(CommerceClientError):
    """The response was not what the contract promises: a 2xx body that does
    not parse or validate, a body that cannot be decoded, a redirect, or an
    error without a ContractError body."""

    def __init__(self, status: int | None = None) -> None:
        super().__init__(
            "The commerce service returned an unexpected response.", status
        )
