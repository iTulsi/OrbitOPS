import sys
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from config import (  # noqa: E402
    ConfigurationError,
    DEVELOPMENT_CORS_ORIGINS,
    DEVELOPMENT_SECRET_KEY,
    load_settings,
)


def production_environment(**overrides):
    environment = {
        "ORBITOPS_ENV": "production",
        "SECRET_KEY": "a-production-secret-key-with-at-least-32-characters",
        "CORS_ALLOWED_ORIGINS": "https://orbitops.example",
    }
    environment.update(overrides)
    return environment


def test_development_defaults_are_safe_and_usable():
    settings = load_settings({})

    assert settings.environment == "development"
    assert settings.is_production is False
    assert settings.secret_key == DEVELOPMENT_SECRET_KEY
    assert settings.cors_origins == DEVELOPMENT_CORS_ORIGINS


def test_explicit_test_environment_uses_development_defaults():
    settings = load_settings({"ORBITOPS_ENV": "test"})

    assert settings.environment == "test"
    assert settings.is_production is False
    assert settings.secret_key == DEVELOPMENT_SECRET_KEY


@pytest.mark.parametrize(
    "marker",
    [
        {"RENDER": "true"},
        {"VERCEL": "1"},
    ],
)
def test_platform_markers_enable_production_validation(marker):
    marker["CORS_ALLOWED_ORIGINS"] = "https://orbitops.example"

    with pytest.raises(
        ConfigurationError,
        match="SECRET_KEY is required",
    ):
        load_settings(marker)


def test_production_requires_secret_key():
    environment = production_environment()
    environment.pop("SECRET_KEY")

    with pytest.raises(
        ConfigurationError,
        match="SECRET_KEY is required",
    ):
        load_settings(environment)


def test_production_rejects_development_secret_key():
    with pytest.raises(
        ConfigurationError,
        match="development SECRET_KEY",
    ):
        load_settings(
            production_environment(
                SECRET_KEY=DEVELOPMENT_SECRET_KEY,
            )
        )


def test_production_rejects_short_secret_key():
    with pytest.raises(
        ConfigurationError,
        match="at least 32 characters",
    ):
        load_settings(
            production_environment(
                SECRET_KEY="too-short",
            )
        )


def test_production_requires_explicit_cors_origins():
    environment = production_environment()
    environment.pop("CORS_ALLOWED_ORIGINS")

    with pytest.raises(
        ConfigurationError,
        match="CORS_ALLOWED_ORIGINS is required",
    ):
        load_settings(environment)


def test_production_rejects_wildcard_cors():
    with pytest.raises(
        ConfigurationError,
        match="Wildcard CORS",
    ):
        load_settings(
            production_environment(
                CORS_ALLOWED_ORIGINS="*",
            )
        )


def test_production_accepts_multiple_valid_origins():
    settings = load_settings(
        production_environment(
            CORS_ALLOWED_ORIGINS=(
                "https://orbitops.example,"
                "https://dashboard.orbitops.example/"
            )
        )
    )

    assert settings.is_production is True
    assert settings.cors_origins == (
        "https://orbitops.example",
        "https://dashboard.orbitops.example",
    )


@pytest.mark.parametrize(
    "origin",
    [
        "orbitops.example",
        "ftp://orbitops.example",
        "https://orbitops.example/private",
        "https://user:password@orbitops.example",
        "https://orbitops.example?debug=true",
    ],
)
def test_invalid_cors_origins_are_rejected(origin):
    with pytest.raises(ConfigurationError):
        load_settings(
            production_environment(
                CORS_ALLOWED_ORIGINS=origin,
            )
        )


def test_unknown_environment_name_is_rejected():
    with pytest.raises(
        ConfigurationError,
        match="ORBITOPS_ENV must be one of",
    ):
        load_settings({"ORBITOPS_ENV": "banana"})
