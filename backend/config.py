"""Validated runtime configuration for OrbitOPS.

This module has no Flask dependencies. It translates environment variables into
one immutable settings object and rejects unsafe production configuration before
the application begins serving requests.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit


DEVELOPMENT_SECRET_KEY = "orbitops-dev-secret"

DEVELOPMENT_CORS_ORIGINS = (
    "http://localhost:5050",
    "http://localhost:5173",
)

_ENVIRONMENT_ALIASES = {
    "dev": "development",
    "development": "development",
    "test": "test",
    "testing": "test",
    "prod": "production",
    "production": "production",
}

_TRUTHY_VALUES = frozenset({"1", "true", "yes", "on"})


class ConfigurationError(RuntimeError):
    """Raised when OrbitOPS configuration is invalid or unsafe."""


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str
    secret_key: str
    cors_origins: tuple[str, ...]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in _TRUTHY_VALUES


def _detect_environment(environ: Mapping[str, str]) -> str:
    explicit_environment = str(environ.get("ORBITOPS_ENV", "")).strip().lower()

    if explicit_environment:
        try:
            return _ENVIRONMENT_ALIASES[explicit_environment]
        except KeyError as exc:
            supported = ", ".join(sorted(_ENVIRONMENT_ALIASES))
            raise ConfigurationError(
                "ORBITOPS_ENV must be one of: "
                f"{supported}. Received {explicit_environment!r}."
            ) from exc

    # Render and Vercel provide these markers automatically. Preview and
    # serverless deployments still need production-safe configuration.
    if _is_truthy(environ.get("RENDER")) or _is_truthy(environ.get("VERCEL")):
        return "production"

    return "development"


def _validate_origin(origin: str) -> str:
    if origin == "*":
        return origin

    parsed = urlsplit(origin)

    if parsed.scheme not in {"http", "https"}:
        raise ConfigurationError(
            f"CORS origin {origin!r} must use http:// or https://."
        )

    if not parsed.netloc or parsed.hostname is None:
        raise ConfigurationError(
            f"CORS origin {origin!r} must include a valid hostname."
        )

    if parsed.username is not None or parsed.password is not None:
        raise ConfigurationError(
            f"CORS origin {origin!r} must not contain credentials."
        )

    try:
        parsed.port
    except ValueError as exc:
        raise ConfigurationError(
            f"CORS origin {origin!r} contains an invalid port."
        ) from exc

    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ConfigurationError(
            f"CORS origin {origin!r} must be an origin without a path, "
            "query, or fragment."
        )

    return f"{parsed.scheme}://{parsed.netloc}"


def _parse_cors_origins(
    environ: Mapping[str, str],
    *,
    is_production: bool,
) -> tuple[str, ...]:
    raw_origins = (
        environ.get("CORS_ALLOWED_ORIGINS")
        or environ.get("CORS_ORIGINS")
        or ""
    ).strip()

    if not raw_origins:
        if is_production:
            raise ConfigurationError(
                "CORS_ALLOWED_ORIGINS is required in production."
            )
        return DEVELOPMENT_CORS_ORIGINS

    origins = tuple(
        dict.fromkeys(
            _validate_origin(origin.strip())
            for origin in raw_origins.split(",")
            if origin.strip()
        )
    )

    if not origins:
        raise ConfigurationError(
            "CORS_ALLOWED_ORIGINS must contain at least one origin."
        )

    if is_production and "*" in origins:
        raise ConfigurationError(
            "Wildcard CORS is not allowed in production."
        )

    return origins


def _load_secret_key(
    environ: Mapping[str, str],
    *,
    is_production: bool,
) -> str:
    configured_secret = str(environ.get("SECRET_KEY", ""))

    if not is_production:
        return configured_secret or DEVELOPMENT_SECRET_KEY

    if not configured_secret.strip():
        raise ConfigurationError(
            "SECRET_KEY is required in production."
        )

    if configured_secret == DEVELOPMENT_SECRET_KEY:
        raise ConfigurationError(
            "The development SECRET_KEY cannot be used in production."
        )

    if len(configured_secret) < 32:
        raise ConfigurationError(
            "Production SECRET_KEY must contain at least 32 characters."
        )

    return configured_secret


def load_settings(
    environ: Mapping[str, str] | None = None,
) -> Settings:
    """Load and validate settings from an environment mapping."""

    source = os.environ if environ is None else environ
    environment = _detect_environment(source)
    is_production = environment == "production"

    return Settings(
        environment=environment,
        secret_key=_load_secret_key(
            source,
            is_production=is_production,
        ),
        cors_origins=_parse_cors_origins(
            source,
            is_production=is_production,
        ),
    )
