import sys
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import app as orbit_app  # noqa: E402


SAMPLE_OBJECTS = [
    {
        "id": "25544",
        "name": "ISS",
        "type": "SATELLITE",
        "lat": 10.0,
        "lon": 20.0,
        "altitude_km": 408.0,
        "velocity_km_s": 7.66,
        "risk_score": 55,
        "risk_level": "MEDIUM",
        "risk_reasons": ["Active satellite requiring monitoring"],
    },
    {
        "id": "99999",
        "name": "Debris Alpha",
        "type": "DEBRIS",
        "lat": 10.1,
        "lon": 20.1,
        "altitude_km": 410.0,
        "velocity_km_s": 7.8,
        "risk_score": 80,
        "risk_level": "CRITICAL",
        "risk_reasons": ["Uncontrolled debris object"],
    },
]

SAMPLE_DATA = {
    "objects": SAMPLE_OBJECTS,
    "high_risk_objects": [SAMPLE_OBJECTS[1]],
    "last_updated": 1_700_000_000.0,
    "stats": {
        "total_objects": 2,
        "classification": {
            "active_satellites": 1,
            "debris": 1,
            "rocket_bodies": 0,
            "unknown": 0,
        },
        "risk_summary": {
            "critical": 1,
            "high": 0,
            "medium": 1,
            "low": 0,
        },
        "risk_level": "CRITICAL",
        "high_risk_threshold": 60,
    },
    "source": "unit-test",
    "status": "online",
    "last_error": None,
}


@pytest.fixture
def client(monkeypatch):
    orbit_app.app.config.update(TESTING=True)

    # Unit tests must never launch the permanent background worker.
    monkeypatch.setattr(
        orbit_app,
        "start_background_worker_once",
        lambda: None,
    )

    return orbit_app.app.test_client()


@pytest.fixture
def mock_orbit_data(monkeypatch):
    monkeypatch.setattr(
        orbit_app,
        "update_orbit_data",
        lambda force=False: SAMPLE_DATA,
    )


def test_health_endpoint_returns_system_status(client, monkeypatch):
    monkeypatch.setattr(
        orbit_app,
        "get_cached_orbit_data",
        lambda: SAMPLE_DATA,
    )

    response = client.get("/api/health")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["system"] == "OrbitOPS"
    assert payload["backend_status"] == "online"
    assert payload["objects"] == 2
    assert payload["source"] == "unit-test"


def test_health_endpoint_reports_degraded_status(client, monkeypatch):
    degraded_data = {
        **SAMPLE_DATA,
        "status": "degraded",
        "last_error": "upstream refresh failed",
    }
    monkeypatch.setattr(
        orbit_app,
        "get_cached_orbit_data",
        lambda: degraded_data,
    )

    response = client.get("/api/health")
    payload = response.get_json()

    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["backend_status"] == "degraded"
    assert payload["system"] == "OrbitOPS"
    assert payload["objects"] == 2
    assert payload["source"] == "unit-test"
    assert "last_error" not in payload


def test_objects_endpoint_honors_limit(client, mock_orbit_data):
    response = client.get("/api/objects?limit=1")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["count"] == 1
    assert payload["total_objects"] == 2
    assert payload["objects"][0]["name"] == "ISS"


@pytest.mark.parametrize(
    ("endpoint", "query", "expected_count"),
    [
        ("/api/objects", "", 100),
        ("/api/objects", "?limit=0", 100),
        ("/api/objects", "?limit=-1", 100),
        ("/api/objects", "?limit=1", 1),
        ("/api/objects", "?limit=500", 100),
        ("/api/objects", "?limit=invalid", 100),
        ("/api/debris", "", 100),
        ("/api/debris", "?limit=0", 100),
        ("/api/debris", "?limit=-1", 100),
        ("/api/debris", "?limit=1", 1),
        ("/api/debris", "?limit=500", 100),
        ("/api/debris", "?limit=invalid", 100),
    ],
)
def test_collection_endpoints_enforce_result_limits(
    client,
    monkeypatch,
    endpoint,
    query,
    expected_count,
):
    objects = [
        {
            "id": str(index),
            "name": f"Object {index}",
            "type": "DEBRIS",
        }
        for index in range(150)
    ]

    monkeypatch.setattr(
        orbit_app,
        "update_orbit_data",
        lambda force=False: {
            "objects": objects,
            "high_risk_objects": [],
            "stats": {},
            "source": "unit-test",
            "last_updated": None,
        },
    )

    response = client.get(f"{endpoint}{query}")
    payload = response.get_json()

    assert response.status_code == 200
    assert len(payload["objects"]) == expected_count
    assert payload["total_objects"] == 150


def test_objects_endpoint_hides_internal_error_details(
    client,
    monkeypatch,
):
    internal_message = "sensitive database connection details"

    def fail_update(force=False):
        raise RuntimeError(internal_message)

    monkeypatch.setattr(
        orbit_app,
        "update_orbit_data",
        fail_update,
    )

    response = client.get("/api/objects")
    payload = response.get_json()

    assert response.status_code == 500
    assert payload == {
        "status": "error",
        "message": "Internal server error",
    }
    assert internal_message not in response.get_data(as_text=True)


def test_single_object_endpoint_handles_found_and_missing_objects(
    client,
    mock_orbit_data,
):
    found_response = client.get("/api/object/25544")
    found_payload = found_response.get_json()

    assert found_response.status_code == 200
    assert found_payload["object"]["name"] == "ISS"

    missing_response = client.get("/api/object/not-present")
    missing_payload = missing_response.get_json()

    assert missing_response.status_code == 404
    assert missing_payload["status"] == "not_found"
    assert missing_payload["message"] == "Object not found"


def test_search_requires_query(client):
    response = client.get("/api/search")
    payload = response.get_json()

    assert response.status_code == 400
    assert payload["status"] == "error"
    assert "Search query is required" in payload["message"]


def test_search_returns_matching_object(client, mock_orbit_data):
    response = client.get("/api/search?q=iss")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["count"] == 1
    assert payload["objects"][0]["id"] == "25544"


def test_high_risk_endpoint_returns_only_high_risk_objects(
    client,
    mock_orbit_data,
):
    response = client.get("/api/high-risk?limit=1")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["count"] == 1
    assert len(payload["objects"]) == 1
    assert payload["objects"][0]["risk_level"] == "CRITICAL"


def test_collision_risk_endpoint_uses_conjunction_snapshot(
    client,
    monkeypatch,
):
    expected_event = {
        "id": "CONJ-TEST",
        "object_a": {"id": "25544", "name": "ISS"},
        "object_b": {"id": "99999", "name": "Debris Alpha"},
        "risk_score": 82.0,
        "risk_level": "HIGH",
        "miss_distance_km": 4.2,
    }

    monkeypatch.setattr(
        orbit_app,
        "get_conjunction_snapshot",
        lambda provider, force=False, limit=250: (
            {
                "status": "live",
                "model_type": "baseline-linear-relative-motion-screening",
                "events": [expected_event],
                "summary": {
                    "critical": 0,
                    "high": 1,
                    "medium": 0,
                    "monitored": 0,
                    "total": 1,
                },
                "diagnostics": {"objects_analyzed": 2},
            },
            200,
        ),
    )

    response = client.get("/api/collision-risk?limit=1")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "live"
    assert payload["events"] == [expected_event]
    assert payload["risk_pairs"] == [expected_event]
    assert payload["total_objects_analyzed"] == 2
    assert payload["deprecated"] is True
    assert payload["replacement_endpoint"] == "/api/conjunctions"
    assert payload["model_type"] == "baseline-linear-relative-motion-screening"



@pytest.mark.parametrize(
    (
        "endpoint",
        "dependency",
        "expected_status_code",
        "expected_fields",
    ),
    [
        (
            "/api/satellites/live",
            "get_orbital_data",
            500,
            {"status": "error"},
        ),
        (
            "/api/data-status",
            "get_orbital_data",
            503,
            {
                "status": "offline",
                "source": "CelesTrak",
            },
        ),
        (
            "/api/collision-risk",
            "get_conjunction_snapshot",
            500,
            {
                "status": "error",
                "events": [],
                "risk_pairs": [],
                "deprecated": True,
                "replacement_endpoint": "/api/conjunctions",
            },
        ),
    ],
)
def test_direct_server_error_responses_hide_internal_details(
    client,
    monkeypatch,
    endpoint,
    dependency,
    expected_status_code,
    expected_fields,
):
    internal_message = "sensitive upstream connection details"

    def fail_dependency(*args, **kwargs):
        raise RuntimeError(internal_message)

    monkeypatch.setattr(
        orbit_app,
        dependency,
        fail_dependency,
    )

    response = client.get(endpoint)
    payload = response.get_json()

    assert response.status_code == expected_status_code
    assert payload["message"] == "Internal server error"

    for field, expected_value in expected_fields.items():
        assert payload[field] == expected_value

    assert internal_message not in response.get_data(as_text=True)


def test_ai_briefing_reports_unavailable_without_key_or_cache(
    client,
    mock_orbit_data,
    monkeypatch,
):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(orbit_app, "_cached_ai_response", lambda message=None: None)

    response = client.get("/api/ai/briefing")
    payload = response.get_json()

    assert response.status_code == 503
    assert payload["status"] == "ai_unavailable"
    assert payload["grounded"] is False
    assert "GEMINI_API_KEY" in payload["message"]


@pytest.mark.parametrize(
    ("method", "expected_status"),
    [
        ("get", 404),
        ("post", 405),
    ],
)
def test_force_fetch_endpoint_is_not_exposed(
    client,
    method,
    expected_status,
):
    response = getattr(client, method)("/api/force_fetch")

    assert response.status_code == expected_status

