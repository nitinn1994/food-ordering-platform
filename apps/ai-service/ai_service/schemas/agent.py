"""``POST /v1/agent/turns`` request and response (plan.md section 9).

No conversation id (OD4: every turn is independent until memory exists) and
no intent (OD5: intents will be generated from packages/contracts, never
hand-written here).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# Not schemas/errors.py's MAX_MESSAGE_LENGTH, which bounds error messages.
MAX_TURN_MESSAGE_LENGTH = 2000


class AgentTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # At least one non-whitespace character (OD9).
    message: Annotated[
        str, Field(min_length=1, max_length=MAX_TURN_MESSAGE_LENGTH, pattern=r"\S")
    ]


class AgentTurnResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: str
