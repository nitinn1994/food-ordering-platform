"""Test-only routes, mounted through ``create_app(extra_routers=...)``.

Never shipped: nothing under ``ai_service/`` imports this module. They exist
to exercise request validation, the unhandled-error path and in-request
logging, which no production route can trigger (the same role as
commerce-api's test/fixtures/validation-fixture.controller.ts).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ai_service.core.errors import AiServiceError

EXCEPTION_SENTINEL = "SENTINEL_EXCEPTION_TEXT_7d41"

router = APIRouter(prefix="/__test")
logger = logging.getLogger("tests.fixtures_routes")


class EchoBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=10)]


@router.post("/echo")
def echo(body: EchoBody) -> EchoBody:
    return body


@router.get("/boom")
def boom() -> None:
    raise RuntimeError(EXCEPTION_SENTINEL)


@router.get("/log")
def log_something() -> dict[str, str]:
    logger.info("inside a request")
    return {"logged": "yes"}


@router.get("/query")
def query(limit: int) -> dict[str, int]:
    return {"limit": limit}


@router.get("/service-error")
def service_error() -> None:
    raise AiServiceError(
        code="TEST_FAILURE", message="A test failure.", status_code=409
    )


@router.get("/teapot")
def teapot() -> None:
    raise HTTPException(status_code=418, detail=EXCEPTION_SENTINEL)


@router.get("/nonstandard-status")
def nonstandard_status() -> None:
    # 499 is not a member of http.HTTPStatus (review finding 1).
    raise HTTPException(status_code=499, detail=EXCEPTION_SENTINEL)
