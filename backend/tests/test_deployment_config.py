from pathlib import Path

import app as orbit_app


def test_frontend_distribution_path_points_outside_backend():
    repository_root = Path(__file__).resolve().parents[2]
    expected = (repository_root / "frontend" / "dist").resolve()
    actual = Path(orbit_app.FRONTEND_DIST_DIR).resolve()

    assert actual == expected


def test_spa_deep_link_returns_react_index(tmp_path, monkeypatch):
    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()

    index_file = frontend_dist / "index.html"
    index_file.write_text(
        '<!doctype html><div id="root"></div>',
        encoding="utf-8",
    )

    monkeypatch.setattr(
        orbit_app,
        "FRONTEND_DIST_DIR",
        str(frontend_dist),
    )
    monkeypatch.setattr(
        orbit_app,
        "start_background_worker_once",
        lambda: None,
    )

    client = orbit_app.app.test_client()
    response = client.get("/overview")

    assert response.status_code == 200
    assert b'<div id="root"></div>' in response.data


def test_existing_frontend_asset_is_served(tmp_path, monkeypatch):
    frontend_dist = tmp_path / "dist"
    assets_dir = frontend_dist / "assets"
    assets_dir.mkdir(parents=True)

    asset_file = assets_dir / "test.js"
    asset_file.write_text(
        'console.log("orbitops");',
        encoding="utf-8",
    )

    monkeypatch.setattr(
        orbit_app,
        "FRONTEND_DIST_DIR",
        str(frontend_dist),
    )
    monkeypatch.setattr(
        orbit_app,
        "start_background_worker_once",
        lambda: None,
    )

    client = orbit_app.app.test_client()
    response = client.get("/assets/test.js")

    assert response.status_code == 200
    assert b'console.log("orbitops");' in response.data

def test_unknown_api_route_does_not_return_react_index(
    tmp_path,
    monkeypatch,
):
    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()

    index_file = frontend_dist / "index.html"
    index_file.write_text(
        '<!doctype html><div id="root"></div>',
        encoding="utf-8",
    )

    monkeypatch.setattr(
        orbit_app,
        "FRONTEND_DIST_DIR",
        str(frontend_dist),
    )
    monkeypatch.setattr(
        orbit_app,
        "start_background_worker_once",
        lambda: None,
    )

    client = orbit_app.app.test_client()
    response = client.get("/api/route-that-does-not-exist")

    assert response.status_code == 404
    assert b'<div id="root"></div>' not in response.data
