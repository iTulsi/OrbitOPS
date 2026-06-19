import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from conjunction_realtime import build_realtime_payloads  # noqa: E402


def _snapshot(items, coverage="partial"):
    return {
        "status": "live",
        "last_updated": "2026-06-19T18:00:00Z",
        "source_position_timestamp": "2026-06-19T17:59:00Z",
        "coverage_status": coverage,
        "summary": {"critical": 1, "total": 1},
        "lifecycle_summary": {"active": 1, "tracked_total": 1},
        "changes": {
            "generated_at": "2026-06-19T18:00:00Z",
            "coverage_status": coverage,
            "counts": {},
            "items": items,
        },
        "diagnostics": {
            "engine_status": "ok",
            "coverage_status": coverage,
        },
    }


def test_new_medium_event_is_not_pushed_as_individual_alert():
    alerts, batch, _completion = build_realtime_payloads(
        _snapshot([
            {
                "event_id": "CONJ-1",
                "change_type": "new",
                "risk_level": "MEDIUM",
                "risk_score": 55,
            }
        ])
    )

    assert alerts == []
    assert batch["eligible_alerts"] == 0


def test_high_new_and_worsening_events_are_selected():
    alerts, batch, _completion = build_realtime_payloads(
        _snapshot([
            {
                "event_id": "CONJ-NEW",
                "change_type": "new",
                "risk_level": "HIGH",
                "risk_score": 75,
            },
            {
                "event_id": "CONJ-WORSE",
                "change_type": "worsening",
                "risk_level": "MEDIUM",
                "risk_score": 60,
            },
        ])
    )

    assert [alert["event_id"] for alert in alerts] == [
        "CONJ-WORSE",
        "CONJ-NEW",
    ]
    assert batch["alerts_emitted"] == 2


def test_resolved_event_is_not_emitted_from_partial_coverage():
    alerts, batch, _completion = build_realtime_payloads(
        _snapshot([
            {
                "event_id": "CONJ-RESOLVED",
                "change_type": "resolved",
                "status": "resolved",
            }
        ], coverage="partial")
    )

    assert alerts == []
    assert batch["eligible_alerts"] == 0


def test_alert_batch_is_capped_and_marked_truncated():
    items = [
        {
            "event_id": f"CONJ-{index}",
            "change_type": "worsening",
            "risk_level": "HIGH",
            "risk_score": 80 + index,
        }
        for index in range(5)
    ]

    alerts, batch, completion = build_realtime_payloads(
        _snapshot(items),
        max_alerts=2,
    )

    assert len(alerts) == 2
    assert batch["eligible_alerts"] == 5
    assert batch["alerts_emitted"] == 2
    assert batch["alerts_truncated"] is True
    assert completion["alerts_truncated"] is True
