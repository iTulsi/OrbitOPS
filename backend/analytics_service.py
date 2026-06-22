"""Real-data analytics aggregation for OrbitOPS.

The service reads the latest live orbital and conjunction snapshots, computes
sample-based metrics, records genuine observation history, and never fabricates
trend points or collision probabilities.
"""

from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import threading
import time
from typing import Any, Iterable


DATA_DIR = Path(__file__).resolve().parent / "data"
ANALYTICS_SNAPSHOT_PATH = DATA_DIR / "analytics_snapshot.json"
ANALYTICS_HISTORY_PATH = DATA_DIR / "analytics_history.json"

LIVE_SNAPSHOT_CANDIDATES = (
    DATA_DIR / "live_orbit_snapshot.json",
    DATA_DIR / "orbit_snapshot.json",
    DATA_DIR / "orbital_snapshot.json",
)

CONJUNCTION_SNAPSHOT_CANDIDATES = (
    DATA_DIR / "conjunction_snapshot.json",
    DATA_DIR / "conjunctions_snapshot.json",
)

EARTH_RADIUS_KM = 6371.0
REFRESH_LOCK = threading.Lock()
REFRESH_IN_PROGRESS = False
BACKGROUND_ERROR: str | None = None

WINDOWS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    temporary.replace(path)


def _first_payload(paths: Iterable[Path]) -> tuple[Any, Path | None]:
    for path in paths:
        payload = _read_json(path)
        if payload is not None:
            return payload, path
    return None, None


def _extract_list(payload: Any, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    for key in ("data", "snapshot", "result", "payload"):
        nested = payload.get(key)
        if isinstance(nested, (dict, list)):
            extracted = _extract_list(nested, keys)
            if extracted:
                return extracted

    return []


def _number(*values: Any) -> float | None:
    for value in values:
        if value is None or value == "":
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(parsed):
            return parsed
    return None


def _text(*values: Any, default: str = "") -> str:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return default


def _normalise_type(item: dict[str, Any]) -> str:
    raw = _text(
        item.get("type"),
        item.get("object_type"),
        item.get("objectType"),
        item.get("classification"),
        item.get("category"),
        default="UNKNOWN",
    ).upper().replace("-", "_").replace(" ", "_")

    if "DEBRIS" in raw or raw in {"DEB", "FRAGMENT"}:
        return "DEBRIS"
    if "ROCKET" in raw or raw in {"R/B", "RB", "ROCKET_BODY"}:
        return "ROCKET_BODY"
    if any(token in raw for token in ("SATELLITE", "PAYLOAD", "ACTIVE", "SPACECRAFT")):
        return "SATELLITE"
    return "UNKNOWN"


def _position_components(item: dict[str, Any]) -> tuple[float, float, float] | None:
    candidates = (
        item.get("position_eci_km"),
        item.get("position_km"),
        item.get("position"),
        item.get("eci_position"),
    )

    for value in candidates:
        if isinstance(value, dict):
            x = _number(value.get("x"), value.get("x_km"))
            y = _number(value.get("y"), value.get("y_km"))
            z = _number(value.get("z"), value.get("z_km"))
            if None not in (x, y, z):
                return float(x), float(y), float(z)
        if isinstance(value, (list, tuple)) and len(value) >= 3:
            x, y, z = (_number(value[0]), _number(value[1]), _number(value[2]))
            if None not in (x, y, z):
                return float(x), float(y), float(z)

    x = _number(item.get("x"), item.get("x_km"), item.get("eci_x_km"))
    y = _number(item.get("y"), item.get("y_km"), item.get("eci_y_km"))
    z = _number(item.get("z"), item.get("z_km"), item.get("eci_z_km"))
    if None not in (x, y, z):
        return float(x), float(y), float(z)
    return None


def _altitude_km(item: dict[str, Any]) -> float | None:
    altitude = _number(
        item.get("altitude_km"),
        item.get("altitude"),
        item.get("height_km"),
        item.get("orbital_altitude_km"),
    )
    if altitude is not None:
        return max(0.0, altitude)

    components = _position_components(item)
    if components:
        radius = math.sqrt(sum(component * component for component in components))
        return max(0.0, radius - EARTH_RADIUS_KM)
    return None


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), timezone.utc)
        except (ValueError, OSError, OverflowError):
            return None

    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _event_object(event: dict[str, Any], side: str) -> dict[str, Any]:
    raw = event.get(side)
    if isinstance(raw, dict):
        result = dict(raw)
    else:
        result = {"name": raw} if raw else {}

    suffix = "a" if side.endswith("a") else "b"
    result.setdefault("name", event.get(f"object_{suffix}_name") or event.get(f"name_{suffix}"))
    result.setdefault("norad_id", event.get(f"object_{suffix}_norad_id") or event.get(f"norad_{suffix}"))
    result.setdefault("type", event.get(f"object_{suffix}_type") or event.get(f"type_{suffix}"))
    return result


def _severity(event: dict[str, Any]) -> str:
    raw = _text(
        event.get("severity"),
        event.get("risk_level"),
        event.get("risk"),
        default="",
    ).upper()

    if "CRITICAL" in raw:
        return "CRITICAL"
    if "HIGH" in raw:
        return "HIGH"
    if "MEDIUM" in raw or "MODERATE" in raw:
        return "MEDIUM"
    if "MONITOR" in raw or "LOW" in raw:
        return "MONITORED"

    score = _number(event.get("risk_index"), event.get("risk_score"), event.get("score"))
    if score is None:
        return "MONITORED"
    if score >= 85:
        return "CRITICAL"
    if score >= 65:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "MONITORED"


def _event_matches_type(event: dict[str, Any], selected_type: str) -> bool:
    if selected_type == "ALL":
        return True
    return any(
        _normalise_type(_event_object(event, side)) == selected_type
        for side in ("object_a", "object_b")
    )


def _normalise_event(event: dict[str, Any], index: int) -> dict[str, Any]:
    object_a = _event_object(event, "object_a")
    object_b = _event_object(event, "object_b")
    miss_distance = _number(
        event.get("miss_distance_km"),
        event.get("miss_distance"),
        event.get("closest_approach_km"),
        event.get("distance_km"),
    )
    relative_velocity = _number(
        event.get("relative_velocity_km_s"),
        event.get("relative_velocity"),
        event.get("velocity_km_s"),
    )
    risk_index = _number(event.get("risk_index"), event.get("risk_score"), event.get("score"))
    closest_approach = _text(
        event.get("closest_approach_utc"),
        event.get("closest_approach"),
        event.get("tca"),
        event.get("timestamp"),
        default="Not reported",
    )

    return {
        "id": _text(event.get("id"), event.get("event_id"), default=f"event-{index + 1}"),
        "severity": _severity(event),
        "object_a": {
            "name": _text(object_a.get("name"), object_a.get("object_name"), default="Unknown object"),
            "norad_id": _text(object_a.get("norad_id"), object_a.get("catalog_number"), default="—"),
            "type": _normalise_type(object_a),
        },
        "object_b": {
            "name": _text(object_b.get("name"), object_b.get("object_name"), default="Unknown object"),
            "norad_id": _text(object_b.get("norad_id"), object_b.get("catalog_number"), default="—"),
            "type": _normalise_type(object_b),
        },
        "closest_approach_utc": closest_approach,
        "miss_distance_km": miss_distance,
        "relative_velocity_km_s": relative_velocity,
        "risk_index": risk_index,
    }


def _orbital_region(altitude: float | None) -> str:
    if altitude is None:
        return "UNKNOWN"
    if altitude < 2000:
        return "LEO"
    if altitude < 30000:
        return "MEO"
    if altitude <= 40000:
        return "GEO"
    return "HEO"


def _distribution(counter: Counter[str], order: tuple[str, ...]) -> list[dict[str, Any]]:
    return [{"name": name, "value": int(counter.get(name, 0))} for name in order]


def _miss_distance_distribution(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    bins = [
        ("0–1", 0, 1),
        ("1–5", 1, 5),
        ("5–10", 5, 10),
        ("10–50", 10, 50),
        ("50–100", 50, 100),
        ("100–500", 100, 500),
        ("500+", 500, math.inf),
    ]
    counts = {label: 0 for label, _, _ in bins}

    for event in events:
        distance = event.get("miss_distance_km")
        if distance is None:
            continue
        for label, lower, upper in bins:
            if lower <= distance < upper:
                counts[label] += 1
                break

    return [{"name": label, "value": counts[label]} for label, _, _ in bins]


def _catalog_dynamics(objects: list[dict[str, Any]]) -> dict[str, Any]:
    now = _utc_now()
    threshold = now - timedelta(days=30)
    launches = 0
    decays = 0
    has_launch_metadata = False
    has_decay_metadata = False

    for item in objects:
        launch = _parse_datetime(item.get("launch_date") or item.get("launchDate"))
        decay = _parse_datetime(item.get("decay_date") or item.get("decayDate"))
        if launch:
            has_launch_metadata = True
            if launch >= threshold:
                launches += 1
        if decay:
            has_decay_metadata = True
            if decay >= threshold:
                decays += 1

    return {
        "launches_30d": launches if has_launch_metadata else None,
        "decays_30d": decays if has_decay_metadata else None,
        "launch_metadata_available": has_launch_metadata,
        "decay_metadata_available": has_decay_metadata,
    }


def _history() -> list[dict[str, Any]]:
    payload = _read_json(ANALYTICS_HISTORY_PATH)
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _append_history(summary: dict[str, Any], severity: Counter[str]) -> list[dict[str, Any]]:
    records = _history()
    now = _utc_now()
    last_time = _parse_datetime(records[-1].get("timestamp")) if records else None

    if last_time is None or now - last_time >= timedelta(minutes=15):
        records.append({
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "total_objects": summary["total_objects"],
            "satellites": summary["satellites"],
            "debris": summary["debris"],
            "rocket_bodies": summary["rocket_bodies"],
            "critical": int(severity.get("CRITICAL", 0)),
            "high": int(severity.get("HIGH", 0)),
            "medium": int(severity.get("MEDIUM", 0)),
            "monitored": int(severity.get("MONITORED", 0)),
        })

    cutoff = now - timedelta(days=30)
    records = [
        item for item in records
        if (_parse_datetime(item.get("timestamp")) or now) >= cutoff
    ][-2880:]
    _write_json(ANALYTICS_HISTORY_PATH, records)
    return records


def _filter_history(records: list[dict[str, Any]], window: str, object_type: str) -> list[dict[str, Any]]:
    duration = WINDOWS.get(window, WINDOWS["7d"])
    cutoff = _utc_now() - duration
    filtered = []

    type_field = {
        "SATELLITE": "satellites",
        "DEBRIS": "debris",
        "ROCKET_BODY": "rocket_bodies",
    }.get(object_type)

    for record in records:
        timestamp = _parse_datetime(record.get("timestamp"))
        if timestamp is None or timestamp < cutoff:
            continue
        item = dict(record)
        if type_field:
            item["total_objects"] = int(item.get(type_field, 0))
            for field in ("satellites", "debris", "rocket_bodies"):
                if field != type_field:
                    item[field] = 0
        filtered.append(item)
    return filtered


def _build_insights(
    summary: dict[str, Any],
    region_counts: Counter[str],
    severity: Counter[str],
    events: list[dict[str, Any]],
    history_records: list[dict[str, Any]],
) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []

    type_counts = {
        "satellites": summary["satellites"],
        "debris": summary["debris"],
        "rocket bodies": summary["rocket_bodies"],
    }
    dominant_type, dominant_count = max(type_counts.items(), key=lambda pair: pair[1])
    if summary["total_objects"]:
        share = (dominant_count / summary["total_objects"]) * 100
        insights.append({
            "level": "info",
            "text": f"{dominant_type.title()} form the largest class in this frame ({share:.1f}%).",
        })

    known_regions = {key: value for key, value in region_counts.items() if key != "UNKNOWN"}
    if known_regions:
        region, count = max(known_regions.items(), key=lambda pair: pair[1])
        known_total = sum(known_regions.values()) or 1
        insights.append({
            "level": "info",
            "text": f"{region} is the most populated orbital region in the current sample ({count / known_total * 100:.1f}%).",
        })

    elevated = int(severity.get("CRITICAL", 0) + severity.get("HIGH", 0))
    if elevated:
        insights.append({
            "level": "warning",
            "text": f"{elevated} elevated conjunction event{'s' if elevated != 1 else ''} require priority review.",
        })
    else:
        insights.append({
            "level": "success",
            "text": "No critical or high-severity conjunctions are present in the latest screened result.",
        })

    with_distance = [event for event in events if event.get("miss_distance_km") is not None]
    if with_distance:
        closest = min(with_distance, key=lambda item: item["miss_distance_km"])
        insights.append({
            "level": "warning" if closest["miss_distance_km"] < 5 else "info",
            "text": (
                f"Closest screened approach is {closest['miss_distance_km']:.3f} km: "
                f"{closest['object_a']['name']} vs {closest['object_b']['name']}."
            ),
        })

    if len(history_records) < 2:
        insights.append({
            "level": "neutral",
            "text": "Trend history has started recording; change percentages appear after a second genuine sample.",
        })

    return insights[:5]


def _change(current: int, history_records: list[dict[str, Any]], field: str) -> float | None:
    if len(history_records) < 2:
        return None
    previous = _number(history_records[-2].get(field))
    if previous in (None, 0):
        return None
    return ((current - previous) / previous) * 100


def _change_sum(
    current: int,
    history_records: list[dict[str, Any]],
    fields: tuple[str, ...],
) -> float | None:
    if len(history_records) < 2:
        return None
    previous_values = [_number(history_records[-2].get(field)) or 0 for field in fields]
    previous = sum(previous_values)
    if previous == 0:
        return None
    return ((current - previous) / previous) * 100


def _empty_payload(message: str) -> dict[str, Any]:
    return {
        "status": "warming",
        "message": message,
        "source": "CelesTrak + SGP4",
        "generated_at": _iso_now(),
        "refresh_in_progress": REFRESH_IN_PROGRESS,
        "background_refresh_error": BACKGROUND_ERROR,
        "summary": {
            "total_objects": 0,
            "satellites": 0,
            "debris": 0,
            "rocket_bodies": 0,
            "unknown": 0,
            "critical_events": 0,
            "high_events": 0,
            "medium_events": 0,
            "monitored_events": 0,
            "screened_events": 0,
            "screened_objects": 0,
            "changes": {},
        },
        "object_distribution": [],
        "orbital_regions": [],
        "severity_distribution": [],
        "miss_distance_distribution": [],
        "history": [],
        "top_pairs": [],
        "catalog_dynamics": {
            "launches_30d": None,
            "decays_30d": None,
            "launch_metadata_available": False,
            "decay_metadata_available": False,
        },
        "insights": [],
        "diagnostics": {"objects_analyzed": 0, "events_analyzed": 0},
    }


def _build_payload(
    objects: list[dict[str, Any]],
    raw_events: list[dict[str, Any]],
    *,
    source: str,
    window: str,
    object_type: str,
    record_history: bool,
) -> dict[str, Any]:
    selected_type = object_type if object_type in {"ALL", "SATELLITE", "DEBRIS", "ROCKET_BODY"} else "ALL"
    typed_objects = [(item, _normalise_type(item)) for item in objects]
    filtered_objects = [item for item, item_type in typed_objects if selected_type == "ALL" or item_type == selected_type]
    filtered_types = [_normalise_type(item) for item in filtered_objects]

    events = [
        _normalise_event(event, index)
        for index, event in enumerate(raw_events)
        if _event_matches_type(event, selected_type)
    ]

    type_counts = Counter(filtered_types)
    region_counts = Counter(_orbital_region(_altitude_km(item)) for item in filtered_objects)
    severity = Counter(event["severity"] for event in events)

    summary = {
        "total_objects": len(filtered_objects),
        "satellites": int(type_counts.get("SATELLITE", 0)),
        "debris": int(type_counts.get("DEBRIS", 0)),
        "rocket_bodies": int(type_counts.get("ROCKET_BODY", 0)),
        "unknown": int(type_counts.get("UNKNOWN", 0)),
        "critical_events": int(severity.get("CRITICAL", 0)),
        "high_events": int(severity.get("HIGH", 0)),
        "medium_events": int(severity.get("MEDIUM", 0)),
        "monitored_events": int(severity.get("MONITORED", 0)),
        "screened_events": len(events),
        "screened_objects": len(objects),
    }

    if record_history:
        history_records = _append_history(summary, severity)
    else:
        history_records = _history()

    visible_history = _filter_history(history_records, window, selected_type)
    summary["changes"] = {
        "total_objects": _change(summary["total_objects"], visible_history, "total_objects"),
        "satellites": _change(summary["satellites"], visible_history, "satellites"),
        "debris": _change(summary["debris"], visible_history, "debris"),
        "rocket_bodies": _change(summary["rocket_bodies"], visible_history, "rocket_bodies"),
        "high_events": _change_sum(
            summary["critical_events"] + summary["high_events"],
            visible_history,
            ("critical", "high"),
        ),
        "monitored_events": _change(summary["monitored_events"], visible_history, "monitored"),
    }

    top_pairs = sorted(
        events,
        key=lambda event: (
            -(event.get("risk_index") if event.get("risk_index") is not None else -1),
            event.get("miss_distance_km") if event.get("miss_distance_km") is not None else math.inf,
        ),
    )[:10]

    payload = {
        "status": "live",
        "source": source or "CelesTrak + SGP4",
        "generated_at": _iso_now(),
        "refresh_in_progress": REFRESH_IN_PROGRESS,
        "background_refresh_error": BACKGROUND_ERROR,
        "window": window,
        "object_type": selected_type,
        "summary": summary,
        "object_distribution": _distribution(
            type_counts,
            ("SATELLITE", "DEBRIS", "ROCKET_BODY", "UNKNOWN"),
        ),
        "orbital_regions": _distribution(
            region_counts,
            ("LEO", "MEO", "GEO", "HEO", "UNKNOWN"),
        ),
        "severity_distribution": _distribution(
            severity,
            ("CRITICAL", "HIGH", "MEDIUM", "MONITORED"),
        ),
        "miss_distance_distribution": _miss_distance_distribution(events),
        "history": visible_history,
        "top_pairs": top_pairs,
        "catalog_dynamics": _catalog_dynamics(filtered_objects),
        "insights": _build_insights(summary, region_counts, severity, events, visible_history),
        "diagnostics": {
            "objects_analyzed": len(filtered_objects),
            "objects_in_live_frame": len(objects),
            "events_analyzed": len(events),
            "history_samples": len(visible_history),
            "sample_based": True,
            "note": (
                "Analytics reflect the latest OrbitOPS live frame and cached conjunction screening, "
                "not the entire global catalog unless the live frame contains it."
            ),
        },
    }
    return payload


def _load_live_data() -> tuple[list[dict[str, Any]], str]:
    payload, _ = _first_payload(LIVE_SNAPSHOT_CANDIDATES)
    objects = _extract_list(payload, ("objects", "satellites", "items"))
    source = "CelesTrak + SGP4"
    if isinstance(payload, dict):
        source = _text(payload.get("source_name"), payload.get("source"), default=source)
    return objects, source


def _load_conjunction_data() -> list[dict[str, Any]]:
    payload, _ = _first_payload(CONJUNCTION_SNAPSHOT_CANDIDATES)
    return _extract_list(payload, ("events", "conjunctions", "results"))


def _background_refresh() -> None:
    global REFRESH_IN_PROGRESS, BACKGROUND_ERROR
    try:
        result = None
        try:
            from tle_parser import get_orbital_data  # type: ignore
            try:
                result = get_orbital_data(force_refresh=True)
            except TypeError:
                result = get_orbital_data()
        except Exception as exc:  # Network/parser failures must not remove cached UI data.
            BACKGROUND_ERROR = str(exc)

        objects = _extract_list(result, ("objects", "satellites", "items"))
        source = "CelesTrak + SGP4"
        if isinstance(result, dict):
            source = _text(result.get("source_name"), result.get("source"), default=source)

        if not objects:
            objects, source = _load_live_data()

        if objects:
            payload = _build_payload(
                objects,
                _load_conjunction_data(),
                source=source,
                window="7d",
                object_type="ALL",
                record_history=True,
            )
            payload["refresh_in_progress"] = False
            _write_json(ANALYTICS_SNAPSHOT_PATH, payload)
            BACKGROUND_ERROR = None
    finally:
        with REFRESH_LOCK:
            REFRESH_IN_PROGRESS = False


def _start_background_refresh() -> None:
    global REFRESH_IN_PROGRESS
    with REFRESH_LOCK:
        if REFRESH_IN_PROGRESS:
            return
        REFRESH_IN_PROGRESS = True
    thread = threading.Thread(target=_background_refresh, name="orbitops-analytics-refresh", daemon=True)
    thread.start()


def get_analytics_payload(
    *,
    window: str = "7d",
    object_type: str = "ALL",
    refresh: bool = False,
) -> dict[str, Any]:
    """Return a fast analytics response and refresh slow external data in background."""

    safe_window = window if window in WINDOWS else "7d"
    safe_type = object_type.upper().replace(" ", "_")
    if safe_type not in {"ALL", "SATELLITE", "DEBRIS", "ROCKET_BODY"}:
        safe_type = "ALL"

    objects, source = _load_live_data()
    events = _load_conjunction_data()

    if objects:
        payload = _build_payload(
            objects,
            events,
            source=source,
            window=safe_window,
            object_type=safe_type,
            record_history=safe_type == "ALL",
        )
        if safe_type == "ALL":
            _write_json(ANALYTICS_SNAPSHOT_PATH, payload)
        if refresh:
            _start_background_refresh()
            payload["refresh_in_progress"] = True
        return payload

    cached = _read_json(ANALYTICS_SNAPSHOT_PATH)
    _start_background_refresh()

    if isinstance(cached, dict):
        payload = deepcopy(cached)
        payload["status"] = "stale"
        payload["message"] = "Showing the last completed analytics frame while live orbital data reconnects."
        payload["refresh_in_progress"] = True
        payload["background_refresh_error"] = BACKGROUND_ERROR
        return payload

    return _empty_payload(
        "OrbitOPS is preparing the first analytics frame from the real live orbital snapshot."
    )
