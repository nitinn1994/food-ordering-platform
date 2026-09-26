"""This service's entire environment configuration, in one place.

Parsed once, in ``__main__``, before the server starts: an invalid value must
stop the process before it binds a port, not surface on whichever request
first needs it (requirements.md AC4). Mirrors commerce-api's
``src/config/env.schema.ts``.

Only variables this phase actually reads live here. A future secret (for
example a model provider's API key) must be typed ``pydantic.SecretStr`` so its
``repr``/``str`` are masked, and must never appear in a log line or an error
message (ADR-0019).
"""

import os
from collections.abc import Mapping
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

AppEnv = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
LogFormat = Literal["json", "pretty"]


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    app_env: AppEnv = "development"
    # Loopback by default, like commerce-api and apps/web (ADR-0018, S2).
    host: Annotated[str, Field(min_length=1)] = "127.0.0.1"
    # web is 3000, commerce-api is 3001 (plan.md OD14).
    port: Annotated[int, Field(ge=1, le=65535)] = 3002
    log_level: LogLevel = "INFO"
    # "pretty" is for local reading only; production and test use "json".
    log_format: LogFormat = "json"


class ConfigError(Exception):
    """Raised by ``load_settings`` on any invalid value.

    ``field_errors`` names the environment variable and the failure kind
    only - never the offending value - so the message is safe to print on
    process exit and to log.
    """

    def __init__(self, field_errors: list[str]) -> None:
        self.field_errors = field_errors
        super().__init__(
            "Invalid environment configuration: " + "; ".join(field_errors)
        )


def load_settings(environ: Mapping[str, str] | None = None) -> Settings:
    source = os.environ if environ is None else environ
    # Read only this service's own variables; everything else in the
    # environment is ignored.
    values = {
        name: source[name.upper()]
        for name in Settings.model_fields
        if name.upper() in source
    }
    try:
        return Settings.model_validate(values)
    except ValidationError as error:
        # include_input=False: Pydantic's default messages echo the rejected
        # value, which is exactly what must not be printed (AC4).
        field_errors = [
            f"{_env_name(issue['loc'])} ({issue['type']})"
            for issue in error.errors(include_input=False, include_url=False)
        ]
        raise ConfigError(field_errors) from None


def _env_name(loc: tuple[int | str, ...]) -> str:
    return str(loc[0]).upper() if loc else "(root)"
