"""Process entry point: ``python -m ai_service [--reload]``.

Order matters: configuration is validated before uvicorn is started, so an
invalid environment exits non-zero without ever binding a port (AC4).
"""

import argparse
import sys

import uvicorn

from ai_service.config import ConfigError, load_settings
from ai_service.core.logging import configure_logging


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_service")
    parser.add_argument(
        "--reload", action="store_true", help="restart on code changes (dev only)"
    )
    args = parser.parse_args(argv)

    try:
        settings = load_settings()
    except ConfigError as error:
        # No logging is configured yet at this point; the message names
        # fields only, never values.
        print(error, file=sys.stderr)
        return 1

    configure_logging(settings)
    uvicorn.run(
        "ai_service.main:app_from_environment",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=args.reload,
        # Uvicorn's access log prints the query string; this service logs
        # its own redacted completion line instead (plan.md section 12).
        access_log=False,
        log_config=None,
        # Phase 18 (plan.md AC14): no "server: uvicorn" banner; in-flight
        # requests get a bounded drain on shutdown; and X-Forwarded-* is
        # believed only from configured proxies - uvicorn's own default
        # trusts 127.0.0.1, which is apps/web on a shared host.
        server_header=False,
        timeout_graceful_shutdown=settings.shutdown_timeout_seconds,
        proxy_headers=bool(settings.forwarded_allow_ips),
        forwarded_allow_ips=settings.forwarded_allow_ips or None,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
