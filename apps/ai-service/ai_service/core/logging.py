"""Structured logging: stdlib ``logging`` plus one JSON formatter.

One JSON object per line on stdout. Every record written while a request is
in flight carries that request's ``request_id`` and ``correlation_id``
automatically (``ContextFilter``), so call sites never pass them - the
Python counterpart of commerce-api's AppLogger + AsyncLocalStorage.

Structured data goes in ``extra={"fields": {...}}``; nothing else a caller
attaches to a record is emitted. Never log request/response headers, bodies,
query strings, configuration values, or (in future) prompts and completions
unless explicitly approved (plan.md section 12).
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import IO, Any

from ai_service.config import Settings
from ai_service.core.request_context import correlation_id_var, request_id_var

# Uvicorn's own loggers are routed through the root handler (``log_config``
# is None in __main__). Its access logger stays silent: it would print the
# query string, and __main__ passes access_log=False anyway.
_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")
# HTTP client loggers print every full request URL, query string included, at
# INFO (ADR-0019). httpx is a runtime dependency through langchain-core, and
# httpx2/httpcore2 through langsmith; the service makes no call with them, but
# anything that ever does must not log URLs.
_HTTP_CLIENT_LOGGERS = ("httpx", "httpcore", "httpx2", "httpcore2")


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.correlation_id = correlation_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id is not None:
            entry["request_id"] = request_id
            entry["correlation_id"] = getattr(record, "correlation_id", None)
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            entry.update(fields)
        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


class PrettyFormatter(logging.Formatter):
    """For local reading only (LOG_FORMAT=pretty)."""

    def format(self, record: logging.LogRecord) -> str:
        line = (
            f"{datetime.fromtimestamp(record.created, UTC).isoformat()} "
            f"{record.levelname:<8} {record.name}: {record.getMessage()}"
        )
        request_id = getattr(record, "request_id", None)
        if request_id is not None:
            line += f" [request_id={request_id}]"
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            line += " " + " ".join(f"{k}={v}" for k, v in fields.items())
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_logging(settings: Settings, stream: IO[str] | None = None) -> None:
    """Replace the root logger's handlers. Safe to call more than once (the
    ``--reload`` worker process calls it again)."""
    handler = logging.StreamHandler(stream if stream is not None else sys.stdout)
    handler.addFilter(ContextFilter())
    handler.setFormatter(
        JsonFormatter() if settings.log_format == "json" else PrettyFormatter()
    )

    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    for name in _UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = name != "uvicorn.access"

    for name in _HTTP_CLIENT_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
