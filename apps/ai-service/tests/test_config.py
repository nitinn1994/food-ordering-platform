import pytest
from pydantic import ValidationError

from ai_service.config import ConfigError, Settings, load_settings

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
