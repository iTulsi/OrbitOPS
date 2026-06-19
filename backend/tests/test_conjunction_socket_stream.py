import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from conjunction_socket_stream import (  # noqa: E402
    ConjunctionSocketPublisher,
)


def _snapshot(updated_at="2026-06-19T18:00:00Z"):
    return {
        "status": "live",
        "last_updated": updated_at,
        "source_position_timestamp": "2026-06-19T17:59:00Z",
        "coverage_status": "partial",
        "summary": {"critical": 1, "total": 1},
        "lifecycle_summary": {"active": 1, "tracked_total": 1},
        "changes": {
            "generated_at": updated_at,
            "counts": {"worsening": 1},
            "items": [
                {
                    "event_id": "CONJ-1",
                    "change_type": "worsening",
                    "risk_level": "CRITICAL",
                    "risk_score": 95,
                    "miss_distance_km": 1.0,
                }
            ],
        },
        "diagnostics": {
            "engine_status": "ok",
            "coverage_status": "partial",
        },
    }


def test_initial_snapshot_can_be_claimed_without_emitting():
    publisher = ConjunctionSocketPublisher()
    emitted = []

    result = publisher.publish(
        _snapshot(),
        initialize_only=True,
        emitter=lambda name, payload: emitted.append((name, payload)),
    )

    assert result["initialized"] is True
    assert result["published"] is False
    assert emitted == []


def test_new_snapshot_emits_completion_batch_and_alert_once():
    publisher = ConjunctionSocketPublisher()
    emitted = []

    publisher.publish(
        _snapshot("2026-06-19T18:00:00Z"),
        initialize_only=True,
        emitter=lambda name, payload: emitted.append((name, payload)),
    )

    result = publisher.publish(
        _snapshot("2026-06-19T18:10:00Z"),
        emitter=lambda name, payload: emitted.append((name, payload)),
    )

    assert result["published"] is True
    assert [name for name, _payload in emitted] == [
        "conjunction_screening_complete",
        "conjunction_batch_update",
        "conjunction_alert",
    ]

    duplicate = publisher.publish(
        _snapshot("2026-06-19T18:10:00Z"),
        emitter=lambda name, payload: emitted.append((name, payload)),
    )

    assert duplicate["published"] is False
    assert len(emitted) == 3
