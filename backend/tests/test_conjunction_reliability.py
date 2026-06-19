import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import conjunction_service as service  # noqa: E402


def test_build_event_exposes_screening_priority_aliases():
    event = service._build_event(
        {
            "id": "A",
            "name": "Object A",
            "type": "SATELLITE",
            "altitude_km": 500.0,
        },
        {
            "id": "B",
            "name": "Object B",
            "type": "DEBRIS",
            "altitude_km": 501.0,
        },
        miss_distance_km=2.0,
        relative_velocity_km_s=10.0,
        tca_seconds=60.0,
        source_timestamp="2026-06-19T12:00:00Z",
        has_full_state=True,
        model_basis_override="multi-epoch-sgp4",
        screening_method="test-method",
    )

    assert event["screening_priority_score"] == event["risk_score"]
    assert event["screening_priority_level"] == event["risk_level"]
    assert event["severity_basis"] == (
        "miss-distance-and-object-control-status-heuristic"
    )


def test_snapshot_freshness_uses_configured_refresh_interval(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(service, "DEFAULT_REFRESH_SECONDS", 600)

    fresh = {
        "last_updated": (
            now - timedelta(seconds=100)
        ).isoformat().replace("+00:00", "Z")
    }
    stale = {
        "last_updated": (
            now - timedelta(seconds=700)
        ).isoformat().replace("+00:00", "Z")
    }

    assert service._snapshot_is_stale(fresh) is False
    assert service._snapshot_is_stale(stale) is True
    assert service._snapshot_is_stale(None) is True
