"""The Commerce API client against a real, running commerce-api (Phase 14
plan.md OD14). Opt-in: skipped unless AI_SERVICE_LIVE_COMMERCE_API_URL is
set, so the default suite never needs a network or a database.

    AI_SERVICE_LIVE_COMMERCE_API_URL=http://127.0.0.1:3001 \\
        uv run pytest tests/test_live_commerce.py

It changes the one shared cart (the system is single-user, ADR-0015): it
picks an available menu item that is not already in the cart, adds it, sets
its quantity, then removes it, so the cart ends as it started. It never
places an order. It checks that the committed contracts match what the
running service actually returns, which the mocked tests cannot.
"""

import asyncio
import os
from collections.abc import Awaitable, Callable

import pytest

from ai_service.clients.commerce import (
    CommerceApiError,
    CommerceClient,
    build_commerce_http_client,
)
from ai_service.config import Settings

LIVE_URL_VARIABLE = "AI_SERVICE_LIVE_COMMERCE_API_URL"
LIVE_URL = os.environ.get(LIVE_URL_VARIABLE, "")

pytestmark = pytest.mark.skipif(
    not LIVE_URL, reason=f"{LIVE_URL_VARIABLE} is not set (opt-in live check)"
)


def _run[T](operation: Callable[[CommerceClient], Awaitable[T]]) -> T:
    async def call() -> T:
        settings = Settings(app_env="test", commerce_api_url=LIVE_URL)
        async with build_commerce_http_client(settings) as http:
            return await operation(CommerceClient(http))

    return asyncio.run(call())


async def _round_trip(client: CommerceClient) -> None:
    menu = await client.get_menu()
    before = await client.get_cart()
    in_cart = {line.itemId for line in before.items}
    candidates = [
        item.id
        for category in menu.categories
        for item in category.items
        if item.available and item.id not in in_cart
    ]
    if not candidates:
        pytest.skip("every available menu item is already in the cart")
    item_id = candidates[0]

    # If the add itself fails, there is nothing to clean up, and its error is
    # the one reported (not a cleanup CART_ITEM_NOT_FOUND).
    added = await client.add_cart_item(item_id, 1)
    try:
        assert {line.itemId: line.quantity for line in added.items}[item_id] == 1

        updated = await client.set_cart_item_quantity(item_id, 2)
        assert {line.itemId: line.quantity for line in updated.items}[item_id] == 2
    finally:
        removed = await client.remove_cart_item(item_id)

    assert item_id not in {line.itemId for line in removed.items}
    assert removed == before


def test_menu_and_cart_round_trip() -> None:
    _run(_round_trip)


def test_domain_errors_arrive_as_codes() -> None:
    async def unknown_item(client: CommerceClient) -> None:
        await client.add_cart_item("no-such-item-phase-14", 1)

    async def not_in_cart(client: CommerceClient) -> None:
        await client.remove_cart_item("no-such-item-phase-14")

    with pytest.raises(CommerceApiError) as unknown:
        _run(unknown_item)
    with pytest.raises(CommerceApiError) as missing:
        _run(not_in_cart)

    assert (unknown.value.status, unknown.value.code) == (404, "MENU_ITEM_NOT_FOUND")
    assert (missing.value.status, missing.value.code) == (404, "CART_ITEM_NOT_FOUND")
