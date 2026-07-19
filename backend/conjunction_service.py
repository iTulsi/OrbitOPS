from __future__ import annotations

import hashlib
import json
import math
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np

from conjunction_history import enrich_conjunction_snapshot
from risk_engine import score_conjunction_event
from sgp4_conjunction_engine import screen_multi_epoch_sgp4

EARTH_RADIUS_KM = 6371.0088
DEFAULT_HORIZON_HOURS = max(1, int(os.environ.get("CONJUNCTION_HORIZON_HOURS", "24")))
DEFAULT_SCREENING_DISTANCE_KM = max(
    1.0,
    float(os.environ.get("CONJUNCTION_SCREENING_DISTANCE_KM", "75")),
)
DEFAULT_MAX_EVENTS = max(25, int(os.environ.get("CONJUNCTION_MAX_EVENTS", "500")))
DEFAULT_OBJECT_LIMIT = max(100, int(os.environ.get("CONJUNCTION_OBJECT_LIMIT", "2500")))
DEFAULT_REFRESH_SECONDS = max(
    60,
    int(os.environ.get("CONJUNCTION_REFRESH_SECONDS", "600")),
)
BLOCK_SIZE = max(64, int(os.environ.get("CONJUNCTION_BLOCK_SIZE", "256")))

DATA_DIR = Path(__file__).resolve().parent / "data"
SNAPSHOT_PATH = DATA_DIR / "conjunction_snapshot.json"

_STATE_LOCK = threading.Lock()
_REFRESH_THREAD: threading.Thread | None = None
_LAST_ERROR: str | None = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime | None = None) -> str:
    return (value or _utc_now()).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        parsed = float(value)
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _normalise_type(value: Any) -> str:
    text = str(value or "UNKNOWN").upper().replace("-", "_").replace(" ", "_")
    if "DEBRIS" in text or text.endswith("_DEB"):
        return "DEBRIS"
    if "ROCKET" in text or "R_B" in text:
        return "ROCKET_BODY"
    if "SAT" in text or "PAYLOAD" in text:
        return "SATELLITE"
    return "UNKNOWN"


def _object_id(obj: dict[str, Any], index: int) -> str:
    for key in ("norad_id", "id", "catalog_number", "satnum", "object_id"):
        value = obj.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return f"OBJECT-{index + 1:05d}"


def _object_name(obj: dict[str, Any], index: int) -> str:
    for key in ("name", "object_name", "title"):
        value = obj.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return f"Tracked object {index + 1}"


def _read_vector(obj: dict[str, Any], keys: tuple[str, ...]) -> np.ndarray | None:
    for key in keys:
        value = obj.get(key)
        if isinstance(value, (list, tuple)) and len(value) == 3:
            try:
                vector = np.asarray(value, dtype=float)
            except (TypeError, ValueError):
                continue
            if np.isfinite(vector).all():
                return vector
    return None


def _position_from_lat_lon(obj: dict[str, Any]) -> np.ndarray | None:
    lat = _safe_float(obj.get("lat", obj.get("latitude")))
    lon = _safe_float(obj.get("lon", obj.get("lng", obj.get("longitude"))))
    altitude = _safe_float(
        obj.get("altitude_km", obj.get("altitude", obj.get("alt"))),
        0.0,
    )
    if lat is None or lon is None or altitude is None:
        return None

    radius = EARTH_RADIUS_KM + altitude
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    cos_lat = math.cos(lat_rad)
    return np.asarray(
        [
            radius * cos_lat * math.cos(lon_rad),
            radius * cos_lat * math.sin(lon_rad),
            radius * math.sin(lat_rad),
        ],
        dtype=float,
    )


def _object_state(obj: dict[str, Any], index: int) -> dict[str, Any] | None:
    position = _read_vector(
        obj,
        (
            "position_eci_km",
            "position_km",
            "eci_position_km",
            "position_vector_km",
        ),
    )
    if position is None:
        position = _position_from_lat_lon(obj)
    if position is None:
        return None

    velocity = _read_vector(
        obj,
        (
            "velocity_eci_km_s",
            "velocity_vector_km_s",
            "eci_velocity_km_s",
        ),
    )

    scalar_velocity = _safe_float(
        obj.get("velocity_km_s", obj.get("velocity", obj.get("speed")))
    )
    altitude = _safe_float(
        obj.get("altitude_km", obj.get("altitude", obj.get("alt")))
    )

    return {
        "id": _object_id(obj, index),
        "name": _object_name(obj, index),
        "type": _normalise_type(obj.get("type", obj.get("object_type"))),
        "altitude_km": altitude,
        "speed_km_s": scalar_velocity,
        "position": position,
        "velocity": velocity,
    }


def _event_identifier(object_a_id: str, object_b_id: str) -> str:
    # Stable pair identifier that survives telemetry refreshes.
    ordered = sorted((str(object_a_id), str(object_b_id)))
    digest = hashlib.sha1(
        f"{ordered[0]}|{ordered[1]}".encode("utf-8")
    ).hexdigest()[:14]
    return f"CONJ-{digest.upper()}"


def _build_event(
    state_a: dict[str, Any],
    state_b: dict[str, Any],
    *,
    miss_distance_km: float,
    relative_velocity_km_s: float | None,
    tca_seconds: float,
    source_timestamp: str,
    has_full_state: bool,
    model_basis_override: str | None = None,
    screening_method: str | None = None,
) -> dict[str, Any]:
    score_result = score_conjunction_event(
        miss_distance_km=miss_distance_km,
        relative_velocity_km_s=relative_velocity_km_s,
        time_to_closest_approach_hours=max(0.0, tca_seconds) / 3600.0,
        object_a_type=state_a["type"],
        object_b_type=state_b["type"],
        has_full_state=has_full_state,
    )
    score = score_result["score"]
    level = score_result["level"]
    model_basis = model_basis_override or score_result["model_basis"]
    reference_time = _parse_utc(source_timestamp) or _utc_now()
    closest_approach = reference_time + timedelta(seconds=max(0.0, tca_seconds))
    altitude_values = [
        value
        for value in (state_a.get("altitude_km"), state_b.get("altitude_km"))
        if value is not None
    ]
    mean_altitude = sum(altitude_values) / len(altitude_values) if altitude_values else None

    if level in {"CRITICAL", "HIGH"}:
        recommendation = "Prioritise tracking updates and perform operator review."
    elif level == "MEDIUM":
        recommendation = "Continue enhanced monitoring and refresh the screening solution."
    else:
        recommendation = "Maintain routine monitoring."

    return {
        "id": _event_identifier(state_a["id"], state_b["id"]),
        "risk_level": level,
        "risk_score": score,
        "screening_priority_level": level,
        "screening_priority_score": score,
        "severity_basis": score_result["severity_basis"],
        "score_components": score_result["components"],
        "miss_distance_km": round(float(miss_distance_km), 3),
        "relative_velocity_km_s": (
            round(float(relative_velocity_km_s), 4)
            if relative_velocity_km_s is not None and math.isfinite(relative_velocity_km_s)
            else None
        ),
        "time_to_closest_approach_hours": round(float(tca_seconds) / 3600.0, 3),
        "closest_approach_utc": _iso_utc(closest_approach),
        "altitude_km": round(float(mean_altitude), 2) if mean_altitude is not None else None,
        "collision_probability": None,
        "probability_status": "not-computed-covariance-unavailable",
        "model_basis": model_basis,
        "screening_method": (
            screening_method
            or (
                "constant-velocity-relative-motion"
                if has_full_state
                else "current-frame-proximity"
            )
        ),
        "source_position_timestamp": source_timestamp,
        "confidence": "screening" if has_full_state else "limited",
        "recommendation": recommendation,
        "object_a": {
            "id": state_a["id"],
            "norad_id": state_a["id"],
            "name": state_a["name"],
            "type": state_a["type"],
            "altitude_km": state_a.get("altitude_km"),
        },
        "object_b": {
            "id": state_b["id"],
            "norad_id": state_b["id"],
            "name": state_b["name"],
            "type": state_b["type"],
            "altitude_km": state_b.get("altitude_km"),
        },
    }


def _screen_objects(
    objects: list[dict[str, Any]],
    *,
    source_timestamp: str,
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
    screening_distance_km: float = DEFAULT_SCREENING_DISTANCE_KM,
    max_events: int = DEFAULT_MAX_EVENTS,
    object_limit: int = DEFAULT_OBJECT_LIMIT,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    states = [
        state
        for index, obj in enumerate(objects[:object_limit])
        if isinstance(obj, dict) and (state := _object_state(obj, index)) is not None
    ]

    count = len(states)
    if count < 2:
        return [], {
            "objects_analyzed": count,
            "pairs_evaluated": 0,
            "full_state_vectors": 0,
            "limited_state_vectors": count,
        }

    positions = np.asarray([state["position"] for state in states], dtype=float)
    velocity_rows = []
    full_state_mask = []
    scalar_speeds = []
    for state in states:
        velocity = state["velocity"]
        full_state = velocity is not None
        velocity_rows.append(velocity if full_state else np.asarray([np.nan, np.nan, np.nan]))
        full_state_mask.append(full_state)
        scalar_speeds.append(state.get("speed_km_s", np.nan))

    velocities = np.asarray(velocity_rows, dtype=float)
    full_state_mask_array = np.asarray(full_state_mask, dtype=bool)
    scalar_speeds_array = np.asarray(scalar_speeds, dtype=float)

    horizon_seconds = float(horizon_hours) * 3600.0
    events: list[dict[str, Any]] = []
    pairs_evaluated = 0

    for start in range(0, count, BLOCK_SIZE):
        stop = min(start + BLOCK_SIZE, count)
        p_i = positions[start:stop, None, :]
        p_j = positions[None, :, :]
        relative_position = p_j - p_i

        v_i = velocities[start:stop, None, :]
        v_j = velocities[None, :, :]
        relative_velocity = v_j - v_i

        block_full_state = full_state_mask_array[start:stop, None] & full_state_mask_array[None, :]
        speed_squared = np.sum(relative_velocity * relative_velocity, axis=2)
        dot_product = np.sum(relative_position * relative_velocity, axis=2)

        with np.errstate(divide="ignore", invalid="ignore"):
            tca_seconds = np.where(
                block_full_state & (speed_squared > 1e-12),
                np.clip(-dot_product / speed_squared, 0.0, horizon_seconds),
                0.0,
            )

        closest_vectors = relative_position + relative_velocity * tca_seconds[:, :, None]
        distances = np.linalg.norm(closest_vectors, axis=2)
        current_distances = np.linalg.norm(relative_position, axis=2)
        distances = np.where(block_full_state, distances, current_distances)

        relative_speed = np.linalg.norm(relative_velocity, axis=2)
        scalar_delta = np.abs(
            scalar_speeds_array[None, :] - scalar_speeds_array[start:stop, None]
        )
        relative_speed = np.where(block_full_state, relative_speed, scalar_delta)

        row_indices = np.arange(start, stop)[:, None]
        column_indices = np.arange(count)[None, :]
        upper_triangle = column_indices > row_indices
        candidate_mask = upper_triangle & np.isfinite(distances) & (
            distances <= screening_distance_km
        )
        pairs_evaluated += int(np.count_nonzero(upper_triangle))

        candidate_rows, candidate_columns = np.nonzero(candidate_mask)
        for local_row, column in zip(candidate_rows.tolist(), candidate_columns.tolist()):
            row = start + local_row
            has_full_state = bool(block_full_state[local_row, column])
            rel_speed_value = float(relative_speed[local_row, column])
            if not math.isfinite(rel_speed_value):
                rel_speed_value = None

            events.append(
                _build_event(
                    states[row],
                    states[column],
                    miss_distance_km=float(distances[local_row, column]),
                    relative_velocity_km_s=rel_speed_value,
                    tca_seconds=float(tca_seconds[local_row, column]),
                    source_timestamp=source_timestamp,
                    has_full_state=has_full_state,
                )
            )

    events.sort(
        key=lambda event: (
            -float(event.get("risk_score") or 0.0),
            float(event.get("miss_distance_km") or math.inf),
        )
    )

    return events[:max_events], {
        "objects_analyzed": count,
        "pairs_evaluated": pairs_evaluated,
        "full_state_vectors": int(np.count_nonzero(full_state_mask_array)),
        "limited_state_vectors": int(count - np.count_nonzero(full_state_mask_array)),
    }


def _summary(events: list[dict[str, Any]]) -> dict[str, int]:
    result = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "monitored": 0,
        "total": len(events),
    }
    for event in events:
        key = str(event.get("risk_level") or "MONITORED").lower()
        if key not in result:
            key = "monitored"
        result[key] += 1
    return result


def _read_snapshot() -> dict[str, Any] | None:
    try:
        payload = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _write_snapshot(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SNAPSHOT_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary.replace(SNAPSHOT_PATH)


_SNAPSHOT: dict[str, Any] | None = _read_snapshot()


def _source_signature(source: dict[str, Any]) -> str:
    timestamp = str(
        source.get("position_timestamp")
        or source.get("last_updated")
        or source.get("snapshot_saved_at")
        or "unknown"
    )
    objects = source.get("objects") if isinstance(source.get("objects"), list) else []
    return f"{timestamp}|{len(objects)}"


def _snapshot_is_stale(snapshot: dict[str, Any] | None) -> bool:
    if not snapshot:
        return True
    updated_at = _parse_utc(snapshot.get("last_updated"))
    if updated_at is None:
        return True
    age_seconds = (_utc_now() - updated_at).total_seconds()
    return age_seconds >= DEFAULT_REFRESH_SECONDS


def _compute_worker(source: dict[str, Any]) -> None:
    global _SNAPSHOT, _LAST_ERROR
    try:
        objects = source.get("objects") if isinstance(source.get("objects"), list) else []
        source_timestamp = str(
            source.get("position_timestamp")
            or source.get("last_updated")
            or _iso_utc()
        )

        raw_events, diagnostics = screen_multi_epoch_sgp4(
            objects,
            source_timestamp=source_timestamp,
            horizon_hours=DEFAULT_HORIZON_HOURS,
            screening_distance_km=DEFAULT_SCREENING_DISTANCE_KM,
            max_events=DEFAULT_MAX_EVENTS,
            object_limit=DEFAULT_OBJECT_LIMIT,
        )

        if diagnostics.get("engine_status") == "ok":
            events = [
                _build_event(
                    raw_event["state_a"],
                    raw_event["state_b"],
                    miss_distance_km=float(raw_event["miss_distance_km"]),
                    relative_velocity_km_s=float(
                        raw_event["relative_velocity_km_s"]
                    ),
                    tca_seconds=float(raw_event["tca_seconds"]),
                    source_timestamp=source_timestamp,
                    has_full_state=True,
                    model_basis_override="multi-epoch-sgp4",
                    screening_method=(
                        "segmented-sgp4-candidate-generation-with-"
                        "coarse-and-fine-tca-refinement"
                    ),
                )
                for raw_event in raw_events
            ]
            events.sort(
                key=lambda event: (
                    -float(event.get("screening_priority_score") or 0.0),
                    float(event.get("miss_distance_km") or math.inf),
                )
            )
            model_type = "multi-epoch-sgp4-conjunction-screening"
            screening_stage = "multi-epoch-sgp4-refined"
            method_limitations = [
                "Candidate generation uses short linear segments between SGP4 anchor epochs.",
                "TCA is refined with direct SGP4 propagation at coarse and fine time steps.",
                "Collision probability is unavailable without covariance data.",
                "Results are screening-grade and are not intended for operational maneuver decisions.",
            ]
        else:
            events, fallback_diagnostics = _screen_objects(
                objects,
                source_timestamp=source_timestamp,
            )
            diagnostics = {
                **fallback_diagnostics,
                **diagnostics,
                "engine_status": "fallback-linear-screening",
            }
            model_type = "baseline-linear-relative-motion-screening"
            screening_stage = "current-state-linear-screening"
            method_limitations = [
                "The SGP4 OMM catalogue was unavailable for enough objects.",
                "This fallback extrapolates the current relative state with constant velocity.",
                "Collision probability is unavailable without covariance data.",
            ]

        payload = {
            "status": "live" if objects else "warming",
            "source": source.get("source_name") or source.get("source") or "CelesTrak",
            "source_status": source.get("source_status") or "available",
            "propagator": source.get("propagator") or "SGP4",
            "model_type": model_type,
            "screening_stage": screening_stage,
            "operational_use": False,
            "method_limitations": method_limitations,
            "probability_available": False,
            "probability_note": (
                "Collision probability is not computed because covariance data is unavailable."
            ),
            "horizon_hours": DEFAULT_HORIZON_HOURS,
            "screening_distance_km": DEFAULT_SCREENING_DISTANCE_KM,
            "refresh_interval_seconds": DEFAULT_REFRESH_SECONDS,
            "events_sorted_by": "screening_priority_score_desc",
            "coverage_status": diagnostics.get("coverage_status", "unknown"),
            "summary_status": (
                "partial"
                if diagnostics.get("coverage_status") == "partial"
                else "complete"
            ),
            "events": events,
            "summary": _summary(events),
            "diagnostics": diagnostics,
            "source_position_timestamp": source_timestamp,
            "source_signature": _source_signature(source),
            "last_updated": _iso_utc(),
            "refresh_in_progress": False,
        }
        try:
            payload = enrich_conjunction_snapshot(payload)
        except Exception as history_error:
            payload["history_status"] = "error"
            payload["history_error"] = str(history_error)

        _write_snapshot(payload)
        with _STATE_LOCK:
            _SNAPSHOT = payload
            _LAST_ERROR = None
    except Exception as exc:
        with _STATE_LOCK:
            _LAST_ERROR = str(exc)



def _refresh_running() -> bool:
    with _STATE_LOCK:
        return bool(_REFRESH_THREAD and _REFRESH_THREAD.is_alive())


def _start_refresh(source: dict[str, Any]) -> bool:
    global _REFRESH_THREAD
    with _STATE_LOCK:
        if _REFRESH_THREAD and _REFRESH_THREAD.is_alive():
            return False
        copied_source = dict(source)
        copied_source["objects"] = list(source.get("objects") or [])
        _REFRESH_THREAD = threading.Thread(
            target=_compute_worker,
            args=(copied_source,),
            name="orbitops-conjunction-screening",
            daemon=True,
        )
        _REFRESH_THREAD.start()
        return True


def get_conjunction_snapshot(
    orbital_data_provider: Callable[..., dict[str, Any]],
    *,
    force: bool = False,
    limit: int = 250,
) -> tuple[dict[str, Any], int]:
    """Return the last screening snapshot immediately and refresh it in the background."""
    try:
        source = orbital_data_provider(force_refresh=force)
    except TypeError:
        source = orbital_data_provider()
    if not isinstance(source, dict):
        source = {"objects": []}

    source_objects = source.get("objects") if isinstance(source.get("objects"), list) else []
    signature = _source_signature(source)

    with _STATE_LOCK:
        snapshot = _SNAPSHOT
        last_error = _LAST_ERROR

    signature_changed = (
        snapshot is None
        or snapshot.get("source_signature") != signature
    )
    needs_refresh = force or (
        bool(source_objects)
        and signature_changed
        and _snapshot_is_stale(snapshot)
    )
    if needs_refresh:
        _start_refresh(source)

    with _STATE_LOCK:
        snapshot = _SNAPSHOT
        last_error = _LAST_ERROR

    safe_limit = max(1, min(int(limit or 250), DEFAULT_MAX_EVENTS))
    if snapshot is not None:
        response = dict(snapshot)
        response["events"] = list(snapshot.get("events") or [])[:safe_limit]
        response["returned_events"] = len(response["events"])
        response["refresh_interval_seconds"] = DEFAULT_REFRESH_SECONDS
        response["refresh_in_progress"] = _refresh_running()
        if last_error:
            response["background_refresh_error"] = last_error
        if source.get("refresh_in_progress"):
            response["source_refresh_in_progress"] = True
        return response, 200

    return {
        "status": "warming" if not last_error else "offline",
        "source": source.get("source_name") or source.get("source") or "CelesTrak",
        "source_status": source.get("source_status") or "warming",
        "propagator": source.get("propagator") or "SGP4",
        "model_type": "baseline-linear-relative-motion-screening",
        "screening_stage": "current-state-linear-screening",
        "operational_use": False,
        "method_limitations": [
            "This stage extrapolates the current relative state with constant velocity.",
            "It is a screening model, not full multi-epoch SGP4 conjunction propagation.",
            "Collision probability is unavailable without covariance data.",
        ],
        "probability_available": False,
        "probability_note": (
            "Collision probability is not computed because covariance data is unavailable."
        ),
        "horizon_hours": DEFAULT_HORIZON_HOURS,
        "screening_distance_km": DEFAULT_SCREENING_DISTANCE_KM,
        "refresh_interval_seconds": DEFAULT_REFRESH_SECONDS,
        "coverage_status": "warming",
        "summary_status": "warming",
        "events": [],
        "returned_events": 0,
        "summary": {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "monitored": 0,
            "total": 0,
        },
        "diagnostics": {
            "objects_analyzed": len(source_objects),
            "pairs_evaluated": 0,
            "full_state_vectors": 0,
            "limited_state_vectors": len(source_objects),
        },
        "refresh_in_progress": _refresh_running(),
        "source_refresh_in_progress": bool(source.get("refresh_in_progress")),
        "last_updated": None,
        "message": last_error or "Conjunction screening is warming from the latest orbital frame.",
    }, 200
