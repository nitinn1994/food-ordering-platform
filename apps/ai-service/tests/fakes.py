"""Test-only chat models for the model boundary.

Never shipped: nothing under ``ai_service/`` imports this module. They let
tests drive every path through the graph (a failing model, and each kind of
unusable output) with no provider and no network.
"""

from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

MODEL_EXCEPTION_SENTINEL = "SENTINEL_MODEL_EXCEPTION_5a2d"


class ScriptedChatModel(BaseChatModel):
    """Returns a copy of ``reply`` on every call and records what it was sent."""

    reply: AIMessage
    received: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        self.received.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.reply.model_copy())])


class RaisingChatModel(BaseChatModel):
    """Raises with a sentinel in the exception text, as a provider error might
    carry a prompt or a customer's words."""

    @property
    def _llm_type(self) -> str:
        return "raising"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        raise RuntimeError(MODEL_EXCEPTION_SENTINEL)


def empty_reply_model() -> ScriptedChatModel:
    return ScriptedChatModel(reply=AIMessage(content=""))


def non_text_reply_model() -> ScriptedChatModel:
    return ScriptedChatModel(
        reply=AIMessage(content=[{"type": "text", "text": "list content"}])
    )


def tool_call_model() -> ScriptedChatModel:
    return ScriptedChatModel(
        reply=AIMessage(
            content="",
            tool_calls=[{"name": "add_to_cart", "args": {}, "id": "call_1"}],
        )
    )
