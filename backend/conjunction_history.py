from __future__ import annotations

import json
import math
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent / "data"
HISTORY_PATH = DATA_DIR / "conjunction_history.json"

MAX_TRACKED_EVENTS = max(
    500,
    int(os.environ.get("CONJUNCTION_HISTORY_MAX_EVENTS", "5000")),
)
MAX_OBSERVATIONS = max(
    3,
    int(os.environ.get("CONJUNCTION_HISTORY_MAX_OBSERVATIONS", "20")),
)
RETENTION_DAYS = max(
    1,
    int(os.environ.get("CONJUNCTION_HISTORY_RETENTION_DAYS", "30")),
)

_LOCK = threading.RLock()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime | None = None) -> str:
    return (value or _utc_now()).astimezone(timezone.utc).isoformat().replace(
        "+00:00",
        "Z",
    )


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


def _safe_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _empty_history() -> dict[str, Any]:
    return {
        "version": 1,
        "updated_at": None,
        "last_coverage_status": None,
        "lifecycle_summary": {
            "active": 0,
            "unconfirmed": 0,
            "resolved": 0,
            "tracked_total": 0,
        },
        "events": {},
    }


def _read_history() -> dict[str, Any]:
    try:
        payload = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return _empty_history()

    if not isinstance(payload, dict):
        return _empty_history()
    if not isinstance(payload.get("events"), dict):
        payload["events"] = {}
    return payload


def _write_history(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = HISTORY_PATH.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(HISTORY_PATH)


def _severity_rank(value: Any) -> int:
    return {
        "MONITORED": 0,
        "LOW": 0,
        "MEDIUM": 1,
        "HIGH": 2,
        "CRITICAL": 3,
    }.get(str(value or "").upper(), 0)


def _event_snapshot(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event.get("id"),
        "risk_level": (
            event.get("screening_priority_level")
            or event.get("risk_level")
            or "MONITORED"
        ),
        "risk_score": _safe_float(
            event.get("screening_priority_score", event.get("risk_score"))
        ),
        "miss_distance_km": _safe_float(event.get("miss_distance_km")),
        "relative_velocity_km_s": _safe_float(
            event.get("relative_velocity_km_s")
        ),
        "closest_approach_utc": event.get("closest_approach_utc"),
        "time_to_closest_approach_hours": _safe_float(
            event.get("time_to_closest_approach_hours")
        ),
        "object_a": event.get("object_a"),
        "object_b": event.get("object_b"),
        "model_basis": event.get("model_basis"),
        "screening_method": event.get("screening_method"),
        "source_position_timestamp": event.get("source_position_timestamp"),
    }


def _classify_change(
    previous: dict[str, Any],
    current: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    previous_score = _safe_float(previous.get("risk_score"))
    current_score = _safe_float(current.get("risk_score"))
    previous_distance = _safe_float(previous.get("miss_distance_km"))
    current_distance = _safe_float(current.get("miss_distance_km"))

    score_delta = (
        current_score - previous_score
        if current_score is not None and previous_score is not None
        else None
    )
    distance_delta = (
        current_distance - previous_distance
        if current_distance is not None and previous_distance is not None
        else None
    )

    worsened = (
        _severity_rank(current.get("risk_level"))
        > _severity_rank(previous.get("risk_level"))
        or (score_delta is not None and score_delta >= 5.0)
        or (
            previous_distance is not None
            and previous_distance > 0
            and current_distance is not None
            and current_distance <= previous_distance * 0.85
        )
    )
    improved = (
        _severity_rank(current.get("risk_level"))
        < _severity_rank(previous.get("risk_level"))
        or (score_delta is not None and score_delta <= -5.0)
        or (
            previous_distance is not None
            and previous_distance > 0
            and current_distance is not None
            and current_distance >= previous_distance * 1.15
        )
    )

    change_type = "worsening" if worsened else "improving" if improved else "stable"

    return change_type, {
        "previous_risk_level": previous.get("risk_level"),
        "previous_risk_score": previous_score,
        "previous_miss_distance_km": previous_distance,
        "risk_score_delta": round(score_delta, 3) if score_delta is not None else None,
        "miss_distance_delta_km": (
            round(distance_delta, 3) if distance_delta is not None else None
        ),
    }


def _observation(
    current: dict[str, Any],
    *,
    observed_at: str,
    change_type: str,
) -> dict[str, Any]:
    return {
        "observed_at": observed_at,
        "change_type": change_type,
        "risk_level": current.get("risk_level"),
        "risk_score": current.get("risk_score"),
        "miss_distance_km": current.get("miss_distance_km"),
        "relative_velocity_km_s": current.get("relative_velocity_km_s"),
        "closest_approach_utc": current.get("closest_approach_utc"),
    }


def _prune(
    records: dict[str, dict[str, Any]],
    *,
    now: datetime,
) -> dict[str, dict[str, Any]]:
    cutoff = now - timedelta(days=RETENTION_DAYS)
    kept: list[tuple[str, dict[str, Any]]] = []

    for event_id, record in records.items():
        if not isinstance(record, dict):
            continue
        if record.get("status") == "resolved":
            resolved_at = _parse_utc(record.get("resolved_at"))
            if resolved_at is not None and resolved_at < cutoff:
                continue
        kept.append((event_id, record))

    status_rank = {"active": 0, "unconfirmed": 1, "resolved": 2}
    kept.sort(
        key=lambda item: (
            status_rank.get(str(item[1].get("status") or "active"), 3),
            str(item[1].get("last_seen_at") or ""),
        )
    )
    return dict(kept[:MAX_TRACKED_EVENTS])


def enrich_conjunction_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Persist lifecycle state and enrich the current conjunction response."""
    with _LOCK:
        history = _read_history()
        records = history.get("events")
        records = records if isinstance(records, dict) else {}

        current_events = (
            snapshot.get("events")
            if isinstance(snapshot.get("events"), list)
            else []
        )
        diagnostics = (
            snapshot.get("diagnostics")
            if isinstance(snapshot.get("diagnostics"), dict)
            else {}
        )
        coverage = str(
            snapshot.get("coverage_status")
            or diagnostics.get("coverage_status")
            or "unknown"
        ).lower()

        observed_at = str(snapshot.get("last_updated") or _iso_utc())
        observed_datetime = _parse_utc(observed_at) or _utc_now()

        current_ids: set[str] = set()
        enriched_events: list[dict[str, Any]] = []
        changes: list[dict[str, Any]] = []
        counts = {
            "new": 0,
            "worsening": 0,
            "improving": 0,
            "stable": 0,
            "reappeared": 0,
            "resolved": 0,
            "unconfirmed": 0,
        }

        for event in current_events:
            if not isinstance(event, dict):
                continue

            event_id = str(event.get("id") or "").strip()
            if not event_id:
                continue

            current_ids.add(event_id)
            current = _event_snapshot(event)
            existing = records.get(event_id)
            existing = existing if isinstance(existing, dict) else None

            if existing is None:
                change_type = "new"
                change_meta = {
                    "previous_risk_level": None,
                    "previous_risk_score": None,
                    "previous_miss_distance_km": None,
                    "risk_score_delta": None,
                    "miss_distance_delta_km": None,
                }
                first_seen_at = observed_at
                observation_count = 1
                observations: list[dict[str, Any]] = []
            else:
                previous = existing.get("current")
                previous = previous if isinstance(previous, dict) else {}

                if existing.get("status") in {"resolved", "unconfirmed"}:
                    change_type = "reappeared"
                    change_meta = {
                        "previous_risk_level": previous.get("risk_level"),
                        "previous_risk_score": _safe_float(previous.get("risk_score")),
                        "previous_miss_distance_km": _safe_float(
                            previous.get("miss_distance_km")
                        ),
                        "risk_score_delta": None,
                        "miss_distance_delta_km": None,
                    }
                else:
                    change_type, change_meta = _classify_change(previous, current)

                first_seen_at = existing.get("first_seen_at") or observed_at
                observation_count = int(existing.get("observation_count") or 0) + 1
                previous_observations = existing.get("observations")
                observations = (
                    list(previous_observations)
                    if isinstance(previous_observations, list)
                    else []
                )

            observations.append(
                _observation(
                    current,
                    observed_at=observed_at,
                    change_type=change_type,
                )
            )
            observations = observations[-MAX_OBSERVATIONS:]

            records[event_id] = {
                "id": event_id,
                "status": "active",
                "first_seen_at": first_seen_at,
                "last_seen_at": observed_at,
                "resolved_at": None,
                "unconfirmed_since": None,
                "observation_count": observation_count,
                "last_change_type": change_type,
                "current": current,
                "observations": observations,
            }

            lifecycle = {
                "status": "active",
                "change_type": change_type,
                "first_seen_at": first_seen_at,
                "last_seen_at": observed_at,
                "observation_count": observation_count,
                **change_meta,
            }

            enriched = dict(event)
            enriched["lifecycle"] = lifecycle
            enriched_events.append(enriched)

            counts[change_type] += 1
            if change_type != "stable":
                changes.append({
                    "event_id": event_id,
                    "change_type": change_type,
                    "status": "active",
                    "object_a": event.get("object_a"),
                    "object_b": event.get("object_b"),
                    "risk_level": current.get("risk_level"),
                    "risk_score": current.get("risk_score"),
                    "miss_distance_km": current.get("miss_distance_km"),
                    "closest_approach_utc": current.get("closest_approach_utc"),
                    **change_meta,
                })

        for event_id, record in list(records.items()):
            if event_id in current_ids or not isinstance(record, dict):
                continue
            if record.get("status") == "resolved":
                continue

            if coverage == "complete":
                record["status"] = "resolved"
                record["resolved_at"] = observed_at
                record["last_change_type"] = "resolved"
                counts["resolved"] += 1
                changes.append({
                    "event_id": event_id,
                    "change_type": "resolved",
                    "status": "resolved",
                    "last_seen_at": record.get("last_seen_at"),
                    "resolved_at": observed_at,
                })
            else:
                if record.get("status") != "unconfirmed":
                    record["unconfirmed_since"] = observed_at
                    record["last_change_type"] = "unconfirmed"
                    counts["unconfirmed"] += 1
                    changes.append({
                        "event_id": event_id,
                        "change_type": "unconfirmed",
                        "status": "unconfirmed",
                        "last_seen_at": record.get("last_seen_at"),
                        "reason": (
                            "Event was absent from a partial screening result "
                            "and cannot be resolved safely."
                        ),
                    })
                record["status"] = "unconfirmed"

        records = _prune(records, now=observed_datetime)

        lifecycle_summary = {
            "active": 0,
            "unconfirmed": 0,
            "resolved": 0,
            "tracked_total": len(records),
        }
        for record in records.values():
            status = str(record.get("status") or "active")
            if status not in {"active", "unconfirmed", "resolved"}:
                status = "active"
            lifecycle_summary[status] += 1

        history_payload = {
            "version": 1,
            "updated_at": observed_at,
            "last_coverage_status": coverage,
            "retention_days": RETENTION_DAYS,
            "max_tracked_events": MAX_TRACKED_EVENTS,
            "max_observations_per_event": MAX_OBSERVATIONS,
            "lifecycle_summary": lifecycle_summary,
            "events": records,
        }
        _write_history(history_payload)

        response = dict(snapshot)
        response["events"] = enriched_events
        response["history_status"] = "tracking"
        response["lifecycle_summary"] = lifecycle_summary
        response["changes"] = {
            "generated_at": observed_at,
            "coverage_status": coverage,
            "resolution_policy": (
                "Absent events resolve only after complete screening."
            ),
            "counts": counts,
            "items": changes[:200],
        }
        return response


def get_history_snapshot(
    *,
    limit: int = 250,
    status: str | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 250), 1000))
    requested_status = str(status or "all").strip().lower()

    if requested_status not in {"all", "active", "unconfirmed", "resolved"}:
        raise ValueError(
            "status must be one of: all, active, unconfirmed, resolved"
        )

    with _LOCK:
        history = _read_history()

    records = history.get("events")
    records = records if isinstance(records, dict) else {}

    result = []
    for record in records.values():
        if not isinstance(record, dict):
            continue
        record_status = str(record.get("status") or "active")
        if requested_status != "all" and record_status != requested_status:
            continue
        result.append(record)

    result.sort(
        key=lambda record: (
            record.get("status") != "active",
            -float(
                _safe_float(record.get("current", {}).get("risk_score")) or 0.0
            ),
            str(record.get("last_seen_at") or ""),
        )
    )

    return {
        "status": "ok",
        "updated_at": history.get("updated_at"),
        "last_coverage_status": history.get("last_coverage_status"),
        "filter": requested_status,
        "count": min(len(result), safe_limit),
        "total_matching": len(result),
        "lifecycle_summary": history.get(
            "lifecycle_summary",
            _empty_history()["lifecycle_summary"],
        ),
        "events": result[:safe_limit],
    }
