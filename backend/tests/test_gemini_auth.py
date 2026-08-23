import app as orbit_app


class FakeGeminiResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": (
                                    "1. Mission Status\n"
                                    "OrbitOPS telemetry is nominal."
                                )
                            }
                        ]
                    }
                }
            ]
        }


def test_ai_briefing_uses_header_authentication(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-secret-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")
    monkeypatch.setattr(
        orbit_app,
        "start_background_worker_once",
        lambda: None,
    )

    monkeypatch.setattr(
        orbit_app,
        "update_orbit_data",
        lambda: {
            "objects": [],
            "high_risk_objects": [],
            "last_updated": 0,
            "source": "test",
            "stats": {
                "total_objects": 0,
                "classification": {},
                "altitude_bands": {},
            },
        },
    )

    monkeypatch.setattr(
        orbit_app,
        "_read_json_snapshot",
        lambda _filename: {"events": []},
    )

    monkeypatch.setattr(
        orbit_app,
        "_write_json_snapshot",
        lambda *_args, **_kwargs: None,
    )

    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeGeminiResponse()

    monkeypatch.setattr(orbit_app.requests, "post", fake_post)

    response = orbit_app.app.test_client().get("/api/ai/briefing")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["grounded"] is True
    assert captured["url"].endswith(
        "/models/gemini-2.5-flash:generateContent"
    )
    assert "?key=" not in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "test-secret-key"
    assert captured["headers"]["Content-Type"] == "application/json"
