"""Structured logging setup for RuangKerja backend."""

from __future__ import annotations

import logging
import sys


def configure_logging(env: str = "development") -> None:
    """Configure root and application loggers with a clean format."""
    level = logging.DEBUG if env == "development" else logging.INFO
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Keep noisy third-party loggers reasonable
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("PIL").setLevel(logging.WARNING)

