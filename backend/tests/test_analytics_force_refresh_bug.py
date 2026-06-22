import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import analytics_service


def test_analytics_background_refresh_parameter_mismatch(monkeypatch):
    calls = []

    # Signature must match the real get_orbital_data function exactly
    def spy_get_orbital_data(force_refresh=False):
        calls.append({"force_refresh": force_refresh})
        return {"objects": []}

    # Patch in tle_parser since it is imported inside _background_refresh
    monkeypatch.setattr("tle_parser.get_orbital_data", spy_get_orbital_data)

    # Call the background refresh synchronously
    analytics_service._background_refresh()

    # If the bug is present, the force=True call raises TypeError and falls back.
    # Therefore, we will not see any call with force_refresh=True.
    assert any(call.get("force_refresh") is True for call in calls), (
        f"Expected at least one call to get_orbital_data with force_refresh=True, got calls: {calls}"
    )
