"""Test-only chat models for the model boundary.

Never shipped: nothing under ``ai_service/`` imports this module. They let
tests drive every path through the graph (a failing model, each kind of
unusable output, and multi-round tool use) with no provider and no network.
Each records the tools the graph binds to it.
"""

from collections.abc import Sequence
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessage, BaseMessage, ToolCall
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from pydantic import Field

MODEL_EXCEPTION_SENTINEL = "SENTINEL_MODEL_EXCEPTION_5a2d"


class RecordingChatModel(BaseChatModel):
    """Records the tools it is bound to; ``bind_tools`` returns the model
    itself, so what it replies is unchanged."""

    bound_tools: list[Any] = Field(default_factory=list)

    def bind_tools(
        self,
        tools: Sequence[Any],
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        self.bound_tools.extend(tools)
        return self


class ScriptedChatModel(RecordingChatModel):
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


class SequencedChatModel(RecordingChatModel):
    """Returns ``replies`` in order, one per call, repeating the last one
    once they run out, and records every message list it was sent."""

    replies: list[AIMessage]
    received: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "sequenced"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        self.received.append(list(messages))
        reply = self.replies[min(len(self.received), len(self.replies)) - 1]
        return ChatResult(generations=[ChatGeneration(message=reply.model_copy())])


def calls(*requested: tuple[str, Any]) -> AIMessage:
    """A model message asking for ``(tool name, arguments)`` calls, in order."""
    tool_calls = [
        ToolCall(name=name, args=args, id=f"call_{index}")
        for index, (name, args) in enumerate(requested)
    ]
    return AIMessage(content="", tool_calls=tool_calls)


class RaisingChatModel(RecordingChatModel):
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
