from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests
from skyfield.api import EarthSatellite, load, wgs84

CELESTRAK_SOURCES = {
    "active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=TLE",
    "cosmos-1408-debris": (
        "https://celestrak.org/NORAD/elements/"
        "gp.php?GROUP=COSMOS-1408-DEBRIS&FORMAT=TLE"
    ),
    "iridium-33-debris": (
        "https://celestrak.org/NORAD/elements/"
        "gp.php?GROUP=IRIDIUM-33-DEBRIS&FORMAT=TLE"
    ),
}

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
TLE_CACHE_PATH = DATA_DIR / "celestrak.tle"
META_CACHE_PATH = DATA_DIR / "celestrak_meta.json"

SOURCE_REFRESH_SECONDS = int(os.getenv("CELESTRAK_REFRESH_SECONDS", "7200"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("CELESTRAK_TIMEOUT_SECONDS", "20"))
MAX_OBJECTS = int(os.getenv("ORBITOPS_MAX_OBJECTS", "2500"))

_TIMESCALE = load.timescale()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime | None = None) -> str:
    current = value or _utc_now()
    return current.isoformat().replace("+00:00", "Z")


def _read_metadata() -> dict[str, Any]:
    try:
        return json.loads(META_CACHE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _cache_is_fresh() -> bool:
    if not TLE_CACHE_PATH.exists():
        return False

    age_seconds = time.time() - TLE_CACHE_PATH.stat().st_mtime
    return age_seconds < SOURCE_REFRESH_SECONDS


def _looks_like_tle(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    if len(lines) < 3:
        return False

    valid_pairs = 0
    for index in range(len(lines) - 2):
        if lines[index + 1].startswith("1 ") and lines[index + 2].startswith("2 "):
            valid_pairs += 1
            if valid_pairs >= 2:
                return True

    return False


def _download_source(name: str, url: str) -> str:
    headers = {
        "User-Agent": (
            "OrbitOPS/1.0 "
            "(educational satellite-monitoring project; "
            "contact: tulsitomar2019@gmail.com)"
        ),
        "Accept": "text/plain",
    }

    last_error: Exception | None = None

    for attempt in range(1, 4):
        try:
            response = requests.get(
                url,
                headers=headers,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()

            text = response.text.strip()
            if not _looks_like_tle(text):
                raise ValueError(f"{name} returned invalid TLE data")

            return text

        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))

    raise RuntimeError(f"Unable to download {name}: {last_error}")


def _write_cache(tle_text: str, source_names: list[str]) -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    fetched_at = _iso_utc()
    TLE_CACHE_PATH.write_text(tle_text.rstrip() + "\n", encoding="utf-8")

    metadata = {
        "source_name": "CelesTrak",
        "source_format": "TLE/GP",
        "last_successful_fetch": fetched_at,
        "source_groups": source_names,
    }
    META_CACHE_PATH.write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return metadata


def fetch_tle_data(force_refresh: bool = False) -> tuple[str, dict[str, Any]]:
    """
    Return real CelesTrak TLE data.

    Network data is refreshed at most once every two hours by default.
    If CelesTrak is temporarily unavailable, the latest real cached data is used.
    No synthetic or randomly generated orbital objects are returned.
    """
    metadata = _read_metadata()

    if not force_refresh and _cache_is_fresh():
        return TLE_CACHE_PATH.read_text(encoding="utf-8"), {
            **metadata,
            "using_cache": True,
            "source_status": "cached-fresh",
        }

    successful_payloads: list[str] = []
    successful_sources: list[str] = []
    errors: list[str] = []

    for name, url in CELESTRAK_SOURCES.items():
        try:
            successful_payloads.append(_download_source(name, url))
            successful_sources.append(name)
        except RuntimeError as exc:
            errors.append(str(exc))

    if successful_payloads:
        combined = "\n".join(successful_payloads)
        metadata = _write_cache(combined, successful_sources)

        return combined, {
            **metadata,
            "using_cache": False,
            "source_status": "live" if not errors else "partial-live",
            "source_errors": errors,
        }

    if TLE_CACHE_PATH.exists():
        return TLE_CACHE_PATH.read_text(encoding="utf-8"), {
            **metadata,
            "using_cache": True,
            "source_status": "stale",
            "source_errors": errors,
        }

    raise RuntimeError(
        "CelesTrak is unavailable and OrbitOPS has no real cached dataset yet. "
        + " | ".join(errors)
    )


def _classify_object(name: str) -> str:
    upper_name = name.upper()

    if "DEB" in upper_name or "DEBRIS" in upper_name:
        return "DEBRIS"
    if "R/B" in upper_name or "ROCKET" in upper_name:
        return "ROCKET_BODY"
    return "SATELLITE"


def _tle_triplets(tle_text: str):
    lines = [line.strip() for line in tle_text.splitlines() if line.strip()]
    index = 0

    while index + 2 < len(lines):
        name, line1, line2 = lines[index : index + 3]

        if line1.startswith("1 ") and line2.startswith("2 "):
            yield name, line1, line2
            index += 3
        else:
            index += 1


def parse_and_propagate(
    tle_text: str,
    max_objects: int = MAX_OBJECTS,
) -> tuple[list[dict[str, Any]], str]:
    """
    Propagate CelesTrak element sets to the current UTC time with SGP4.

    Skyfield's EarthSatellite class runs the SGP4 model internally.
    """
    current_time = _TIMESCALE.now()
    position_timestamp = current_time.utc_strftime("%Y-%m-%dT%H:%M:%SZ")

    objects: list[dict[str, Any]] = []
    seen_catalog_numbers: set[int] = set()

    for name, line1, line2 in _tle_triplets(tle_text):
        if len(objects) >= max_objects:
            break

        try:
            satellite = EarthSatellite(line1, line2, name, _TIMESCALE)
            catalog_number = int(satellite.model.satnum)

            if catalog_number in seen_catalog_numbers:
                continue

            geocentric = satellite.at(current_time)
            xyz = geocentric.xyz.km
            velocity_vector = geocentric.velocity.km_per_s

            if not np.isfinite(xyz).all() or not np.isfinite(velocity_vector).all():
                continue

            latitude, longitude = wgs84.latlon_of(geocentric)
            altitude = wgs84.height_of(geocentric).km
            velocity = float(np.linalg.norm(velocity_vector))

            if not all(
                math.isfinite(value)
                for value in (
                    latitude.degrees,
                    longitude.degrees,
                    altitude,
                    velocity,
                )
            ):
                continue

            objects.append(
                {
                    "id": str(catalog_number),
                    "norad_id": catalog_number,
                    "name": name,
                    "type": _classify_object(name),
                    "lat": round(float(latitude.degrees), 6),
                    "lon": round(float(longitude.degrees), 6),
                    "altitude_km": round(float(altitude), 3),
                    "velocity_km_s": round(velocity, 5),
                    "element_epoch": satellite.epoch.utc_strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),
                    "position_timestamp": position_timestamp,
                    "element_source": "CelesTrak",
                    "propagator": "SGP4",
                    "data_mode": "live-propagated",
                }
            )
            seen_catalog_numbers.add(catalog_number)

        except (ValueError, TypeError, OverflowError):
            continue

    if not objects:
        raise RuntimeError("No valid satellites could be propagated from CelesTrak data")

    return objects, position_timestamp


def get_orbital_data(force_refresh: bool = False) -> dict[str, Any]:
    tle_text, source_metadata = fetch_tle_data(force_refresh=force_refresh)
    objects, position_timestamp = parse_and_propagate(tle_text)

    return {
        "objects": objects,
        "source": "celestrak",
        "source_name": "CelesTrak",
        "source_format": "TLE/GP",
        "propagator": "SGP4",
        "data_mode": "live-propagated",
        "position_timestamp": position_timestamp,
        **source_metadata,
    }
