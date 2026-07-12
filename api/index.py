"""Vercel serverless entrypoint for the OrbitOPS Flask application.

The existing long-lived local/Render runtime stays unchanged. This adapter only
changes infrastructure assumptions that do not hold inside a Vercel Function:
writable paths, daemon workers, persistent Socket.IO state, and rewritten paths.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qsl, urlencode

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
BUNDLED_DATA_DIR = BACKEND_DIR / "data"
RUNTIME_DATA_DIR = Path(os.environ.get("ORBITOPS_DATA_DIR", "/tmp/orbitops"))

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("ORBITOPS_SERVERLESS", "1")
os.environ.setdefault("SOCKETIO_ASYNC_MODE", "threading")
os.environ.setdefault("ORBITOPS_MAX_OBJECTS", "450")
os.environ.setdefault("ORBITOPS_PREVIEW_OBJECTS", "450")
os.environ.setdefault("CONJUNCTION_OBJECT_LIMIT", "450")
os.environ.setdefault("CONJUNCTION_MAX_EVENTS", "100")

RUNTIME_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _seed_runtime_cache() -> None:
    """Copy committed real CelesTrak seed data to Vercel's writable disk."""

    source_dir = BUNDLED_DATA_DIR / "celestrak_omm"
    target_dir = RUNTIME_DATA_DIR / "celestrak_omm"
    target_dir.mkdir(parents=True, exist_ok=True)

    if not source_dir.is_dir():
        return

    for source in source_dir.glob("*.json"):
        target = target_dir / source.name
        if not target.exists():
            shutil.copyfile(source, target)


_seed_runtime_cache()

import tle_parser  # noqa: E402


def _configure_orbital_runtime() -> None:
    tle_parser.DATA_DIR = RUNTIME_DATA_DIR
    tle_parser.CACHE_DIR = RUNTIME_DATA_DIR / "celestrak_omm"
    tle_parser.META_CACHE_PATH = tle_parser.CACHE_DIR / "metadata.json"
    tle_parser.SNAPSHOT_CACHE_PATH = RUNTIME_DATA_DIR / "live_orbit_snapshot.json"
    tle_parser._SNAPSHOT = tle_parser._load_snapshot_from_disk()

    original_get_orbital_data = tle_parser.get_orbital_data

    def run_refresh_synchronously(force_remote: bool = False) -> bool:
        tle_parser._refresh_worker(force_remote)
        return True

    def get_orbital_data(force_refresh: bool = False) -> dict[str, Any]:
        response = original_get_orbital_data(force_refresh=force_refresh)
        with tle_parser._STATE_LOCK:
            snapshot = tle_parser._SNAPSHOT
        if snapshot is not None:
            return tle_parser._snapshot_response(snapshot)
        return response

    tle_parser._start_background_refresh = run_refresh_synchronously
    tle_parser.get_orbital_data = get_orbital_data


_configure_orbital_runtime()

import conjunction_history  # noqa: E402

conjunction_history.DATA_DIR = RUNTIME_DATA_DIR
conjunction_history.HISTORY_PATH = RUNTIME_DATA_DIR / "conjunction_history.json"

import conjunction_service  # noqa: E402


def _configure_conjunction_runtime() -> None:
    conjunction_service.DATA_DIR = RUNTIME_DATA_DIR
    conjunction_service.SNAPSHOT_PATH = RUNTIME_DATA_DIR / "conjunction_snapshot.json"
    conjunction_service._SNAPSHOT = conjunction_service._read_snapshot()

    def run_refresh_synchronously(source: dict[str, Any]) -> bool:
        copied_source = dict(source)
        copied_source["objects"] = list(source.get("objects") or [])
        conjunction_service._compute_worker(copied_source)
        return True

    conjunction_service._start_refresh = run_refresh_synchronously


_configure_conjunction_runtime()

import catalog_service  # noqa: E402


def _configure_catalog_runtime() -> None:
    catalog_service.DATA_DIR = RUNTIME_DATA_DIR
    catalog_service.OMM_CACHE_DIR = RUNTIME_DATA_DIR / "celestrak_omm"
    catalog_service.LIVE_SNAPSHOT_PATH = RUNTIME_DATA_DIR / "live_orbit_snapshot.json"
    catalog_service.SATCAT_CACHE_PATH = RUNTIME_DATA_DIR / "satcat_onorbit.json"
    catalog_service.SATCAT_META_PATH = RUNTIME_DATA_DIR / "satcat_onorbit_meta.json"
    catalog_service.DETAIL_CACHE_DIR = RUNTIME_DATA_DIR / "catalog_details"
    catalog_service._load_initial_catalog()

    def run_refresh_synchronously() -> bool:
        catalog_service._refresh_worker()
        return True

    original_get_catalog_payload = catalog_service.get_catalog_payload

    def get_catalog_payload(*, refresh: bool = False, **kwargs: Any) -> dict[str, Any]:
        if refresh or not catalog_service._CATALOG_RECORDS:
            return original_get_catalog_payload(refresh=refresh, **kwargs)

        # The committed OMM seed already provides a useful preview catalog. Avoid
        # downloading the much larger SATCAT dataset during ordinary page loads.
        original_freshness_check = catalog_service._satcat_cache_is_fresh
        catalog_service._satcat_cache_is_fresh = lambda: True
        try:
            return original_get_catalog_payload(refresh=False, **kwargs)
        finally:
            catalog_service._satcat_cache_is_fresh = original_freshness_check

    catalog_service._start_refresh = run_refresh_synchronously
    catalog_service.get_catalog_payload = get_catalog_payload


_configure_catalog_runtime()

import analytics_service  # noqa: E402


def _configure_analytics_runtime() -> None:
    analytics_service.DATA_DIR = RUNTIME_DATA_DIR
    analytics_service.ANALYTICS_SNAPSHOT_PATH = (
        RUNTIME_DATA_DIR / "analytics_snapshot.json"
    )
    analytics_service.ANALYTICS_HISTORY_PATH = (
        RUNTIME_DATA_DIR / "analytics_history.json"
    )
    analytics_service.LIVE_SNAPSHOT_CANDIDATES = (
        RUNTIME_DATA_DIR / "live_orbit_snapshot.json",
        RUNTIME_DATA_DIR / "orbit_snapshot.json",
        RUNTIME_DATA_DIR / "orbital_snapshot.json",
    )
    analytics_service.CONJUNCTION_SNAPSHOT_CANDIDATES = (
        RUNTIME_DATA_DIR / "conjunction_snapshot.json",
        RUNTIME_DATA_DIR / "conjunctions_snapshot.json",
    )

    def run_refresh_synchronously() -> None:
        with analytics_service.REFRESH_LOCK:
            if analytics_service.REFRESH_IN_PROGRESS:
                return
            analytics_service.REFRESH_IN_PROGRESS = True
        analytics_service._background_refresh()

    original_get_analytics_payload = analytics_service.get_analytics_payload

    def get_analytics_payload(**kwargs: Any) -> dict[str, Any]:
        response = original_get_analytics_payload(**kwargs)
        if response.get("status") == "warming":
            retry_kwargs = dict(kwargs)
            retry_kwargs["refresh"] = False
            return original_get_analytics_payload(**retry_kwargs)
        return response

    analytics_service._start_background_refresh = run_refresh_synchronously
    analytics_service.get_analytics_payload = get_analytics_payload


_configure_analytics_runtime()

import app as orbit_app  # noqa: E402


def _read_runtime_snapshot(filename: str) -> dict[str, Any]:
    path = RUNTIME_DATA_DIR / filename
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_runtime_snapshot(filename: str, payload: dict[str, Any]) -> None:
    path = RUNTIME_DATA_DIR / filename
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary.replace(path)


class RewrittenPathMiddleware:
    """Restore the original path captured by Vercel's function rewrite."""

    def __init__(self, application: Callable[..., Any]) -> None:
        self.application = application

    def __call__(self, environ: dict[str, Any], start_response: Callable[..., Any]):
        if environ.get("PATH_INFO") == "/api/index":
            pairs = parse_qsl(environ.get("QUERY_STRING", ""), keep_blank_values=True)
            forwarded_path = None
            socket_path = None
            remaining_pairs: list[tuple[str, str]] = []

            for key, value in pairs:
                if key == "path" and forwarded_path is None:
                    forwarded_path = value
                elif key == "socket_path" and socket_path is None:
                    socket_path = value
                else:
                    remaining_pairs.append((key, value))

            if forwarded_path is not None:
                clean_path = forwarded_path.lstrip("/")
                environ["PATH_INFO"] = f"/api/{clean_path}"
            elif socket_path is not None:
                clean_path = socket_path.lstrip("/")
                environ["PATH_INFO"] = f"/socket.io/{clean_path}"

            environ["QUERY_STRING"] = urlencode(remaining_pairs, doseq=True)

        return self.application(environ, start_response)


# Infinite background loops and process-local Socket.IO broadcasts are not a
# reliable source of truth inside autoscaled serverless functions. The Vercel
# frontend uses the same REST endpoints through a lightweight polling client.
orbit_app.start_background_worker_once = lambda: None
orbit_app._read_json_snapshot = _read_runtime_snapshot
orbit_app._write_json_snapshot = _write_runtime_snapshot
orbit_app.FRONTEND_DIST_DIR = str(ROOT_DIR / "public")
orbit_app.app.wsgi_app = RewrittenPathMiddleware(orbit_app.app.wsgi_app)

app = orbit_app.app
