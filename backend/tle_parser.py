from __future__ import annotations

import json
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests
from skyfield.api import EarthSatellite, load, wgs84

# Modern CelesTrak OMM JSON sources. The categories are intentionally sampled
# separately so a large active-satellite set cannot hide debris or rocket bodies.
CELESTRAK_SOURCES: dict[str, dict[str, Any]] = {
    "active": {
        "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON",
        "forced_type": None,
        "weight": 0.48,
    },
    "rocket-bodies": {
        "url": "https://celestrak.org/NORAD/elements/gp.php?NAME=R%2FB&FORMAT=JSON",
        "forced_type": "ROCKET_BODY",
        "weight": 0.12,
    },
    "fengyun-1c-debris": {
        "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=FENGYUN-1C-DEBRIS&FORMAT=JSON",
        "forced_type": "DEBRIS",
        "weight": 0.16,
    },
    "iridium-33-debris": {
        "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=IRIDIUM-33-DEBRIS&FORMAT=JSON",
        "forced_type": "DEBRIS",
        "weight": 0.12,
    },
    "cosmos-2251-debris": {
        "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=COSMOS-2251-DEBRIS&FORMAT=JSON",
        "forced_type": "DEBRIS",
        "weight": 0.12,
    },
}

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "celestrak_omm"
META_CACHE_PATH = CACHE_DIR / "metadata.json"
SNAPSHOT_CACHE_PATH = DATA_DIR / "live_orbit_snapshot.json"

SOURCE_REFRESH_SECONDS = int(os.getenv("CELESTRAK_REFRESH_SECONDS", "7200"))
POSITION_REFRESH_SECONDS = int(os.getenv("ORBITOPS_POSITION_REFRESH_SECONDS", "60"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("CELESTRAK_TIMEOUT_SECONDS", "9"))
REQUEST_RETRIES = int(os.getenv("CELESTRAK_REQUEST_RETRIES", "2"))
MAX_OBJECTS = int(os.getenv("ORBITOPS_MAX_OBJECTS", "2500"))
PREVIEW_OBJECTS = int(os.getenv("ORBITOPS_PREVIEW_OBJECTS", "450"))
DOWNLOAD_WORKERS = max(1, min(int(os.getenv("CELESTRAK_DOWNLOAD_WORKERS", "5")), 8))

_TIMESCALE = load.timescale()
_STATE_LOCK = threading.RLock()
_REFRESH_THREAD: threading.Thread | None = None
_LAST_REFRESH_ERROR: str | None = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime | None = None) -> str:
    current = value or _utc_now()
    return current.isoformat().replace("+00:00", "Z")


def _parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _cache_path(source_name: str) -> Path:
    return CACHE_DIR / f"{source_name}.json"


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def _write_json_atomic(path: Path, payload: Any, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(payload, separators=(",", ":") if indent is None else None, indent=indent),
        encoding="utf-8",
    )
    temporary_path.replace(path)


def _read_metadata() -> dict[str, Any]:
    payload = _read_json(META_CACHE_PATH, {})
    return payload if isinstance(payload, dict) else {}


def _cache_is_fresh() -> bool:
    if not META_CACHE_PATH.exists():
        return False
    if not all(_cache_path(name).exists() for name in CELESTRAK_SOURCES):
        return False
    age_seconds = time.time() - META_CACHE_PATH.stat().st_mtime
    return age_seconds < SOURCE_REFRESH_SECONDS


def _read_cached_source(source_name: str) -> list[dict[str, Any]]:
    payload = _read_json(_cache_path(source_name), [])
    if not isinstance(payload, list):
        return []
    return [record for record in payload if isinstance(record, dict)]


def _write_cached_source(source_name: str, records: list[dict[str, Any]]) -> None:
    _write_json_atomic(_cache_path(source_name), records)


def _download_source(source_name: str, url: str) -> list[dict[str, Any]]:
    headers = {
        "User-Agent": (
            "OrbitOPS/3.0 (educational orbital-monitoring project; "
            "contact: tulsitomar2019@gmail.com)"
        ),
        "Accept": "application/json",
    }

    last_error: Exception | None = None
    for attempt in range(1, REQUEST_RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list) or not payload:
                raise ValueError(f"{source_name} returned no OMM records")
            records = [record for record in payload if isinstance(record, dict)]
            if not records:
                raise ValueError(f"{source_name} returned invalid OMM JSON")
            return records
        except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < REQUEST_RETRIES:
                time.sleep(0.75 * attempt)

    raise RuntimeError(f"Unable to download {source_name}: {last_error}")


def _download_sources_parallel() -> tuple[
    dict[str, list[dict[str, Any]]], list[str], list[str]
]:
    live_payloads: dict[str, list[dict[str, Any]]] = {}
    live_sources: list[str] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
        futures = {
            executor.submit(_download_source, source_name, config["url"]): source_name
            for source_name, config in CELESTRAK_SOURCES.items()
        }
        for future in as_completed(futures):
            source_name = futures[future]
            try:
                records = future.result()
                live_payloads[source_name] = records
                live_sources.append(source_name)
            except RuntimeError as exc:
                errors.append(str(exc))

    # Preserve source declaration order for deterministic sampling and metadata.
    ordered_payloads = {
        name: live_payloads[name]
        for name in CELESTRAK_SOURCES
        if name in live_payloads
    }
    ordered_live_sources = [name for name in CELESTRAK_SOURCES if name in live_sources]
    return ordered_payloads, ordered_live_sources, errors


def fetch_omm_data(
    force_refresh: bool = False,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    """Load cached OMM elements quickly, refreshing remote sources only when needed."""
    metadata = _read_metadata()

    if not force_refresh and _cache_is_fresh():
        cached_payloads = {
            name: _read_cached_source(name)
            for name in CELESTRAK_SOURCES
        }
        cached_payloads = {
            name: records for name, records in cached_payloads.items() if records
        }
        if cached_payloads:
            return cached_payloads, {
                **metadata,
                "using_cache": True,
                "source_status": "cached-fresh",
                "source_errors": [],
            }

    live_payloads, live_sources, errors = _download_sources_parallel()
    for source_name, records in live_payloads.items():
        _write_cached_source(source_name, records)

    source_payloads: dict[str, list[dict[str, Any]]] = {}
    cached_sources: list[str] = []

    for source_name in CELESTRAK_SOURCES:
        if source_name in live_payloads:
            source_payloads[source_name] = live_payloads[source_name]
            continue
        cached_records = _read_cached_source(source_name)
        if cached_records:
            source_payloads[source_name] = cached_records
            cached_sources.append(source_name)

    if not source_payloads:
        raise RuntimeError(
            "CelesTrak is unavailable and OrbitOPS has no real cached OMM data. "
            + " | ".join(errors)
        )

    fetched_at = _iso_utc() if live_sources else metadata.get("last_successful_fetch")
    source_counts = {name: len(records) for name, records in source_payloads.items()}
    updated_metadata = {
        "source_name": "CelesTrak",
        "source_format": "OMM JSON/GP",
        "last_successful_fetch": fetched_at,
        "source_groups": list(source_payloads.keys()),
        "source_counts": source_counts,
        "live_sources": live_sources,
        "cached_sources": cached_sources,
    }
    _write_json_atomic(META_CACHE_PATH, updated_metadata, indent=2)

    if live_sources and len(live_sources) == len(CELESTRAK_SOURCES):
        source_status = "live"
    elif live_sources:
        source_status = "partial-live"
    else:
        source_status = "stale"

    return source_payloads, {
        **updated_metadata,
        "using_cache": bool(cached_sources) or not live_sources,
        "source_status": source_status,
        "source_errors": errors,
    }


def _normalise_type(record: dict[str, Any], forced_type: str | None) -> str:
    if forced_type:
        return forced_type
    raw_type = str(record.get("OBJECT_TYPE") or "").upper()
    object_name = str(record.get("OBJECT_NAME") or "").upper()
    if "DEBRIS" in raw_type or "DEB" in object_name:
        return "DEBRIS"
    if "ROCKET" in raw_type or "R/B" in object_name:
        return "ROCKET_BODY"
    return "SATELLITE"


def _catalog_id(record: dict[str, Any]) -> str:
    value = record.get("NORAD_CAT_ID")
    if value is None:
        value = record.get("OBJECT_ID") or record.get("OBJECT_NAME")
    return str(value or "").strip()


def _select_evenly(records: list[Any], limit: int) -> list[Any]:
    if limit <= 0 or not records:
        return []
    if len(records) <= limit:
        return list(records)
    step = len(records) / limit
    return [records[min(int(index * step), len(records) - 1)] for index in range(limit)]


def _build_balanced_sample(
    source_payloads: dict[str, list[dict[str, Any]]],
    max_objects: int,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, int]]:
    deduped_by_source: dict[str, list[dict[str, Any]]] = {}
    available_counts = {"SATELLITE": 0, "DEBRIS": 0, "ROCKET_BODY": 0}
    seen_available: set[str] = set()

    for source_name, records in source_payloads.items():
        forced_type = CELESTRAK_SOURCES[source_name]["forced_type"]
        source_records: list[dict[str, Any]] = []
        for record in records:
            catalog_id = _catalog_id(record)
            if not catalog_id or catalog_id in seen_available:
                continue
            seen_available.add(catalog_id)
            available_counts[_normalise_type(record, forced_type)] += 1
            source_records.append(record)
        deduped_by_source[source_name] = source_records

    selected: list[tuple[str, dict[str, Any]]] = []
    selected_ids: set[str] = set()

    for source_name, config in CELESTRAK_SOURCES.items():
        records = deduped_by_source.get(source_name, [])
        quota = max(1, round(max_objects * float(config["weight"])))
        for record in _select_evenly(records, quota):
            catalog_id = _catalog_id(record)
            if catalog_id in selected_ids:
                continue
            selected_ids.add(catalog_id)
            selected.append((source_name, record))

    if len(selected) < max_objects:
        remaining: list[tuple[str, dict[str, Any]]] = []
        for source_name, records in deduped_by_source.items():
            for record in records:
                if _catalog_id(record) not in selected_ids:
                    remaining.append((source_name, record))
        for source_name, record in _select_evenly(remaining, max_objects - len(selected)):
            catalog_id = _catalog_id(record)
            if catalog_id in selected_ids:
                continue
            selected_ids.add(catalog_id)
            selected.append((source_name, record))

    return selected[:max_objects], available_counts


def parse_and_propagate(
    source_payloads: dict[str, list[dict[str, Any]]],
    max_objects: int = MAX_OBJECTS,
) -> tuple[list[dict[str, Any]], str, dict[str, int], dict[str, int]]:
    """Propagate a balanced sample to the current UTC time."""
    if not hasattr(EarthSatellite, "from_omm"):
        raise RuntimeError(
            "OrbitOPS OMM support requires skyfield>=1.49. "
            "Run: python3 -m pip install --upgrade 'skyfield>=1.49'"
        )

    current_time = _TIMESCALE.now()
    position_timestamp = current_time.utc_strftime("%Y-%m-%dT%H:%M:%SZ")
    sampled_records, available_counts = _build_balanced_sample(
        source_payloads,
        max_objects=max_objects,
    )

    objects: list[dict[str, Any]] = []
    propagated_counts = {"SATELLITE": 0, "DEBRIS": 0, "ROCKET_BODY": 0}

    for source_name, record in sampled_records:
        try:
            satellite = EarthSatellite.from_omm(_TIMESCALE, record)
            geocentric = satellite.at(current_time)
            xyz = geocentric.xyz.km
            velocity_vector = geocentric.velocity.km_per_s
            if not np.isfinite(xyz).all() or not np.isfinite(velocity_vector).all():
                continue

            latitude, longitude = wgs84.latlon_of(geocentric)
            altitude = wgs84.height_of(geocentric).km
            velocity = float(np.linalg.norm(velocity_vector))
            values = (latitude.degrees, longitude.degrees, altitude, velocity)
            if not all(math.isfinite(float(value)) for value in values):
                continue

            forced_type = CELESTRAK_SOURCES[source_name]["forced_type"]
            object_type = _normalise_type(record, forced_type)
            catalog_id = _catalog_id(record)
            propagated_counts[object_type] += 1

            objects.append(
                {
                    "id": catalog_id,
                    "norad_id": int(catalog_id) if catalog_id.isdigit() else catalog_id,
                    "name": record.get("OBJECT_NAME") or f"NORAD {catalog_id}",
                    "international_designator": record.get("OBJECT_ID"),
                    "type": object_type,
                    "lat": round(float(latitude.degrees), 6),
                    "lon": round(float(longitude.degrees), 6),
                    "altitude_km": round(float(altitude), 3),
                    "velocity_km_s": round(velocity, 5),
                    "position_eci_km": [round(float(value), 6) for value in xyz],
                    "velocity_eci_km_s": [
                        round(float(value), 8) for value in velocity_vector
                    ],
                    "element_epoch": str(record.get("EPOCH") or ""),
                    "position_timestamp": position_timestamp,
                    "element_source": "CelesTrak",
                    "source_group": source_name,
                    "source_object_type": record.get("OBJECT_TYPE"),
                    "propagator": "SGP4",
                    "data_mode": "live-propagated",
                }
            )
        except (ValueError, TypeError, OverflowError, KeyError):
            continue

    if not objects:
        raise RuntimeError("No valid CelesTrak OMM objects could be propagated")

    return objects, position_timestamp, available_counts, propagated_counts


def _load_snapshot_from_disk() -> dict[str, Any] | None:
    payload = _read_json(SNAPSHOT_CACHE_PATH, None)
    if not isinstance(payload, dict):
        return None
    if not isinstance(payload.get("objects"), list) or not payload["objects"]:
        return None
    return payload


_SNAPSHOT: dict[str, Any] | None = _load_snapshot_from_disk()


def _publish_snapshot(snapshot: dict[str, Any]) -> None:
    global _SNAPSHOT
    _write_json_atomic(SNAPSHOT_CACHE_PATH, snapshot)
    with _STATE_LOCK:
        _SNAPSHOT = snapshot


def _build_snapshot(
    source_payloads: dict[str, list[dict[str, Any]]],
    source_metadata: dict[str, Any],
    *,
    max_objects: int,
    stage: str,
    refresh_in_progress: bool,
) -> dict[str, Any]:
    objects, position_timestamp, classification_counts, sampled_counts = parse_and_propagate(
        source_payloads,
        max_objects=max_objects,
    )
    return {
        "objects": objects,
        "source": "celestrak",
        "source_name": "CelesTrak",
        "source_format": "OMM JSON/GP",
        "propagator": "SGP4",
        "data_mode": "live-propagated",
        "position_timestamp": position_timestamp,
        "classification_counts": classification_counts,
        "sampled_classification_counts": sampled_counts,
        "catalogued_objects": sum(classification_counts.values()),
        "refresh_stage": stage,
        "refresh_in_progress": refresh_in_progress,
        "snapshot_saved_at": _iso_utc(),
        **source_metadata,
    }


def _refresh_worker(force_remote: bool) -> None:
    global _LAST_REFRESH_ERROR
    try:
        source_payloads, source_metadata = fetch_omm_data(force_refresh=force_remote)

        preview_limit = max(1, min(PREVIEW_OBJECTS, MAX_OBJECTS))
        if preview_limit < MAX_OBJECTS:
            preview_snapshot = _build_snapshot(
                source_payloads,
                source_metadata,
                max_objects=preview_limit,
                stage="preview",
                refresh_in_progress=True,
            )
            _publish_snapshot(preview_snapshot)

        full_snapshot = _build_snapshot(
            source_payloads,
            source_metadata,
            max_objects=MAX_OBJECTS,
            stage="complete",
            refresh_in_progress=False,
        )
        _publish_snapshot(full_snapshot)
        with _STATE_LOCK:
            _LAST_REFRESH_ERROR = None
    except Exception as exc:  # The current real snapshot remains available.
        with _STATE_LOCK:
            _LAST_REFRESH_ERROR = str(exc)


def _refresh_is_running() -> bool:
    with _STATE_LOCK:
        return bool(_REFRESH_THREAD and _REFRESH_THREAD.is_alive())


def _start_background_refresh(force_remote: bool = False) -> bool:
    global _REFRESH_THREAD
    with _STATE_LOCK:
        if _REFRESH_THREAD and _REFRESH_THREAD.is_alive():
            return False
        _REFRESH_THREAD = threading.Thread(
            target=_refresh_worker,
            args=(force_remote,),
            name="orbitops-celestrak-refresh",
            daemon=True,
        )
        _REFRESH_THREAD.start()
        return True


def _snapshot_needs_position_refresh(snapshot: dict[str, Any]) -> bool:
    generated_at = _parse_utc(snapshot.get("position_timestamp"))
    if generated_at is None:
        return True
    return (_utc_now() - generated_at).total_seconds() >= POSITION_REFRESH_SECONDS


def _snapshot_response(snapshot: dict[str, Any]) -> dict[str, Any]:
    response = dict(snapshot)
    response["objects"] = list(snapshot.get("objects", []))
    response["refresh_in_progress"] = _refresh_is_running()
    with _STATE_LOCK:
        if _LAST_REFRESH_ERROR:
            response["background_refresh_error"] = _LAST_REFRESH_ERROR
    return response


def get_orbital_data(force_refresh: bool = False) -> dict[str, Any]:
    """
    Return immediately from the latest real snapshot and refresh in the background.

    On a completely cold start this returns a lightweight warming response instead
    of blocking the Flask request while multiple CelesTrak downloads and thousands
    of SGP4 propagations complete.
    """
    with _STATE_LOCK:
        snapshot = _SNAPSHOT

    if force_refresh:
        _start_background_refresh(force_remote=True)
    elif snapshot is None:
        _start_background_refresh(force_remote=False)
    elif _snapshot_needs_position_refresh(snapshot):
        _start_background_refresh(force_remote=not _cache_is_fresh())

    if snapshot is not None:
        return _snapshot_response(snapshot)

    with _STATE_LOCK:
        last_error = _LAST_REFRESH_ERROR

    return {
        "objects": [],
        "source": "celestrak",
        "source_name": "CelesTrak",
        "source_format": "OMM JSON/GP",
        "source_status": "warming",
        "source_errors": [last_error] if last_error else [],
        "using_cache": False,
        "last_successful_fetch": None,
        "position_timestamp": None,
        "classification_counts": {
            "SATELLITE": 0,
            "DEBRIS": 0,
            "ROCKET_BODY": 0,
        },
        "sampled_classification_counts": {
            "SATELLITE": 0,
            "DEBRIS": 0,
            "ROCKET_BODY": 0,
        },
        "catalogued_objects": 0,
        "propagator": "SGP4",
        "data_mode": "warming",
        "refresh_stage": "connecting",
        "refresh_in_progress": _refresh_is_running(),
    }
