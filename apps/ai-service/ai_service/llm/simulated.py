"""The deterministic chat model the service runs on until a provider exists.

The project is simulation-first (CLAUDE.md): there is no model provider yet.
This model implements LangChain's ``BaseChatModel``, so the graph runs
exactly as it will with a real provider, and the tests run with no key and no
network (Phase 13 plan.md section 10).

Phase 15 (plan.md OD6) turns it from one fixed reply into a small keyword
table, so the chat in apps/web keeps working once it talks to this service
instead of its own hardcoded stand-in (``simulate.ts``, the phrases below
come from it). It reads only the current turn's messages:

- ``show me the desserts`` / ``starters`` / ``mains``, ``search for X`` /
  ``find X``, ``... details``, ``tiramisu``, ``cart``: one presentation
  tool call, then a fixed reply.
- ``add <item>``: ``add_cart_item`` with the item's name as a slug and
  quantity 1. Only if that tool answers ``"ok": true`` does it then open the
  cart; on any error it explains the failure and emits no UI command
  (plan.md section 17). commerce-api decides whether the item exists.
- Anything else: the fixed ``SIMULATED_REPLY``.

Its replies are fixed strings: it never echoes the customer's text into a
reply and never states a price or total. The one piece of customer text it
passes on is a search phrase, as a tool argument the tool validates. It
calls only tools the graph registers (tests/test_simulated_model.py).
``bind_tools`` accepts the tools and ignores them: the table names its tools
itself.
"""

import json
import re
from collections.abc import Callable, Sequence
from typing import Any

from annotated_types import MaxLen
from langchain_core.callbacks import (
    AsyncCallbackManagerForLLMRun,
    CallbackManagerForLLMRun,
)
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolCall,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable

from ai_service.contracts.ui_commands import SearchMenu

SIMULATED_REPLY = (
    "I can show a menu category, find or highlight an item, show an item's "
    "details, open your cart, or add an item to it. Try “show me the "
    "desserts” or “add tiramisu”."
)
ADDED_REPLY = "Added it to your cart."
ASK_WHICH_ITEM_REPLY = "Which item would you like me to add?"
UNUSABLE_RESULT_REPLY = "Sorry, something went wrong. Please try again."

# The tools this table calls. Each must be registered (a test checks).
ADD_CART_ITEM = "add_cart_item"
OPEN_CART_PANEL = "open_cart_panel"
SHOW_MENU_CATEGORY = "show_menu_category"
HIGHLIGHT_ITEM = "highlight_item"
SHOW_ITEM_DETAIL = "show_item_detail"
SEARCH_MENU = "search_menu"
TOOL_NAMES = frozenset(
    {
        ADD_CART_ITEM,
        OPEN_CART_PANEL,
        SHOW_MENU_CATEGORY,
        HIGHLIGHT_ITEM,
        SHOW_ITEM_DETAIL,
        SEARCH_MENU,
    }
)

# Reply after a presentation call, by tool: the same wording apps/web's
# ChatInput showed for each command before Phase 15.
SHOWN_REPLIES = {
    SHOW_MENU_CATEGORY: "Here's that category.",
    HIGHLIGHT_ITEM: "Highlighting that item.",
    OPEN_CART_PANEL: "Here's your cart.",
    SHOW_ITEM_DETAIL: "Here are the details.",
    SEARCH_MENU: "Here's what I found.",
}
NOT_SHOWN_REPLY = "Sorry, I couldn't show that."

# Reply after a failed add, by tool error code. None of them claims success,
# and only those where the code says so claim the cart is unchanged.
NOT_CHANGED = "Your cart hasn't changed."
ADD_FAILURE_REPLIES = {
    "MENU_ITEM_UNAVAILABLE": (
        f"Sorry, that item is currently unavailable. {NOT_CHANGED}"
    ),
    "MENU_ITEM_NOT_FOUND": f"I couldn't find that item on the menu. {NOT_CHANGED}",
    "INVALID_TOOL_ARGUMENTS": f"I couldn't find that item on the menu. {NOT_CHANGED}",
    "CART_ITEM_QUANTITY_LIMIT_EXCEEDED": (
        f"You already have the most of that item you can order. {NOT_CHANGED}"
    ),
    "COMMERCE_OUTCOME_UNKNOWN": (
        "I'm not sure whether that went through. Please check your cart before "
        "trying again."
    ),
}
ADD_FAILURE_REPLY = "I couldn't add that right now. Please try again shortly."

_MAX_QUERY_LENGTH: int = next(
    item.max_length
    for item in SearchMenu.model_fields["query"].metadata
    if isinstance(item, MaxLen)
)
_ADD = re.compile(
    r"add (?:an? |one |some )?(?P<item>.+?)(?: to (?:my |the )?(?:cart|order))?[.!]*"
)
_NOT_SLUG = re.compile(r"[^a-z0-9]+")
_SEARCH_PREFIXES = ("search for ", "find ")
_CATEGORIES = (("dessert", "desserts"), ("starter", "starters"), ("main", "mains"))
# The one item simulate.ts showed details for and highlighted.
_FEATURED_ITEM = "tiramisu"


class SimulatedChatModel(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "simulated"

    # BaseChatModel's own raises NotImplementedError. The tools are not
    # used: the table below names its own, all of them registered.
    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Callable[..., Any] | Any],
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return _result(respond(messages))

    # Overridden so an async caller is not sent to a worker thread for a
    # table lookup (BaseChatModel's default runs _generate in an executor).
    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return _result(respond(messages))


def respond(messages: Sequence[BaseMessage]) -> AIMessage:
    """The next model message for this turn: a tool call or a reply."""
    turn = _current_turn(messages)
    if not turn:
        return AIMessage(content=SIMULATED_REPLY)
    text = turn[0].content
    later = turn[1:]
    if not isinstance(text, str):
        return AIMessage(content=SIMULATED_REPLY)
    results = [m for m in later if isinstance(m, ToolMessage)]
    if not results:
        return _first_step(text)
    requested = [
        call for m in later if isinstance(m, AIMessage) for call in m.tool_calls
    ]
    if not requested:
        return AIMessage(content=UNUSABLE_RESULT_REPLY)
    return _after_tool(requested, results[-1], step=len(requested))


def _current_turn(messages: Sequence[BaseMessage]) -> list[BaseMessage]:
    """The last human message and everything after it."""
    for index in range(len(messages) - 1, -1, -1):
        if isinstance(messages[index], HumanMessage):
            return list(messages[index:])
    return []


def _first_step(text: str) -> AIMessage:
    phrase = text.strip().lower()
    added = _ADD.fullmatch(phrase)
    if added:
        item_id = _NOT_SLUG.sub("-", added["item"]).strip("-")
        if not item_id:
            return AIMessage(content=ASK_WHICH_ITEM_REPLY)
        return _call(ADD_CART_ITEM, {"itemId": item_id, "quantity": 1}, step=0)
    for prefix in _SEARCH_PREFIXES:
        if phrase.startswith(prefix):
            query = phrase[len(prefix) :][:_MAX_QUERY_LENGTH]
            return _call(SEARCH_MENU, {"query": query}, step=0)
    # "tiramisu details" is a detail request, not just a highlight.
    if "detail" in phrase:
        return _call(SHOW_ITEM_DETAIL, {"itemId": _FEATURED_ITEM}, step=0)
    for keyword, category_id in _CATEGORIES:
        if keyword in phrase:
            return _call(SHOW_MENU_CATEGORY, {"categoryId": category_id}, step=0)
    if _FEATURED_ITEM in phrase:
        return _call(HIGHLIGHT_ITEM, {"itemId": _FEATURED_ITEM}, step=0)
    if "cart" in phrase:
        return _call(OPEN_CART_PANEL, {"open": True}, step=0)
    return AIMessage(content=SIMULATED_REPLY)


def _after_tool(
    requested: Sequence[ToolCall], result: ToolMessage, step: int
) -> AIMessage:
    outcome = _outcome(result)
    if outcome is None:
        return AIMessage(content=UNUSABLE_RESULT_REPLY)
    ok, code = outcome
    name = requested[-1]["name"]
    if name == ADD_CART_ITEM:
        if ok:
            # Only now, with commerce-api's success in hand, is the cart shown.
            return _call(OPEN_CART_PANEL, {"open": True}, step=step)
        return AIMessage(content=ADD_FAILURE_REPLIES.get(code, ADD_FAILURE_REPLY))
    if not ok:
        return AIMessage(content=NOT_SHOWN_REPLY)
    if any(call["name"] == ADD_CART_ITEM for call in requested):
        return AIMessage(content=ADDED_REPLY)
    return AIMessage(content=SHOWN_REPLIES.get(name, NOT_SHOWN_REPLY))


def _outcome(result: ToolMessage) -> tuple[bool, str] | None:
    """(ok, error code) from a tool message, or None if it is unreadable."""
    if not isinstance(result.content, str):
        return None
    try:
        content = json.loads(result.content)
    except json.JSONDecodeError:
        return None
    if not isinstance(content, dict) or not isinstance(content.get("ok"), bool):
        return None
    error = content.get("error")
    code = error.get("code") if isinstance(error, dict) else None
    return content["ok"], code if isinstance(code, str) else ""


def _call(name: str, args: dict[str, Any], step: int) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[ToolCall(name=name, args=args, id=f"simulated_{step}")],
    )


def _result(message: AIMessage) -> ChatResult:
    return ChatResult(generations=[ChatGeneration(message=message)])
