"""The deterministic chat model Phase 13 runs on.

The project is simulation-first (CLAUDE.md): there is no model provider yet.
This model implements LangChain's ``BaseChatModel``, so the graph runs
exactly as it will with a real provider, and the tests run with no key and no
network (plan.md section 10).

It returns the same honest reply whatever it is sent. It never echoes the
customer's text and never claims to have changed a cart.
"""

from typing import Any

from langchain_core.callbacks import (
    AsyncCallbackManagerForLLMRun,
    CallbackManagerForLLMRun,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

SIMULATED_REPLY = (
    "Ordering by chat isn't available yet. You can browse the menu and add "
    "items to your cart directly."
)


class SimulatedChatModel(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "simulated"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return _simulated_result()

    # Overridden so an async caller is not sent to a worker thread for a
    # constant (BaseChatModel's default runs _generate in an executor).
    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return _simulated_result()


def _simulated_result() -> ChatResult:
    return ChatResult(
        generations=[ChatGeneration(message=AIMessage(content=SIMULATED_REPLY))]
    )
