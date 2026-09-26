"""Tool logging (Phase 14 plan.md section 21; AC24, the tool half).

One ``ai_service.tools`` record per call, with exactly the agreed fields, and
nothing the model or commerce-api said: not the arguments, not a response
body, not commerce-api's message, not an unregistered tool name. Checked on
the records and on the service's real JSON output (``log_stream``).
"""

import io
import json
import logging
from typing import Any

import httpx
import pytest

from ai_service.tools.service import UNREGISTERED_TOOL
from tests.commerce_fakes import (
    CART,
    CART_LINE,
    FakeCommerce,
    contract_error,
    json_response,
)

SENTINEL = "sentinel-log-a91f"  # a valid item id, so a call can carry it
FIELDS = {
    "tool",
    "category",
    # Phase 15: a write's business intent; None for reads and UI tools.
    "intent",
    "outcome",
    "error_code",
    "commerce_status",
    "duration_ms",
}


def _tool_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "ai_service.tools"]


def _fields(record: logging.LogRecord) -> dict[str, Any]:
    fields: dict[str, Any] = record.fields  # type: ignore[attr-defined]
    return fields


def test_successful_call_logs_one_record(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))

    fake.execute_tool("get_cart", {})

    [record] = _tool_records(caplog)
    fields = _fields(record)
    assert set(fields) == FIELDS
    assert record.levelno == logging.INFO
    assert fields["tool"] == "get_cart"
    assert fields["category"] == "read"
    assert fields["intent"] is None
    assert fields["outcome"] == "ok"
    assert fields["error_code"] is None
    assert fields["commerce_status"] is None
    assert fields["duration_ms"] >= 0


def test_commerce_refusal_logs_code_and_status(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeCommerce().on(
        "POST", "/v1/cart/items", contract_error(422, "MENU_ITEM_UNAVAILABLE")
    )

    fake.execute_tool("add_cart_item", {"itemId": "tiramisu", "quantity": 1})

    [record] = _tool_records(caplog)
    fields = _fields(record)
    assert record.levelno == logging.INFO
    assert (fields["tool"], fields["category"]) == ("add_cart_item", "write")
    assert fields["outcome"] == "error"
    assert fields["error_code"] == "MENU_ITEM_UNAVAILABLE"
    assert fields["commerce_status"] == 422


@pytest.mark.parametrize(
    ("outcome", "code"),
    [
        (contract_error(400, "INVALID_PAYLOAD"), "COMMERCE_REQUEST_REJECTED"),
        (httpx.Response(200, content=b"{}"), "COMMERCE_BAD_RESPONSE"),
        (contract_error(404, "ROUTE_NOT_FOUND"), "COMMERCE_UNAVAILABLE"),
    ],
)
def test_drift_and_misconfiguration_are_warnings(
    outcome: Any, code: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeCommerce().on("GET", "/v1/menu", outcome)

    fake.execute_tool("get_menu", {})

    [record] = _tool_records(caplog)
    assert record.levelno == logging.WARNING
    assert _fields(record)["error_code"] == code


def test_plain_outage_is_not_a_warning(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeCommerce().on(
        "GET", "/v1/menu", contract_error(503, "SERVICE_UNAVAILABLE")
    )

    fake.execute_tool("get_menu", {})

    [record] = _tool_records(caplog)
    assert record.levelno == logging.INFO
    assert _fields(record)["commerce_status"] == 503


def test_unregistered_tool_name_is_not_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)

    FakeCommerce().execute_tool(SENTINEL, {})

    [record] = _tool_records(caplog)
    assert _fields(record)["tool"] == UNREGISTERED_TOOL
    assert _fields(record)["category"] is None
    assert _fields(record)["error_code"] == "UNKNOWN_TOOL"
    assert SENTINEL not in caplog.text


def _all_sentinel_paths(
    fake_body_line: dict[str, Any],
) -> list[tuple[FakeCommerce, str, Any]]:
    cart_with_sentinel = {
        **CART,
        "items": [{**CART_LINE, **fake_body_line}],
    }
    return [
        # In the arguments of a valid call.
        (
            FakeCommerce().on("POST", "/v1/cart/items", json_response(200, CART)),
            "add_cart_item",
            {"itemId": SENTINEL, "quantity": 1},
        ),
        # In the arguments of an invalid call, as a key and as a value.
        (FakeCommerce(), "get_cart", {SENTINEL: SENTINEL}),
        (FakeCommerce(), "add_cart_item", {"itemId": SENTINEL, "quantity": "x"}),
        # In commerce-api's response body.
        (
            FakeCommerce().on(
                "GET", "/v1/cart", json_response(200, cart_with_sentinel)
            ),
            "get_cart",
            {},
        ),
        # In commerce-api's error message.
        (
            FakeCommerce().on(
                "DELETE",
                f"/v1/cart/items/{SENTINEL}",
                contract_error(404, "CART_ITEM_NOT_FOUND", SENTINEL),
            ),
            "remove_cart_item",
            {"itemId": SENTINEL},
        ),
    ]


def test_no_sentinel_reaches_any_log(
    caplog: pytest.LogCaptureFixture, log_stream: io.StringIO
) -> None:
    caplog.set_level(logging.DEBUG)

    for fake, name, arguments in _all_sentinel_paths({"name": SENTINEL}):
        fake.execute_tool(name, arguments)

    records = _tool_records(caplog)
    assert len(records) == 5
    assert SENTINEL not in caplog.text
    assert all(SENTINEL not in json.dumps(_fields(r)) for r in records)
    output = log_stream.getvalue()
    assert output.count('"ai_service.tools"') == 5
    assert SENTINEL not in output
