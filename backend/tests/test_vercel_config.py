import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def test_vercel_builds_the_vite_frontend_and_routes_api_first():
    config = json.loads((REPOSITORY_ROOT / "vercel.json").read_text(encoding="utf-8"))

    assert config["outputDirectory"] == "public"
    assert config["framework"] is None
    assert "installCommand" not in config
    assert config["buildCommand"].startswith(
        "npm --prefix frontend ci && "
    )
    assert "frontend run build" in config["buildCommand"]
    assert "VITE_REALTIME_MODE=polling" in config["buildCommand"]
    assert config["functions"]["api/index.py"]["maxDuration"] == 300
    assert config["rewrites"][0] == {
        "source": "/api/:path*",
        "destination": "/api/index?path=:path*",
    }
    assert config["rewrites"][-1]["destination"] == "/index.html"


def test_vercel_entrypoint_exposes_flask_without_daemon_workers():
    from api import index as vercel_entrypoint

    assert vercel_entrypoint.app is vercel_entrypoint.orbit_app.app
    assert vercel_entrypoint.RUNTIME_DATA_DIR == Path("/tmp/orbitops")
    assert vercel_entrypoint.orbit_app.start_background_worker_once() is None

    client = vercel_entrypoint.app.test_client()
    response = client.get("/api/index?path=health")

    assert response.status_code == 200
    assert response.get_json()["system"] == "OrbitOPS"

def test_root_requirements_are_vercel_parseable_and_match_backend():
    root_requirements = (
        REPOSITORY_ROOT / "requirements.txt"
    ).read_text(encoding="utf-8").splitlines()

    backend_requirements = (
        REPOSITORY_ROOT / "backend" / "requirements.txt"
    ).read_text(encoding="utf-8").splitlines()

    normalise = lambda lines: [
        line.strip()
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    ]

    root_dependencies = normalise(root_requirements)
    backend_dependencies = normalise(backend_requirements)

    assert root_dependencies == backend_dependencies
    assert not any(
        dependency.startswith(("-r ", "--requirement "))
        for dependency in root_dependencies
    )
