import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import conjunction_history as history  # noqa: E402


def _event(
    *,
    event_id="CONJ-A",
    score=80.0,
    distance=10.0,
    level="HIGH",
):
    return {
        "id": event_id,
        "risk_level": level,
        "risk_score": score,
        "screening_priority_level": level,
        "screening_priority_score": score,
        "miss_distance_km": distance,
        "relative_velocity_km_s": 9.0,
        "closest_approach_utc": "2026-06-20T00:00:00Z",
        "object_a": {"id": "A", "name": "Object A"},
        "object_b": {"id": "B", "name": "Object B"},
        "model_basis": "multi-epoch-sgp4",
        "source_position_timestamp": "2026-06-19T12:00:00Z",
    }


def _snapshot(events, *, updated_at, coverage_status="complete"):
    return {
        "last_updated": updated_at,
        "coverage_status": coverage_status,
        "events": events,
        "diagnostics": {"coverage_status": coverage_status},
    }


def test_new_event_is_persisted_and_enriched(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_PATH", tmp_path / "history.json")

    result = history.enrich_conjunction_snapshot(
        _snapshot([_event()], updated_at="2026-06-19T12:00:00Z")
    )

    lifecycle = result["events"][0]["lifecycle"]
    assert lifecycle["change_type"] == "new"
    assert lifecycle["status"] == "active"
    assert lifecycle["observation_count"] == 1
    assert result["changes"]["counts"]["new"] == 1


def test_event_can_be_classified_as_worsening(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_PATH", tmp_path / "history.json")

    history.enrich_conjunction_snapshot(
        _snapshot(
            [_event(score=70.0, distance=10.0)],
            updated_at="2026-06-19T12:00:00Z",
        )
    )

    result = history.enrich_conjunction_snapshot(
        _snapshot(
            [_event(score=90.0, distance=5.0, level="CRITICAL")],
            updated_at="2026-06-19T12:10:00Z",
        )
    )

    lifecycle = result["events"][0]["lifecycle"]
    assert lifecycle["change_type"] == "worsening"
    assert lifecycle["risk_score_delta"] == 20.0
    assert lifecycle["miss_distance_delta_km"] == -5.0


def test_partial_coverage_does_not_resolve_absent_event(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_PATH", tmp_path / "history.json")

    history.enrich_conjunction_snapshot(
        _snapshot([_event()], updated_at="2026-06-19T12:00:00Z")
    )

    result = history.enrich_conjunction_snapshot(
        _snapshot(
            [],
            updated_at="2026-06-19T12:10:00Z",
            coverage_status="partial",
        )
    )

    payload = history.get_history_snapshot()
    assert payload["events"][0]["status"] == "unconfirmed"
    assert result["changes"]["counts"]["resolved"] == 0
    assert result["changes"]["counts"]["unconfirmed"] == 1


def test_complete_coverage_resolves_absent_event(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_PATH", tmp_path / "history.json")

    history.enrich_conjunction_snapshot(
        _snapshot([_event()], updated_at="2026-06-19T12:00:00Z")
    )

    result = history.enrich_conjunction_snapshot(
        _snapshot(
            [],
            updated_at="2026-06-19T12:10:00Z",
            coverage_status="complete",
        )
    )

    payload = history.get_history_snapshot(status="resolved")
    assert payload["events"][0]["status"] == "resolved"
    assert result["changes"]["counts"]["resolved"] == 1
