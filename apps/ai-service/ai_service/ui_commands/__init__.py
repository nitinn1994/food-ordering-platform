"""Presentation tools: how the agent asks apps/web to change what is on
screen (Phase 15 plan.md sections 6, 9 and 13; OD3).

A second allowlist, separate from the Commerce tools in ``ai_service/tools/``.
Calling a presentation tool performs no I/O and changes no state anywhere. It
validates the arguments against the generated ``@contracts/ui-commands``
model and records one UI command, which reaches apps/web in the turn's
response, after every commerce write in the turn has resolved.

None of these tools can reach commerce-api: this package imports neither the
Commerce client nor the Commerce tool registry (tests/test_boundaries.py).
"""

from ai_service.ui_commands.registry import (
    PresentationToolDefinition,
    build_presentation_registry,
)
from ai_service.ui_commands.service import (
    PresentationResult,
    PresentationToolService,
    UiCommandModel,
    build_batch,
)

__all__ = [
    "PresentationResult",
    "PresentationToolDefinition",
    "PresentationToolService",
    "UiCommandModel",
    "build_batch",
    "build_presentation_registry",
]
