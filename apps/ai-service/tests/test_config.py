import pytest
from pydantic import ValidationError

from ai_service.config import (
    DEV_COMMERCE_API_URL,
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
        commerce_api_url=DEV_COMMERCE_API_URL,
        commerce_api_timeout_seconds=3.0,
    )


def test_reads_every_variable() -> None:
    settings = load_settings(
        {
            "APP_ENV": "production",
            "HOST": "0.0.0.0",  # noqa: S104 - a value under test, not a bind
            "PORT": "8080",
            "LOG_LEVEL": "DEBUG",
            "LOG_FORMAT": "pretty",
            "COMMERCE_API_URL": "https://commerce.internal:8443",
            "COMMERCE_API_TIMEOUT_SECONDS": "1.5",
        }
    )

    assert settings.app_env == "production"
    assert settings.host == "0.0.0.0"  # noqa: S104
    assert settings.port == 8080
    assert settings.log_level == "DEBUG"
    assert settings.log_format == "pretty"
    assert settings.commerce_api_url == "https://commerce.internal:8443"
    assert settings.commerce_api_timeout_seconds == 1.5


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
        ("COMMERCE_API_TIMEOUT_SECONDS", "abc"),
        ("COMMERCE_API_TIMEOUT_SECONDS", "0"),
        ("COMMERCE_API_TIMEOUT_SECONDS", "31"),
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


# Phase 14: the Commerce API base URL (plan.md section 26, AC4).


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("http://127.0.0.1:3001", "http://127.0.0.1:3001"),
        ("http://127.0.0.1:3001/", "http://127.0.0.1:3001"),
        ("https://commerce.internal", "https://commerce.internal"),
        ("  http://localhost:3001  ", "http://localhost:3001"),
        ("", DEV_COMMERCE_API_URL),
    ],
)
def test_commerce_api_url_is_normalised(value: str, expected: str) -> None:
    settings = load_settings({"COMMERCE_API_URL": value})

    assert settings.commerce_api_url == expected


@pytest.mark.parametrize(
    ("value", "error_type"),
    [
        ("ftp://commerce", "url_scheme_not_http"),
        ("commerce:3001", "url_scheme_not_http"),
        ("http://", "url_host_missing"),
        ("http://user:pass@commerce", "url_userinfo_not_allowed"),
        ("http://user@commerce", "url_userinfo_not_allowed"),
        ("http://commerce/v1", "url_has_extra_parts"),
        ("http://commerce?x=1", "url_has_extra_parts"),
        ("http://commerce#frag", "url_has_extra_parts"),
        ("http://commerce:port", "invalid_url"),
    ],
)
def test_invalid_commerce_api_url_is_refused(value: str, error_type: str) -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({"COMMERCE_API_URL": value})

    assert caught.value.field_errors == [f"COMMERCE_API_URL ({error_type})"]


def test_commerce_api_url_is_required_in_production() -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings({"APP_ENV": "production"})

    assert caught.value.field_errors == ["COMMERCE_API_URL (required_in_production)"]


def test_commerce_api_url_error_never_contains_the_value() -> None:
    value = f"ftp://{SENTINEL}:{SENTINEL}@host/{SENTINEL}"

    with pytest.raises(ConfigError) as caught:
        load_settings({"COMMERCE_API_URL": value})

    assert SENTINEL not in str(caught.value)
    assert SENTINEL not in repr(caught.value)
