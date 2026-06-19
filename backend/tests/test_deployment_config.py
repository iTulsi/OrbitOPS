from pathlib import Path

import app as orbit_app


def test_frontend_distribution_path_points_outside_backend():
    repository_root = Path(__file__).resolve().parents[2]
    expected = (repository_root / "frontend" / "dist").resolve()
    actual = Path(orbit_app.FRONTEND_DIST_DIR).resolve()

    assert actual == expected
