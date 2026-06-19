from __future__ import annotations

import math
import os
from typing import Any


MAX_SOCKET_ALERTS = max(
    1,
    min(
        int(os.environ.get("CONJUNCTION_SOCKET_MAX_ALERTS", "50")),
        200,
    ),
)

SIGNIFICANT_CHANGE_TYPES = {
    "new",
    "worsening",
    "reappeared",
    "resolved",
}

_NEW_EVENT_LEVELS = {"HIGH", "CRITICAL"}

_CHANGE_PRIORITY = {
    "worsening": 0,
    "reappeared": 1,
    "new": 2,
    "resolved": 3,
}

_SEVERITY_PRIORITY = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "MONITORED": 3,
    "LOW": 3,
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _coverage_status(snapshot: dict[str, Any]) -> str:
    diagnostics = (
        snapshot.get("diagnostics")
        if isinstance(snapshot.get("diagnostics"), dict)
        else {}
    )
    return str(
        snapshot.get("coverage_status")
        or diagnostics.get("coverage_status")
        or "unknown"
    ).lower()


def _is_eligible_change(
    item: dict[str, Any],
    *,
    coverage_status: str,
) -> bool:
    change_type = str(item.get("change_type") or "").lower()
    if change_type not in SIGNIFICANT_CHANGE_TYPES:
        return False

    if change_type == "resolved":
        return coverage_status == "complete"

    if change_type == "new":
        risk_level = str(item.get("risk_level") or "").upper()
        return risk_level in _NEW_EVENT_LEVELS

    return True


def _alert_sort_key(item: dict[str, Any]) -> tuple[int, int, float, float]:
    change_type = str(item.get("change_type") or "").lower()
    risk_level = str(item.get("risk_level") or "MONITORED").upper()
    risk_score = _safe_float(item.get("risk_score"))
    miss_distance = _safe_float(
        item.get("miss_distance_km"),
        default=math.inf,
    )

    return (
        _CHANGE_PRIORITY.get(change_type, 99),
        _SEVERITY_PRIORITY.get(risk_level, 99),
        -risk_score,
        miss_distance,
    )


def _build_alert(
    item: dict[str, Any],
    *,
    observed_at: Any,
    coverage_status: str,
) -> dict[str, Any]:
    return {
        "event_id": item.get("event_id"),
        "type": str(item.get("change_type") or "").lower(),
        "status": item.get("status", "active"),
        "observed_at": observed_at,
        "coverage_status": coverage_status,
        "risk_level": item.get("risk_level"),
        "risk_score": item.get("risk_score"),
        "miss_distance_km": item.get("miss_distance_km"),
        "closest_approach_utc": item.get("closest_approach_utc"),
        "object_a": item.get("object_a"),
        "object_b": item.get("object_b"),
        "previous_risk_level": item.get("previous_risk_level"),
        "previous_risk_score": item.get("previous_risk_score"),
        "previous_miss_distance_km": item.get(
            "previous_miss_distance_km"
        ),
        "risk_score_delta": item.get("risk_score_delta"),
        "miss_distance_delta_km": item.get(
            "miss_distance_delta_km"
        ),
        "resolved_at": item.get("resolved_at"),
        "last_seen_at": item.get("last_seen_at"),
    }


def build_screening_complete_payload(
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    diagnostics = (
        snapshot.get("diagnostics")
        if isinstance(snapshot.get("diagnostics"), dict)
        else {}
    )
    changes = (
        snapshot.get("changes")
        if isinstance(snapshot.get("changes"), dict)
        else {}
    )

    diagnostic_fields = (
        "engine_status",
        "coverage_status",
        "objects_analyzed",
        "omm_records_matched",
        "omm_records_missing",
        "anchor_epochs",
        "candidate_pairs",
        "candidate_pairs_refined",
        "candidates_truncated",
        "refined_pairs",
        "refined_events_total",
        "events_truncated",
        "computation_seconds",
    )

    return {
        "status": snapshot.get("status"),
        "last_updated": snapshot.get("last_updated"),
        "source_position_timestamp": snapshot.get(
            "source_position_timestamp"
        ),
        "source_signature": snapshot.get("source_signature"),
        "model_type": snapshot.get("model_type"),
        "screening_stage": snapshot.get("screening_stage"),
        "coverage_status": _coverage_status(snapshot),
        "summary_status": snapshot.get("summary_status"),
        "summary": snapshot.get("summary", {}),
        "lifecycle_summary": snapshot.get(
            "lifecycle_summary",
            {},
        ),
        "change_counts": changes.get("counts", {}),
        "diagnostics": {
            key: diagnostics.get(key)
            for key in diagnostic_fields
            if key in diagnostics
        },
    }


def build_realtime_payloads(
    snapshot: dict[str, Any],
    *,
    max_alerts: int = MAX_SOCKET_ALERTS,
) -> tuple[
    list[dict[str, Any]],
    dict[str, Any],
    dict[str, Any],
]:
    coverage_status = _coverage_status(snapshot)
    changes = (
        snapshot.get("changes")
        if isinstance(snapshot.get("changes"), dict)
        else {}
    )
    change_items = (
        changes.get("items")
        if isinstance(changes.get("items"), list)
        else []
    )

    eligible_items = [
        item
        for item in change_items
        if isinstance(item, dict)
        and _is_eligible_change(
            item,
            coverage_status=coverage_status,
        )
    ]
    eligible_items.sort(key=_alert_sort_key)

    safe_limit = max(1, min(int(max_alerts or 1), 200))
    selected_items = eligible_items[:safe_limit]
    observed_at = (
        changes.get("generated_at")
        or snapshot.get("last_updated")
    )

    alerts = [
        _build_alert(
            item,
            observed_at=observed_at,
            coverage_status=coverage_status,
        )
        for item in selected_items
    ]

    batch_payload = {
        "status": "ok",
        "generated_at": observed_at,
        "snapshot_updated_at": snapshot.get("last_updated"),
        "source_position_timestamp": snapshot.get(
            "source_position_timestamp"
        ),
        "coverage_status": coverage_status,
        "resolution_policy": changes.get("resolution_policy"),
        "change_counts": changes.get("counts", {}),
        "lifecycle_summary": snapshot.get(
            "lifecycle_summary",
            {},
        ),
        "screening_summary": snapshot.get("summary", {}),
        "eligible_alerts": len(eligible_items),
        "alerts_emitted": len(alerts),
        "alerts_truncated": len(eligible_items) > len(alerts),
        "alerts": alerts,
    }

    completion_payload = build_screening_complete_payload(snapshot)
    completion_payload["eligible_alerts"] = len(eligible_items)
    completion_payload["alerts_emitted"] = len(alerts)
    completion_payload["alerts_truncated"] = (
        len(eligible_items) > len(alerts)
    )

    return alerts, batch_payload, completion_payload
