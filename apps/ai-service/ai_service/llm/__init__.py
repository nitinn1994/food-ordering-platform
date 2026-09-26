"""The model boundary.

The only package where model-provider code may live (ADR-0019); nothing else
imports a provider SDK, and tests/test_boundaries.py confines langchain_core
to here and ``agents/``. The interface is LangChain's ``BaseChatModel``, not a
hand-written protocol (plan.md section 10, OD2).

``build_chat_model`` is the one place a model is chosen. Phase 13 has no
provider, so it returns the deterministic ``SimulatedChatModel``. The phase
that adds a provider replaces its body and gives it a ``Settings`` parameter.
"""

from langchain_core.language_models import BaseChatModel

from ai_service.llm.simulated import SimulatedChatModel


def build_chat_model() -> BaseChatModel:
    return SimulatedChatModel()
