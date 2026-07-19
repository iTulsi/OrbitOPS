import sys
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from conjunction_service import (  # noqa: E402
    _event_identifier,
    _screen_objects,
    _summary,
)


def test_event_identifier_is_stable_and_pair_order_independent():
    first = _event_identifier("25544", "99999")
    second = _event_identifier("99999", "25544")

    assert first == second
    assert first.startswith("CONJ-")


def test_linear_screening_computes_tca_from_source_timestamp():
    objects = [
        {
            "id": "A",
            "name": "Object A",
            "type": "SATELLITE",
            "altitude_km": 629.0,
            "position_eci_km": [7000.0, 0.0, 0.0],
            "velocity_eci_km_s": [0.0, 0.0, 0.0],
        },
        {
            "id": "B",
            "name": "Object B",
            "type": "DEBRIS",
            "altitude_km": 629.0,
            "position_eci_km": [7001.0, 10.0, 0.0],
            "velocity_eci_km_s": [0.0, -1.0, 0.0],
        },
    ]

    events, diagnostics = _screen_objects(
        objects,
        source_timestamp="2026-06-19T12:00:00Z",
        horizon_hours=1,
        screening_distance_km=2.0,
        max_events=10,
        object_limit=10,
    )

    assert diagnostics["objects_analyzed"] == 2
    assert diagnostics["pairs_evaluated"] == 1
    assert diagnostics["full_state_vectors"] == 2
    assert len(events) == 1

    event = events[0]
    assert event["miss_distance_km"] == pytest.approx(1.0, abs=1e-6)
    assert event["relative_velocity_km_s"] == pytest.approx(1.0, abs=1e-6)
    assert event["time_to_closest_approach_hours"] == pytest.approx(
        10.0 / 3600.0,
        abs=1e-3,
    )
    assert event["closest_approach_utc"] == "2026-06-19T12:00:10Z"
    assert event["source_position_timestamp"] == "2026-06-19T12:00:00Z"
    assert event["screening_method"] == "constant-velocity-relative-motion"
    assert event["score_components"]["object_control"] == 5.0
    assert event["score_components"]["relative_velocity"] > 0
    assert event["score_components"]["tca_urgency"] == 2.0
    assert event["severity_basis"] == (
        "miss-distance-and-object-control-status-heuristic"
    )


def test_limited_state_event_is_capped_and_marked_limited():
    objects = [
        {
            "id": "A",
            "name": "Object A",
            "type": "SATELLITE",
            "position_eci_km": [7000.0, 0.0, 0.0],
        },
        {
            "id": "B",
            "name": "Object B",
            "type": "DEBRIS",
            "position_eci_km": [7000.5, 0.0, 0.0],
        },
    ]

    events, diagnostics = _screen_objects(
        objects,
        source_timestamp="2026-06-19T12:00:00Z",
        horizon_hours=1,
        screening_distance_km=2.0,
        max_events=10,
        object_limit=10,
    )

    assert diagnostics["limited_state_vectors"] == 2
    assert len(events) == 1
    assert events[0]["confidence"] == "limited"
    assert events[0]["model_basis"] == "current-frame-proximity"
    assert events[0]["risk_score"] <= 55.0
    assert events[0]["score_components"]["confidence_cap"] == 55.0


def test_summary_counts_supported_levels():
    summary = _summary(
        [
            {"risk_level": "CRITICAL"},
            {"risk_level": "HIGH"},
            {"risk_level": "MEDIUM"},
            {"risk_level": "MONITORED"},
            {"risk_level": "UNKNOWN"},
        ]
    )

    assert summary == {
        "critical": 1,
        "high": 1,
        "medium": 1,
        "monitored": 2,
        "total": 5,
    }
