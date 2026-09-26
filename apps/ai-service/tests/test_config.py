import pytest
from pydantic import ValidationError

from ai_service.config import (
    TRACING_VARIABLES,
    ConfigError,
    Settings,
    ensure_tracing_disabled,
    load_settings,
)

SENTINEL = "SENTINEL_VALUE_9f2c"


def test_defaults_with_empty_environment() -> None:
    settings = load_settings({})

    assert settings == Settings(
        app_env="development",
        host="127.0.0.1",
        port=3002,
        log_level="INFO",
        log_format="json",
    )


def test_reads_every_variable() -> None:
    settings = load_settings(
        {
            "APP_ENV": "production",
            "HOST": "0.0.0.0",  # noqa: S104 - a value under test, not a bind
            "PORT": "8080",
            "LOG_LEVEL": "DEBUG",
            "LOG_FORMAT": "pretty",
        }
    )

    assert settings.app_env == "production"
    assert settings.host == "0.0.0.0"  # noqa: S104
    assert settings.port == 8080
    assert settings.log_level == "DEBUG"
    assert settings.log_format == "pretty"


def test_unrelated_environment_variables_are_ignored() -> None:
    settings = load_settings({"PATH": "/usr/bin", "DATABASE_URL": "postgres://x"})

    assert settings.port == 3002


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("APP_ENV", "staging"),
        ("HOST", ""),
        ("PORT", "abc"),
        ("PORT", "0"),
        ("PORT", "65536"),
        ("LOG_LEVEL", "log"),
        ("LOG_FORMAT", "xml"),
    ],
)
def test_invalid_value_names_the_field(name: str, value: str) -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({name: value})

    assert caught.value.field_errors[0].startswith(f"{name} (")


@pytest.mark.parametrize("name", ["APP_ENV", "PORT", "LOG_LEVEL", "LOG_FORMAT"])
def test_error_message_never_contains_the_value(name: str) -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({name: SENTINEL})

    assert SENTINEL not in str(caught.value)
    assert SENTINEL not in repr(caught.value)
    assert all(SENTINEL not in e for e in caught.value.field_errors)


def test_reports_every_failing_field() -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({"PORT": "abc", "APP_ENV": "staging"})

    assert {e.split(" ")[0] for e in caught.value.field_errors} == {
        "PORT",
        "APP_ENV",
    }


def test_settings_are_frozen() -> None:
    settings = load_settings({})

    with pytest.raises(ValidationError):
        settings.port = 1  # type: ignore[misc]


@pytest.mark.parametrize("name", TRACING_VARIABLES)
@pytest.mark.parametrize("value", ["true", "1", "yes", "FALSE", " ", SENTINEL])
def test_tracing_switched_on_is_refused(name: str, value: str) -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({name: value})

    assert caught.value.field_errors == [f"{name} (tracing_not_allowed)"]


@pytest.mark.parametrize("name", TRACING_VARIABLES)
@pytest.mark.parametrize("value", ["", "0", "false", "False"])
def test_tracing_switched_off_is_accepted(name: str, value: str) -> None:
    assert load_settings({name: value}) == load_settings({})


def test_tracing_value_is_never_printed() -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({"LANGSMITH_TRACING": SENTINEL})

    assert SENTINEL not in str(caught.value)
    assert SENTINEL not in repr(caught.value)


def test_tracing_and_field_errors_are_reported_together() -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({"LANGCHAIN_TRACING_V2": "true", "PORT": "abc"})

    assert caught.value.field_errors == [
        "LANGCHAIN_TRACING_V2 (tracing_not_allowed)",
        "PORT (int_parsing)",
    ]


def test_ensure_tracing_disabled_accepts_an_environment_without_tracing() -> None:
    ensure_tracing_disabled({"LANGSMITH_TRACING": "false", "PORT": "abc"})


def test_ensure_tracing_disabled_refuses_and_never_prints_the_value() -> None:
    with pytest.raises(ConfigError) as caught:
        ensure_tracing_disabled({"LANGCHAIN_TRACING_V2": SENTINEL})

    assert caught.value.field_errors == ["LANGCHAIN_TRACING_V2 (tracing_not_allowed)"]
    assert SENTINEL not in str(caught.value)
