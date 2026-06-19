from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
from skyfield.api import EarthSatellite, load


EARTH_RADIUS_KM = 6371.0088

BASE_DIR = Path(__file__).resolve().parent
OMM_CACHE_DIR = BASE_DIR / "data" / "celestrak_omm"

SEGMENT_MINUTES = max(
    5,
    int(os.environ.get("CONJUNCTION_SGP4_SEGMENT_MINUTES", "30")),
)
CANDIDATE_DISTANCE_KM = max(
    100.0,
    float(os.environ.get("CONJUNCTION_SGP4_CANDIDATE_DISTANCE_KM", "500")),
)
MAX_CANDIDATES = max(
    50,
    int(os.environ.get("CONJUNCTION_SGP4_MAX_CANDIDATES", "750")),
)
REFINEMENT_WINDOW_MINUTES = max(
    2,
    int(os.environ.get("CONJUNCTION_SGP4_REFINEMENT_WINDOW_MINUTES", "20")),
)
COARSE_REFINEMENT_STEP_SECONDS = max(
    5,
    int(os.environ.get("CONJUNCTION_SGP4_COARSE_STEP_SECONDS", "30")),
)
FINE_REFINEMENT_STEP_SECONDS = max(
    1,
    int(os.environ.get("CONJUNCTION_SGP4_FINE_STEP_SECONDS", "2")),
)

_TIMESCALE = load.timescale()


def _parse_utc(value: Any) -> datetime:
    if value:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError):
            pass
    return datetime.now(timezone.utc)


def _catalog_id(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    try:
        number = float(text)
        if number.is_integer():
            return str(int(number))
    except (TypeError, ValueError):
        pass
    return text


def _object_id(obj: dict[str, Any], index: int) -> str:
    for key in ("norad_id", "id", "catalog_number", "satnum", "object_id"):
        identifier = _catalog_id(obj.get(key))
        if identifier:
            return identifier
    return f"OBJECT-{index + 1:05d}"


def _object_name(obj: dict[str, Any], index: int) -> str:
    for key in ("name", "object_name", "title"):
        value = obj.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return f"Tracked object {index + 1}"


def _normalise_type(value: Any) -> str:
    text = str(value or "UNKNOWN").upper().replace("-", "_").replace(" ", "_")
    if "DEBRIS" in text or text.endswith("_DEB"):
        return "DEBRIS"
    if "ROCKET" in text or "R_B" in text:
        return "ROCKET_BODY"
    if "SAT" in text or "PAYLOAD" in text:
        return "SATELLITE"
    return "UNKNOWN"


def _load_omm_catalog(
    object_ids: set[str],
    cache_dir: Path = OMM_CACHE_DIR,
) -> dict[str, dict[str, Any]]:
    """Load only OMM records needed by the current orbital snapshot."""
    catalog: dict[str, dict[str, Any]] = {}
    if not object_ids or not cache_dir.exists():
        return catalog

    for path in sorted(cache_dir.glob("*.json")):
        if path.name == "metadata.json":
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, list):
            continue

        for record in payload:
            if not isinstance(record, dict):
                continue
            identifier = _catalog_id(record.get("NORAD_CAT_ID"))
            if identifier in object_ids and identifier not in catalog:
                catalog[identifier] = record

        if len(catalog) == len(object_ids):
            break

    return catalog


def _propagate_at(
    satellites: list[EarthSatellite],
    at_time: datetime,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Propagate every satellite at one epoch and return ECI states."""
    skyfield_time = _TIMESCALE.from_datetime(at_time)

    positions = np.full((len(satellites), 3), np.nan, dtype=float)
    velocities = np.full((len(satellites), 3), np.nan, dtype=float)
    valid = np.zeros(len(satellites), dtype=bool)

    for index, satellite in enumerate(satellites):
        try:
            geocentric = satellite.at(skyfield_time)
            position = np.asarray(geocentric.xyz.km, dtype=float)
            velocity = np.asarray(geocentric.velocity.km_per_s, dtype=float)
            if (
                position.shape == (3,)
                and velocity.shape == (3,)
                and np.isfinite(position).all()
                and np.isfinite(velocity).all()
            ):
                positions[index] = position
                velocities[index] = velocity
                valid[index] = True
        except (ValueError, TypeError, OverflowError):
            continue

    return positions, velocities, valid


def _collect_linear_candidates(
    positions: np.ndarray,
    velocities: np.ndarray,
    valid: np.ndarray,
    *,
    anchor_offset_seconds: float,
    segment_seconds: float,
    candidate_distance_km: float,
    block_size: int = 256,
) -> tuple[dict[tuple[int, int], dict[str, float]], int]:
    """Use short linear segments to generate candidates for SGP4 refinement."""
    count = len(positions)
    candidates: dict[tuple[int, int], dict[str, float]] = {}
    pairs_evaluated = 0

    for start in range(0, count, block_size):
        stop = min(start + block_size, count)

        p_i = positions[start:stop, None, :]
        p_j = positions[None, :, :]
        relative_position = p_j - p_i

        v_i = velocities[start:stop, None, :]
        v_j = velocities[None, :, :]
        relative_velocity = v_j - v_i

        speed_squared = np.sum(relative_velocity * relative_velocity, axis=2)
        dot_product = np.sum(relative_position * relative_velocity, axis=2)

        with np.errstate(divide="ignore", invalid="ignore"):
            local_tca = np.where(
                speed_squared > 1e-12,
                np.clip(-dot_product / speed_squared, 0.0, segment_seconds),
                0.0,
            )

        closest_vectors = relative_position + relative_velocity * local_tca[:, :, None]
        distances = np.linalg.norm(closest_vectors, axis=2)

        row_indices = np.arange(start, stop)[:, None]
        column_indices = np.arange(count)[None, :]
        upper_triangle = column_indices > row_indices

        valid_pairs = valid[start:stop, None] & valid[None, :]
        candidate_mask = (
            upper_triangle
            & valid_pairs
            & np.isfinite(distances)
            & (distances <= candidate_distance_km)
        )

        pairs_evaluated += int(np.count_nonzero(upper_triangle & valid_pairs))

        local_rows, columns = np.nonzero(candidate_mask)
        for local_row, column in zip(local_rows.tolist(), columns.tolist()):
            row = start + local_row
            key = (row, column)
            miss_distance = float(distances[local_row, column])
            predicted_tca = anchor_offset_seconds + float(local_tca[local_row, column])

            existing = candidates.get(key)
            if existing is None or miss_distance < existing["linear_miss_distance_km"]:
                candidates[key] = {
                    "linear_miss_distance_km": miss_distance,
                    "predicted_tca_seconds": predicted_tca,
                }

    return candidates, pairs_evaluated


def _time_grid(
    source_time: datetime,
    start_seconds: float,
    stop_seconds: float,
    step_seconds: int,
) -> tuple[list[datetime], np.ndarray]:
    offsets = np.arange(
        max(0.0, start_seconds),
        max(0.0, stop_seconds) + step_seconds * 0.5,
        float(step_seconds),
        dtype=float,
    )
    datetimes = [source_time + timedelta(seconds=float(value)) for value in offsets]
    return datetimes, offsets


def _evaluate_pair(
    satellite_a: EarthSatellite,
    satellite_b: EarthSatellite,
    datetimes: list[datetime],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    times = _TIMESCALE.from_datetimes(datetimes)
    state_a = satellite_a.at(times)
    state_b = satellite_b.at(times)

    position_a = np.asarray(state_a.xyz.km, dtype=float).T
    position_b = np.asarray(state_b.xyz.km, dtype=float).T
    velocity_a = np.asarray(state_a.velocity.km_per_s, dtype=float).T
    velocity_b = np.asarray(state_b.velocity.km_per_s, dtype=float).T

    relative_position = position_b - position_a
    relative_velocity = velocity_b - velocity_a
    distances = np.linalg.norm(relative_position, axis=1)
    relative_speeds = np.linalg.norm(relative_velocity, axis=1)

    return distances, relative_speeds, position_a, position_b


def _refine_candidate(
    satellite_a: EarthSatellite,
    satellite_b: EarthSatellite,
    *,
    source_time: datetime,
    predicted_tca_seconds: float,
    horizon_seconds: float,
    screening_distance_km: float,
) -> dict[str, float] | None:
    window_seconds = float(REFINEMENT_WINDOW_MINUTES * 60)
    coarse_datetimes, coarse_offsets = _time_grid(
        source_time,
        predicted_tca_seconds - window_seconds,
        min(horizon_seconds, predicted_tca_seconds + window_seconds),
        COARSE_REFINEMENT_STEP_SECONDS,
    )

    if not coarse_datetimes:
        return None

    try:
        (
            coarse_distances,
            coarse_speeds,
            _coarse_position_a,
            _coarse_position_b,
        ) = _evaluate_pair(satellite_a, satellite_b, coarse_datetimes)
    except (ValueError, TypeError, OverflowError):
        return None

    finite = np.isfinite(coarse_distances)
    if not finite.any():
        return None

    safe_distances = np.where(finite, coarse_distances, np.inf)
    coarse_index = int(np.argmin(safe_distances))
    coarse_minimum = float(safe_distances[coarse_index])
    coarse_speed = float(coarse_speeds[coarse_index])

    sampling_margin = (
        max(0.0, coarse_speed)
        * float(COARSE_REFINEMENT_STEP_SECONDS)
        * 0.5
    )
    if coarse_minimum > screening_distance_km + sampling_margin:
        return None

    fine_center = float(coarse_offsets[coarse_index])
    fine_half_window = max(
        float(COARSE_REFINEMENT_STEP_SECONDS),
        60.0,
    )
    fine_datetimes, fine_offsets = _time_grid(
        source_time,
        fine_center - fine_half_window,
        min(horizon_seconds, fine_center + fine_half_window),
        FINE_REFINEMENT_STEP_SECONDS,
    )

    try:
        (
            fine_distances,
            fine_speeds,
            fine_position_a,
            fine_position_b,
        ) = _evaluate_pair(satellite_a, satellite_b, fine_datetimes)
    except (ValueError, TypeError, OverflowError):
        return None

    finite = np.isfinite(fine_distances)
    if not finite.any():
        return None

    safe_distances = np.where(finite, fine_distances, np.inf)
    best_index = int(np.argmin(safe_distances))
    miss_distance = float(safe_distances[best_index])

    if not math.isfinite(miss_distance) or miss_distance > screening_distance_km:
        return None

    relative_speed = float(fine_speeds[best_index])
    position_a = fine_position_a[best_index]
    position_b = fine_position_b[best_index]

    altitude_a = float(np.linalg.norm(position_a) - EARTH_RADIUS_KM)
    altitude_b = float(np.linalg.norm(position_b) - EARTH_RADIUS_KM)

    return {
        "miss_distance_km": miss_distance,
        "relative_velocity_km_s": relative_speed,
        "tca_seconds": float(fine_offsets[best_index]),
        "altitude_a_km": altitude_a,
        "altitude_b_km": altitude_b,
    }


def screen_multi_epoch_sgp4(
    objects: list[dict[str, Any]],
    *,
    source_timestamp: str,
    horizon_hours: int,
    screening_distance_km: float,
    max_events: int,
    object_limit: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Screen a current catalogue using segmented SGP4 propagation."""
    started = time.perf_counter()
    source_time = _parse_utc(source_timestamp)
    selected_objects = [
        obj for obj in objects[:object_limit] if isinstance(obj, dict)
    ]

    identifiers = {
        _object_id(obj, index)
        for index, obj in enumerate(selected_objects)
    }
    catalog = _load_omm_catalog(identifiers)

    states: list[dict[str, Any]] = []
    satellites: list[EarthSatellite] = []
    missing_omm = 0

    for index, obj in enumerate(selected_objects):
        identifier = _object_id(obj, index)
        record = catalog.get(identifier)
        if record is None:
            missing_omm += 1
            continue

        try:
            satellite = EarthSatellite.from_omm(_TIMESCALE, record)
        except (ValueError, TypeError, OverflowError, KeyError):
            missing_omm += 1
            continue

        states.append({
            "id": identifier,
            "name": _object_name(obj, index),
            "type": _normalise_type(obj.get("type", obj.get("object_type"))),
            "altitude_km": obj.get("altitude_km"),
            "speed_km_s": obj.get("velocity_km_s"),
        })
        satellites.append(satellite)

    matched = len(satellites)
    horizon_seconds = float(horizon_hours) * 3600.0
    segment_seconds = float(SEGMENT_MINUTES * 60)

    if matched < 2:
        return [], {
            "engine_status": "fallback-required",
            "objects_requested": len(selected_objects),
            "objects_analyzed": matched,
            "omm_records_matched": matched,
            "omm_records_missing": missing_omm,
            "candidate_pairs": 0,
            "refined_pairs": 0,
            "pairs_evaluated": 0,
            "anchor_epochs": 0,
            "computation_seconds": round(time.perf_counter() - started, 3),
        }

    anchor_offsets = np.arange(
        0.0,
        horizon_seconds,
        segment_seconds,
        dtype=float,
    )

    candidate_map: dict[tuple[int, int], dict[str, float]] = {}
    pairs_evaluated = 0
    usable_anchor_epochs = 0

    for anchor_offset in anchor_offsets.tolist():
        anchor_time = source_time + timedelta(seconds=float(anchor_offset))
        positions, velocities, valid = _propagate_at(satellites, anchor_time)

        if int(np.count_nonzero(valid)) < 2:
            continue

        usable_anchor_epochs += 1
        segment_duration = min(
            segment_seconds,
            max(0.0, horizon_seconds - float(anchor_offset)),
        )

        local_candidates, local_pairs = _collect_linear_candidates(
            positions,
            velocities,
            valid,
            anchor_offset_seconds=float(anchor_offset),
            segment_seconds=segment_duration,
            candidate_distance_km=CANDIDATE_DISTANCE_KM,
        )
        pairs_evaluated += local_pairs

        for key, candidate in local_candidates.items():
            existing = candidate_map.get(key)
            if (
                existing is None
                or candidate["linear_miss_distance_km"]
                < existing["linear_miss_distance_km"]
            ):
                candidate_map[key] = candidate

    ranked_candidates = sorted(
        candidate_map.items(),
        key=lambda item: item[1]["linear_miss_distance_km"],
    )
    candidates_truncated = len(ranked_candidates) > MAX_CANDIDATES
    ranked_candidates = ranked_candidates[:MAX_CANDIDATES]

    raw_events: list[dict[str, Any]] = []
    refined_pairs = 0

    for (index_a, index_b), candidate in ranked_candidates:
        refined_pairs += 1
        result = _refine_candidate(
            satellites[index_a],
            satellites[index_b],
            source_time=source_time,
            predicted_tca_seconds=candidate["predicted_tca_seconds"],
            horizon_seconds=horizon_seconds,
            screening_distance_km=screening_distance_km,
        )
        if result is None:
            continue

        state_a = dict(states[index_a])
        state_b = dict(states[index_b])
        state_a["altitude_km"] = round(result["altitude_a_km"], 3)
        state_b["altitude_km"] = round(result["altitude_b_km"], 3)

        raw_events.append({
            "state_a": state_a,
            "state_b": state_b,
            "miss_distance_km": result["miss_distance_km"],
            "relative_velocity_km_s": result["relative_velocity_km_s"],
            "tca_seconds": result["tca_seconds"],
            "linear_candidate_distance_km": candidate["linear_miss_distance_km"],
        })

    raw_events.sort(
        key=lambda event: (
            float(event["miss_distance_km"]),
            float(event["tca_seconds"]),
        )
    )

    refined_events_total = len(raw_events)
    returned_event_count = min(refined_events_total, max_events)
    events_truncated = refined_events_total > max_events
    coverage_status = (
        "partial"
        if candidates_truncated or events_truncated
        else "complete"
    )

    return raw_events[:max_events], {
        "engine_status": "ok",
        "coverage_status": coverage_status,
        "objects_requested": len(selected_objects),
        "objects_analyzed": matched,
        "omm_records_matched": matched,
        "omm_records_missing": missing_omm,
        "segment_minutes": SEGMENT_MINUTES,
        "anchor_epochs": usable_anchor_epochs,
        "candidate_distance_km": CANDIDATE_DISTANCE_KM,
        "candidate_pairs": len(candidate_map),
        "candidate_pairs_refined": refined_pairs,
        "candidates_truncated": candidates_truncated,
        "max_candidates": MAX_CANDIDATES,
        "refined_pairs": refined_pairs,
        "refined_events_total": refined_events_total,
        "events_returned": returned_event_count,
        "events_truncated": events_truncated,
        "pairs_evaluated": pairs_evaluated,
        "coarse_refinement_step_seconds": COARSE_REFINEMENT_STEP_SECONDS,
        "fine_refinement_step_seconds": FINE_REFINEMENT_STEP_SECONDS,
        "computation_seconds": round(time.perf_counter() - started, 3),
    }
