import os
import time
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple

import requests
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import safe_join
from flask_cors import CORS
from catalog_service import (
    get_catalog_export,
    get_catalog_object,
    get_catalog_payload,
)
from analytics_service import get_analytics_payload
from flask_socketio import SocketIO, emit

from tle_parser import get_orbital_data


# ============================================================
# Local environment loader
# Loads backend/.env without adding another runtime dependency.
# Existing shell/Render environment variables always take precedence.
# ============================================================

def _load_orbitops_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")

    if not os.path.exists(env_path):
        return

    try:
        with open(env_path, "r", encoding="utf-8") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()

                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")

                if key:
                    os.environ.setdefault(key, value)
    except Exception as env_error:
        print(f"OrbitOPS environment warning: {env_error}")


_load_orbitops_env()

from config import load_settings
from conjunction_history import get_history_snapshot
from conjunction_realtime import build_screening_complete_payload
from conjunction_service import get_conjunction_snapshot
from conjunction_socket_stream import (
    run_conjunction_socket_worker,
)


# ============================================================
# OrbitOPS Backend
# Production-ready Flask + Socket.IO backend for:
# - Orbital object tracking
# - Risk scoring
# - Collision-risk analysis
# - AI mission briefing
# - React frontend serving
# ============================================================


# ============================================================
# Compatibility
# ============================================================

# Temporary compatibility patch for libraries expecting np.float_
if not hasattr(np, "float_"):
    np.float_ = np.float64


# ============================================================
# Logging
# ============================================================

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger("orbitops")


# ============================================================
# App Paths
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "..", "frontend", "dist")
)


# ============================================================
# Config
# ============================================================

SETTINGS = load_settings()

SECRET_KEY = SETTINGS.secret_key
CORS_ORIGINS = list(SETTINGS.cors_origins)

UPDATE_INTERVAL_SECONDS = int(os.environ.get("UPDATE_INTERVAL_SECONDS", "30"))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "20"))
HIGH_RISK_THRESHOLD = int(os.environ.get("HIGH_RISK_THRESHOLD", "60"))
CONJUNCTION_SOCKET_POLL_SECONDS = max(
    2,
    int(os.environ.get(
        "CONJUNCTION_SOCKET_POLL_SECONDS",
        "5",
    )),
)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


# ============================================================
# Flask App
# ============================================================

# Disable Flask's automatic root-level static route.
# OrbitOPS serves built files explicitly so React deep links fall back
# to index.html instead of being intercepted as missing static files.
app = Flask(__name__, static_folder=None)

app.config["SECRET_KEY"] = SECRET_KEY
app.config["ORBITOPS_ENV"] = SETTINGS.environment

CORS(
    app,
    resources={r"/*": {"origins": CORS_ORIGINS}},
)

socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS,
    async_mode=os.environ.get("SOCKETIO_ASYNC_MODE", "threading"),
)


# ============================================================
# Shared State
# ============================================================

orbit_data: Dict[str, Any] = {
    "objects": [],
    "high_risk_objects": [],
    "last_updated": 0,
    "stats": {},
    "source": "mock",
    "status": "starting",
    "last_error": None,
}

data_lock = threading.Lock()
background_worker_lock = threading.Lock()
background_worker_started = False


# ============================================================
# API Response Helpers
# ============================================================

def success_response(payload: Dict[str, Any], status_code: int = 200):
    return jsonify({
        "status": "ok",
        **payload,
    }), status_code


def error_response(
    message: str,
    status_code: int = 500,
    status: str = "error",
):
    public_message = (
        "Internal server error"
        if 500 <= status_code <= 599
        else message
    )

    return jsonify({
        "status": status,
        "message": public_message,
    }), status_code


# ============================================================
# Utility Helpers
# ============================================================

def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        if value is None:
            return default

        return float(value)

    except (TypeError, ValueError):
        return default


def get_first(
    obj: Dict[str, Any],
    keys: List[str],
    default: Any = None,
) -> Any:
    for key in keys:
        value = obj.get(key)

        if value is not None:
            return value

    return default


def normalize_type(raw_type: Any) -> str:
    if not raw_type:
        return "UNKNOWN"

    value = str(raw_type).upper().strip()

    if "DEBRIS" in value:
        return "DEBRIS"

    if "ROCKET" in value:
        return "ROCKET_BODY"

    if "SAT" in value or "PAYLOAD" in value:
        return "SATELLITE"

    return value


def get_object_id(obj: Dict[str, Any], index: int) -> str:
    return str(
        get_first(
            obj,
            [
                "id",
                "object_id",
                "norad_id",
                "satnum",
                "catalog_number",
                "name",
            ],
            f"object-{index}",
        )
    )


def clamp(value: int, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(value, maximum))


def parse_limit(default: int = 25, maximum: int = 100) -> int:
    limit = request.args.get("limit", default=default, type=int)

    if limit is None or limit <= 0:
        return default

    return min(limit, maximum)


# ============================================================
# Risk Engine
# ============================================================

def calculate_risk_score(obj: Dict[str, Any]) -> Tuple[int, str, List[str]]:
    """
    Heuristic risk scoring engine.

    Note:
    This is not a physics-grade collision probability model.
    It is a project-level risk model based on object type, altitude,
    velocity, and tracking data completeness.
    """

    score = 0
    reasons: List[str] = []

    object_type = normalize_type(obj.get("type"))

    altitude = safe_float(
        get_first(obj, ["altitude", "altitude_km", "alt_km", "height_km"])
    )

    velocity = safe_float(
        get_first(obj, ["velocity", "velocity_km_s", "speed", "speed_km_s"])
    )

    lat = safe_float(get_first(obj, ["lat", "latitude"]))
    lon = safe_float(get_first(obj, ["lon", "lng", "longitude"]))

    if object_type == "DEBRIS":
        score += 35
        reasons.append("Uncontrolled debris object")

    elif object_type == "ROCKET_BODY":
        score += 28
        reasons.append("Rocket body may be uncontrolled")

    elif object_type == "SATELLITE":
        score += 10
        reasons.append("Active satellite requiring monitoring")

    else:
        score += 15
        reasons.append("Unknown object classification")

    if altitude is None:
        score += 10
        reasons.append("Altitude data unavailable")

    elif 500 <= altitude <= 1200:
        score += 30
        reasons.append("Crowded LEO altitude band")

    elif 1200 < altitude <= 2000:
        score += 18
        reasons.append("Upper LEO orbital traffic zone")

    elif altitude < 300:
        score += 12
        reasons.append("Low altitude object may decay faster")

    else:
        score += 8
        reasons.append("High altitude object requires long-term tracking")

    if velocity is None:
        score += 5
        reasons.append("Velocity data unavailable")

    elif velocity >= 7.0:
        score += 15
        reasons.append("High orbital velocity")

    elif velocity >= 5.0:
        score += 8
        reasons.append("Moderate orbital velocity")

    if lat is None or lon is None:
        score += 7
        reasons.append("Incomplete position data")

    final_score = clamp(score)

    if final_score >= 75:
        risk_level = "CRITICAL"

    elif final_score >= 60:
        risk_level = "HIGH"

    elif final_score >= 35:
        risk_level = "MEDIUM"

    else:
        risk_level = "LOW"

    return final_score, risk_level, reasons


def normalize_object(obj: Dict[str, Any], index: int) -> Dict[str, Any]:
    object_id = get_object_id(obj, index)

    name = str(
        get_first(
            obj,
            ["name", "object_name", "satellite_name", "title"],
            f"Orbital Object {index + 1}",
        )
    )

    object_type = normalize_type(obj.get("type"))

    lat = safe_float(get_first(obj, ["lat", "latitude"]))
    lon = safe_float(get_first(obj, ["lon", "lng", "longitude"]))

    altitude = safe_float(
        get_first(obj, ["altitude", "altitude_km", "alt_km", "height_km"])
    )

    velocity = safe_float(
        get_first(obj, ["velocity", "velocity_km_s", "speed", "speed_km_s"])
    )

    risk_score, risk_level, risk_reasons = calculate_risk_score({
        **obj,
        "type": object_type,
        "altitude": altitude,
        "velocity": velocity,
        "lat": lat,
        "lon": lon,
    })

    return {
        **obj,
        "id": object_id,
        "name": name,
        "type": object_type,
        "lat": lat,
        "lon": lon,
        "altitude_km": altitude,
        "velocity_km_s": velocity,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "risk_reasons": risk_reasons,
    }


def build_stats(objects: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(objects)

    active_satellites = sum(1 for obj in objects if obj.get("type") == "SATELLITE")
    debris = sum(1 for obj in objects if obj.get("type") == "DEBRIS")
    rocket_bodies = sum(1 for obj in objects if obj.get("type") == "ROCKET_BODY")
    unknown = total - active_satellites - debris - rocket_bodies

    critical = sum(1 for obj in objects if obj.get("risk_level") == "CRITICAL")
    high = sum(1 for obj in objects if obj.get("risk_level") == "HIGH")
    medium = sum(1 for obj in objects if obj.get("risk_level") == "MEDIUM")
    low = sum(1 for obj in objects if obj.get("risk_level") == "LOW")

    altitude_bands = {
        "below_300_km": 0,
        "leo_300_1200_km": 0,
        "upper_leo_1200_2000_km": 0,
        "above_2000_km": 0,
        "unknown": 0,
    }

    for obj in objects:
        altitude = obj.get("altitude_km")

        if altitude is None:
            altitude_bands["unknown"] += 1

        elif altitude < 300:
            altitude_bands["below_300_km"] += 1

        elif altitude <= 1200:
            altitude_bands["leo_300_1200_km"] += 1

        elif altitude <= 2000:
            altitude_bands["upper_leo_1200_2000_km"] += 1

        else:
            altitude_bands["above_2000_km"] += 1

    if critical > 0:
        overall_risk = "CRITICAL"

    elif high > 0:
        overall_risk = "HIGH"

    elif medium > 0:
        overall_risk = "MEDIUM"

    else:
        overall_risk = "LOW"

    return {
        "total_objects": total,
        "classification": {
            "active_satellites": active_satellites,
            "debris": debris,
            "rocket_bodies": rocket_bodies,
            "unknown": unknown,
        },
        "risk_summary": {
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low,
        },
        "altitude_bands": altitude_bands,
        "risk_level": overall_risk,
        "high_risk_threshold": HIGH_RISK_THRESHOLD,
    }


# ============================================================
# Data Engine
# ============================================================

def get_cached_orbit_data() -> Dict[str, Any]:
    with data_lock:
        return {
            "objects": list(orbit_data["objects"]),
            "high_risk_objects": list(orbit_data["high_risk_objects"]),
            "last_updated": orbit_data["last_updated"],
            "stats": dict(orbit_data["stats"]),
            "source": orbit_data["source"],
            "status": orbit_data["status"],
            "last_error": orbit_data["last_error"],
        }


def should_use_cache(force: bool, current_time: float) -> bool:
    with data_lock:
        has_objects = bool(orbit_data["objects"])
        is_cache_valid = (
            current_time - orbit_data["last_updated"] < CACHE_TTL_SECONDS
        )

    return not force and has_objects and is_cache_valid


def update_orbit_data(force: bool = False) -> Dict[str, Any]:
    """
    Fetch orbital data, normalize objects, calculate risk, update cache,
    and broadcast changes through Socket.IO.
    """

    current_time = time.time()

    if should_use_cache(force, current_time):
        return get_cached_orbit_data()

    result = get_orbital_data(force_refresh=force)

    if not isinstance(result, dict):
        raise ValueError("get_orbital_data() returned invalid data")

    raw_objects = result.get("objects", [])
    source = result.get("source", "mock")

    if not isinstance(raw_objects, list):
        raise ValueError("get_orbital_data()['objects'] must be a list")

    normalized_objects = [
        normalize_object(obj, index)
        for index, obj in enumerate(raw_objects)
        if isinstance(obj, dict)
    ]

    normalized_objects.sort(
        key=lambda obj: obj.get("risk_score", 0),
        reverse=True,
    )

    high_risk_objects = [
        obj
        for obj in normalized_objects
        if obj.get("risk_score", 0) >= HIGH_RISK_THRESHOLD
    ]

    stats = build_stats(normalized_objects)

    with data_lock:
        orbit_data["objects"] = normalized_objects
        orbit_data["high_risk_objects"] = high_risk_objects
        orbit_data["last_updated"] = current_time
        orbit_data["stats"] = stats
        orbit_data["source"] = source
        orbit_data["status"] = "online"
        orbit_data["last_error"] = None

    snapshot = get_cached_orbit_data()
    broadcast_data_update(snapshot)

    return snapshot


def broadcast_data_update(data: Dict[str, Any]) -> None:
    socketio.emit("orbital_data", data)

    socketio.emit("risk_update", {
        "stats": data.get("stats", {}),
        "high_risk_objects": data.get("high_risk_objects", [])[:20],
        "last_updated": data.get("last_updated"),
        "source": data.get("source"),
    })


def mark_system_degraded(error: Exception) -> None:
    logger.exception("OrbitOPS data refresh failed")

    with data_lock:
        orbit_data["status"] = "degraded"
        orbit_data["last_error"] = str(error)

    socketio.emit("system_error", {
        "status": "degraded",
        "message": "OrbitOPS data refresh failed safely.",
    })


def data_background_thread() -> None:
    logger.info("OrbitOPS background data worker started")

    while True:
        try:
            update_orbit_data(force=True)

        except Exception as error:
            mark_system_degraded(error)

        socketio.sleep(UPDATE_INTERVAL_SECONDS)


def conjunction_background_thread() -> None:
    run_conjunction_socket_worker(
        socketio=socketio,
        snapshot_provider=get_conjunction_snapshot,
        orbital_provider=get_orbital_data,
        logger=logger,
        poll_seconds=CONJUNCTION_SOCKET_POLL_SECONDS,
    )


def start_background_worker_once() -> None:
    global background_worker_started

    with background_worker_lock:
        if background_worker_started:
            return

        socketio.start_background_task(data_background_thread)
        socketio.start_background_task(
            conjunction_background_thread
        )
        background_worker_started = True

# ============================================================
# API Routes
# ============================================================

@app.before_request
def start_worker_before_first_request():
    start_background_worker_once()


@app.route("/api/health", methods=["GET"])
def health_check():
    data = get_cached_orbit_data()

    return success_response({
        "system": "OrbitOPS",
        "backend_status": data.get("status"),
        "source": data.get("source"),
        "objects": len(data.get("objects", [])),
        "last_updated": data.get("last_updated"),
        "frontend_built": os.path.exists(
            os.path.join(FRONTEND_DIST_DIR, "index.html")
        ),
    })


@app.route("/api/debris", methods=["GET"])
def get_debris():
    try:
        data = update_orbit_data()

        object_type = request.args.get("type", "").strip().upper()
        risk_level = request.args.get("risk", "").strip().upper()
        limit = parse_limit(default=100, maximum=100)

        objects = data.get("objects", [])

        if object_type:
            objects = [
                obj
                for obj in objects
                if obj.get("type") == object_type
            ]

        if risk_level:
            objects = [
                obj
                for obj in objects
                if obj.get("risk_level") == risk_level
            ]

        objects = objects[:limit]

        return success_response({
            "objects": objects,
            "returned_objects": len(objects),
            "total_objects": len(data.get("objects", [])),
            "source": data.get("source"),
            "last_updated": data.get("last_updated"),
            "stats": data.get("stats", {}),
        })

    except Exception as error:
        logger.exception("Failed to fetch debris data")
        return error_response(str(error))


@app.route("/api/objects", methods=["GET"])
def get_objects():
    try:
        data = update_orbit_data()
        limit = parse_limit(default=100, maximum=100)

        objects = data.get("objects", [])

        objects = objects[:limit]

        return success_response({
            "objects": objects,
            "count": len(objects),
            "total_objects": len(data.get("objects", [])),
            "source": data.get("source"),
            "last_updated": data.get("last_updated"),
        })

    except Exception as error:
        logger.exception("Failed to fetch objects")
        return error_response(str(error))




@app.route("/api/satellites/live", methods=["GET"])
def get_live_satellites():
    # Return current positions propagated from real CelesTrak elements.
    try:
        result = get_orbital_data()

        objects = result.get("objects", [])
        limit = request.args.get("limit", 500, type=int)
        limit = max(1, min(limit, 2500))
        returned_objects = objects[:limit]

        return jsonify({
            "status": "ok",
            "count": len(returned_objects),
            "total_available": len(objects),
            "objects": returned_objects,
            "source": result.get("source_name", "CelesTrak"),
            "source_key": result.get("source", "celestrak"),
            "source_status": result.get("source_status", "unknown"),
            "source_format": result.get("source_format", "TLE/GP"),
            "using_cached_elements": result.get("using_cache", False),
            "last_successful_fetch": result.get("last_successful_fetch"),
            "positions_generated_at": result.get("position_timestamp"),
            "propagator": result.get("propagator", "SGP4"),
            "data_mode": result.get("data_mode", "live-propagated")
        })

    except Exception:
        logger.exception("Failed to fetch live satellites")
        return jsonify({
            "status": "error",
            "message": "Internal server error"
        }), 500


@app.route("/api/data-status", methods=["GET"])
def get_data_status():
    # Report source provenance and freshness without synthetic fallback.
    try:
        result = get_orbital_data()
        source_status = result.get("source_status", "unknown")

        if source_status in {"live", "partial-live", "cached-fresh"}:
            availability = "live"
        elif source_status == "stale":
            availability = "stale"
        else:
            availability = "offline"

        return jsonify({
            "status": availability,
            "source": result.get("source_name", "CelesTrak"),
            "source_key": result.get("source", "celestrak"),
            "source_status": source_status,
            "source_format": result.get("source_format", "TLE/GP"),
            "source_groups": result.get("source_groups", []),
            "source_errors": result.get("source_errors", []),
            "objects": len(result.get("objects", [])),
            "using_cached_elements": result.get("using_cache", False),
            "last_successful_fetch": result.get("last_successful_fetch"),
            "positions_generated_at": result.get("position_timestamp"),
            "propagator": result.get("propagator", "SGP4"),
            "data_mode": result.get("data_mode", "live-propagated")
        })

    except Exception:
        logger.exception("Failed to fetch data status")
        return jsonify({
            "status": "offline",
            "source": "CelesTrak",
            "message": "Internal server error"
        }), 503


@app.route("/api/object/<object_id>", methods=["GET"])
def get_single_object(object_id: str):
    try:
        data = update_orbit_data()

        for obj in data.get("objects", []):
            if str(obj.get("id")) == str(object_id):
                return success_response({
                    "object": obj,
                })

        return error_response("Object not found", status_code=404, status="not_found")

    except Exception as error:
        logger.exception("Failed to fetch single object")
        return error_response(str(error))


@app.route("/api/high-risk", methods=["GET"])
def get_high_risk_objects():
    try:
        data = update_orbit_data()
        limit = parse_limit(default=25, maximum=100)

        high_risk_objects = data.get("high_risk_objects", [])

        return success_response({
            "threshold": HIGH_RISK_THRESHOLD,
            "count": len(high_risk_objects),
            "objects": high_risk_objects[:limit],
            "source": data.get("source"),
            "last_updated": data.get("last_updated"),
        })

    except Exception as error:
        logger.exception("Failed to fetch high-risk objects")
        return error_response(str(error))


@app.route("/api/risk", methods=["GET"])
def get_risk_dashboard():
    try:
        data = update_orbit_data()
        stats = data.get("stats", {})

        return success_response({
            "risk_level": stats.get("risk_level"),
            "risk_summary": stats.get("risk_summary"),
            "high_risk_objects": data.get("high_risk_objects", [])[:10],
            "last_updated": data.get("last_updated"),
            "source": data.get("source"),
        })

    except Exception as error:
        logger.exception("Failed to fetch risk dashboard")
        return error_response(str(error))


@app.route("/api/collision-risk", methods=["GET"])
def get_collision_risk():
    # Backward-compatible alias for the authoritative conjunction endpoint.
    try:
        refresh = str(request.args.get("refresh", "")).lower() in {"1", "true", "yes"}
        limit = request.args.get("limit", 250, type=int)

        payload, status_code = get_conjunction_snapshot(
            get_orbital_data,
            force=refresh,
            limit=limit,
        )

        response = dict(payload)
        events = list(payload.get("events") or [])
        diagnostics = (
            payload.get("diagnostics")
            if isinstance(payload.get("diagnostics"), dict)
            else {}
        )

        response.update({
            "deprecated": True,
            "replacement_endpoint": "/api/conjunctions",
            "risk_pairs": events,
            "total_objects_analyzed": diagnostics.get("objects_analyzed", 0),
        })

        return jsonify(response), status_code

    except Exception:
        logger.exception("Failed to fetch collision-risk compatibility response")
        return jsonify({
            "status": "error",
            "message": "Internal server error",
            "events": [],
            "risk_pairs": [],
            "deprecated": True,
            "replacement_endpoint": "/api/conjunctions",
        }), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    try:
        data = update_orbit_data()

        return success_response({
            "stats": data.get("stats", {}),
            "source": data.get("source"),
            "last_updated": data.get("last_updated"),
        })

    except Exception as error:
        logger.exception("Failed to fetch stats")
        return error_response(str(error))


@app.route("/api/search", methods=["GET"])
def search_objects():
    try:
        query = request.args.get("q", "").strip().lower()

        if not query:
            return error_response(
                "Search query is required. Use /api/search?q=ISS",
                status_code=400,
            )

        data = update_orbit_data()

        results = [
            obj
            for obj in data.get("objects", [])
            if query in str(obj.get("name", "")).lower()
            or query in str(obj.get("id", "")).lower()
            or query in str(obj.get("type", "")).lower()
        ]

        return success_response({
            "query": query,
            "count": len(results),
            "objects": results[:50],
        })

    except Exception as error:
        logger.exception("Search failed")
        return error_response(str(error))


# ============================================================
# AI Mission Briefing — grounded in real OrbitOPS snapshots
# ============================================================

def _read_json_snapshot(filename):
    import json

    path = os.path.join(os.path.dirname(__file__), "data", filename)

    try:
        with open(path, "r", encoding="utf-8") as snapshot_file:
            payload = json.load(snapshot_file)
            return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _write_json_snapshot(filename, payload):
    import json

    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    path = os.path.join(data_dir, filename)
    temporary_path = f"{path}.tmp"

    with open(temporary_path, "w", encoding="utf-8") as snapshot_file:
        json.dump(payload, snapshot_file, indent=2, ensure_ascii=False)

    os.replace(temporary_path, path)


def _event_severity(event):
    value = (
        event.get("severity")
        or event.get("risk_level")
        or event.get("risk")
        or event.get("level")
        or "MONITORED"
    )
    return str(value).strip().upper()


def _event_value(event, *keys, default=None):
    for key in keys:
        value = event.get(key)
        if value is not None:
            return value
    return default


def _compact_conjunction_event(event):
    return {
        "event_id": _event_value(event, "event_id", "id"),
        "severity": _event_severity(event),
        "object_a": _event_value(event, "object_a", "primary_name", "name_a"),
        "object_b": _event_value(event, "object_b", "secondary_name", "name_b"),
        "norad_a": _event_value(event, "norad_a", "primary_norad", "object_a_id"),
        "norad_b": _event_value(event, "norad_b", "secondary_norad", "object_b_id"),
        "closest_approach_utc": _event_value(
            event,
            "closest_approach_utc",
            "tca",
            "closest_approach",
        ),
        "miss_distance_km": _event_value(
            event,
            "miss_distance_km",
            "miss_distance",
            "distance_km",
        ),
        "relative_velocity_km_s": _event_value(
            event,
            "relative_velocity_km_s",
            "relative_velocity",
            "velocity_km_s",
        ),
        "altitude_km": _event_value(event, "altitude_km", "altitude"),
        "risk_index": _event_value(event, "risk_index", "risk_score", "score"),
    }


def _safe_number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _conjunction_context(snapshot):
    raw_events = snapshot.get("events")
    if not isinstance(raw_events, list):
        nested_data = snapshot.get("data")
        raw_events = nested_data.get("events") if isinstance(nested_data, dict) else []
    events = raw_events if isinstance(raw_events, list) else []

    counts = {
        "CRITICAL": 0,
        "HIGH": 0,
        "MEDIUM": 0,
        "MONITORED": 0,
    }

    for event in events:
        if not isinstance(event, dict):
            continue
        severity = _event_severity(event)
        if severity in counts:
            counts[severity] += 1
        elif severity in {"LOW", "INFO"}:
            counts["MONITORED"] += 1

    supplied_summary = snapshot.get("summary")
    if isinstance(supplied_summary, dict):
        aliases = {
            "CRITICAL": ("critical", "critical_events"),
            "HIGH": ("high", "high_risk", "high_events"),
            "MEDIUM": ("medium", "medium_events"),
            "MONITORED": ("monitored", "low", "monitored_events"),
        }
        for output_key, candidate_keys in aliases.items():
            for candidate_key in candidate_keys:
                if supplied_summary.get(candidate_key) is not None:
                    try:
                        counts[output_key] = int(supplied_summary[candidate_key])
                    except (TypeError, ValueError):
                        pass
                    break

    ranked = sorted(
        [event for event in events if isinstance(event, dict)],
        key=lambda event: _safe_number(
            _event_value(event, "risk_index", "risk_score", "score", default=0),
            0.0,
        ),
        reverse=True,
    )

    if counts["CRITICAL"] > 0:
        operational_level = "CRITICAL"
    elif counts["HIGH"] > 0:
        operational_level = "HIGH"
    elif counts["MEDIUM"] > 0:
        operational_level = "ELEVATED"
    elif events:
        operational_level = "MONITORED"
    else:
        operational_level = "NO ACTIVE EVENTS"

    return {
        "status": snapshot.get("status", "unavailable"),
        "screening_stage": snapshot.get("screening_stage"),
        "updated_at": snapshot.get("generated_at") or snapshot.get("last_updated"),
        "counts": counts,
        "total_events": len(events),
        "operational_level": operational_level,
        "top_events": [_compact_conjunction_event(event) for event in ranked[:8]],
    }


def _cached_ai_response(message=None):
    cache = _read_json_snapshot("ai_briefing_cache.json")
    briefing = cache.get("briefing")

    if not briefing:
        return None

    response = {
        "status": "cached",
        "model": cache.get("model", "unknown"),
        "briefing": briefing,
        "grounded": True,
        "cached": True,
        "generated_at": cache.get("generated_at"),
        "telemetry_source": cache.get("telemetry_source", "CelesTrak + SGP4"),
    }

    if message:
        response["message"] = message

    return response


@app.route("/api/ai/briefing", methods=["GET"])
def ai_mission_briefing():
    import json
    from datetime import datetime, timezone

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash").strip()

    if not api_key:
        cached = _cached_ai_response(
            "Live AI generation is unavailable because GEMINI_API_KEY is not configured."
        )
        if cached:
            return jsonify(cached)

        return jsonify({
            "status": "ai_unavailable",
            "model": model,
            "grounded": False,
            "message": (
                "GEMINI_API_KEY is not configured. OrbitOPS will not present a "
                "hard-coded briefing as AI-generated output."
            ),
        }), 503

    try:
        live_data = update_orbit_data()
        objects = live_data.get("objects", [])
        stats = live_data.get("stats", {})
        source = live_data.get("source", "CelesTrak")
        classification = stats.get("classification", {})
        altitude_bands = stats.get("altitude_bands", {})

        conjunction_snapshot = _read_json_snapshot("conjunction_snapshot.json")
        conjunctions = _conjunction_context(conjunction_snapshot)

        top_objects = []
        for item in live_data.get("high_risk_objects", [])[:10]:
            if not isinstance(item, dict):
                continue
            top_objects.append({
                "name": item.get("name"),
                "norad_id": item.get("norad_id") or item.get("id"),
                "type": item.get("type"),
                "altitude_km": item.get("altitude_km"),
                "velocity_km_s": item.get("velocity_km_s"),
                "screening_priority_score": item.get("risk_score"),
                "screening_priority_level": item.get("risk_level"),
            })

        generated_at = datetime.now(timezone.utc).isoformat()
        grounding_payload = {
            "generated_at_utc": generated_at,
            "telemetry": {
                "source": source,
                "propagator": "SGP4",
                "last_updated": live_data.get("last_updated"),
                "objects_in_current_frame": stats.get("total_objects", len(objects)),
                "classification": classification,
                "altitude_bands": altitude_bands,
            },
            "conjunction_screening": conjunctions,
            "priority_objects": top_objects,
            "limitations": [
                "Object priority scores are screening heuristics, not collision probabilities.",
                "Do not claim a collision probability unless a validated probability value exists in the event data.",
                "Do not label the whole mission CRITICAL solely because debris exists or because an object has a high heuristic score.",
                "Base the operational risk level primarily on the conjunction screening results.",
            ],
        }

        prompt = f"""
You are the OrbitOPS orbital operations analyst.

Create a concise, professional mission briefing using ONLY the supplied JSON telemetry and conjunction-screening data. Treat every number as evidence that must be traceable to the JSON. Do not invent launches, decays, probabilities, object ownership, maneuverability, or event details.

Important interpretation rules:
- A screening-priority score is not a collision probability.
- The mission-level risk must be based primarily on actual conjunction events.
- If conjunction screening is warming, incomplete, unavailable, or contains no active events, state that clearly rather than declaring CRITICAL.
- Use precise language such as "screening candidate", "miss distance", and "relative velocity" where supported.
- Give recommended actions tied to named events or measurable orbital conditions.
- Keep the briefing readable for a mission-control dashboard.

Return exactly these five sections as plain text:
1. Mission Status
2. Key Conjunction Observations
3. Orbital Environment
4. Recommended Operator Actions
5. Operational Risk Assessment

Grounding JSON:
{json.dumps(grounding_payload, ensure_ascii=False, separators=(",", ":"))}
""".strip()

        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/{model}:generateContent"
        )

        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.15,
                    "topP": 0.8,
                    "maxOutputTokens": 1400,
                },
            },
            timeout=45,
        )

        if response.status_code == 429:
            cached = _cached_ai_response(
                "Gemini rate limit reached. Showing the last genuinely AI-generated briefing."
            )
            if cached:
                return jsonify(cached)
            return jsonify({
                "status": "ai_unavailable",
                "model": model,
                "grounded": False,
                "message": "Gemini rate limit reached and no previous AI briefing is cached.",
            }), 503

        response.raise_for_status()
        result = response.json()
        candidates = result.get("candidates") or []
        parts = (
            candidates[0].get("content", {}).get("parts", [])
            if candidates
            else []
        )
        text = "\n".join(
            str(part.get("text", "")).strip()
            for part in parts
            if isinstance(part, dict) and part.get("text")
        ).strip()

        if not text:
            raise ValueError("Gemini returned an empty briefing")

        cache_payload = {
            "status": "ok",
            "model": model,
            "briefing": text,
            "grounded": True,
            "cached": False,
            "generated_at": generated_at,
            "telemetry_source": f"{source} + SGP4",
            "conjunction_status": conjunctions.get("status"),
            "conjunction_stage": conjunctions.get("screening_stage"),
        }
        _write_json_snapshot("ai_briefing_cache.json", cache_payload)
        return jsonify(cache_payload)

    except requests.RequestException as error:
        print(f"AI briefing provider error: {error}")
        cached = _cached_ai_response(
            "The AI provider is temporarily unavailable. Showing the last genuinely AI-generated briefing."
        )
        if cached:
            return jsonify(cached)
        return jsonify({
            "status": "ai_unavailable",
            "model": model,
            "grounded": False,
            "message": "The AI provider request failed and no previous AI briefing is cached.",
        }), 502

    except Exception as error:
        print(f"AI briefing error: {error}")
        cached = _cached_ai_response(
            "Live generation failed. Showing the last genuinely AI-generated briefing."
        )
        if cached:
            return jsonify(cached)
        return jsonify({
            "status": "ai_unavailable",
            "model": model,
            "grounded": False,
            "message": str(error),
        }), 500

# ============================================================
# Socket.IO Events
# ============================================================

@socketio.on("connect")
def socket_connect():
    start_background_worker_once()

    logger.info("Client connected to OrbitOPS socket")

    emit("connection_response", {
        "data": "Connected to OrbitOPS real-time data stream",
        "system": "OrbitOPS",
    })

    try:
        data = update_orbit_data()

        emit("orbital_data", data)
        emit("risk_update", {
            "stats": data.get("stats", {}),
            "high_risk_objects": data.get("high_risk_objects", [])[:20],
            "last_updated": data.get("last_updated"),
            "source": data.get("source"),
        })

        conjunction_payload, conjunction_status = (
            get_conjunction_snapshot(
                get_orbital_data,
                force=False,
                limit=5,
            )
        )
        if (
            conjunction_status == 200
            and isinstance(conjunction_payload, dict)
            and conjunction_payload.get("last_updated")
        ):
            emit(
                "conjunction_screening_complete",
                build_screening_complete_payload(
                    conjunction_payload
                ),
            )

    except Exception as error:
        logger.exception("Socket connect data load failed")

        emit("system_error", {
            "message": str(error),
        })


@socketio.on("disconnect")
def socket_disconnect():
    logger.info("Client disconnected from OrbitOPS socket")


# ============================================================
# React Frontend Serving
# Keep this after all /api routes.
# ============================================================



@app.route("/api/conjunction-history", methods=["GET"])
def get_conjunction_history():
    try:
        limit = request.args.get("limit", 250, type=int)
        status = request.args.get("status", "all")
        return jsonify(get_history_snapshot(
            limit=limit,
            status=status,
        )), 200
    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error),
        }), 400
    except Exception as error:
        app.logger.exception("OrbitOPS conjunction history endpoint failed")
        return jsonify({
            "status": "error",
            "message": "Conjunction history could not be read.",
            "detail": str(error),
            "events": [],
        }), 500


@app.route("/api/conjunctions", methods=["GET"])
def get_conjunctions():
    """Return cached conjunction screening immediately and refresh in the background."""
    try:
        refresh = str(request.args.get("refresh", "")).lower() in {"1", "true", "yes"}
        limit = request.args.get("limit", 250, type=int)
        payload, status_code = get_conjunction_snapshot(
            get_orbital_data,
            force=refresh,
            limit=limit,
        )
        return jsonify(payload), status_code
    except Exception as error:
        return jsonify({
            "status": "error",
            "message": str(error),
            "events": [],
            "summary": {
                "critical": 0,
                "high": 0,
                "medium": 0,
                "monitored": 0,
                "total": 0,
            },
        }), 500




# ORBITOPS_ANALYTICS_ROUTE_V1
@app.route("/api/analytics", methods=["GET"])
def orbitops_analytics():
    try:
        refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes"}
        window = request.args.get("window", "7d")
        object_type = request.args.get("object_type", "ALL")
        return jsonify(get_analytics_payload(
            window=window,
            object_type=object_type,
            refresh=refresh,
        ))
    except Exception as exc:
        app.logger.exception("OrbitOPS analytics endpoint failed")
        return jsonify({
            "status": "error",
            "message": "Analytics aggregation failed safely.",
            "detail": str(exc),
        }), 500




# ORBITOPS_OBJECT_CATALOG_ROUTE_V1
def _orbitops_catalog_filters():
    return {
        "query": request.args.get("query", ""),
        "object_types": request.args.get("object_types", ""),
        "regimes": request.args.get("regimes", ""),
        "min_altitude": request.args.get("min_altitude"),
        "max_altitude": request.args.get("max_altitude"),
        "min_inclination": request.args.get("min_inclination"),
        "max_inclination": request.args.get("max_inclination"),
        "owner": request.args.get("owner", "ALL"),
        "status": request.args.get("status", "ALL"),
        "sort_by": request.args.get("sort_by", "norad_id"),
        "sort_dir": request.args.get("sort_dir", "asc"),
    }


@app.route("/api/catalog", methods=["GET"])
def orbitops_object_catalog():
    try:
        refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes"}
        return jsonify(get_catalog_payload(
            page=request.args.get("page", 1, type=int),
            per_page=request.args.get("per_page", 25, type=int),
            refresh=refresh,
            **_orbitops_catalog_filters(),
        ))
    except Exception as exc:
        app.logger.exception("OrbitOPS object catalog endpoint failed")
        return jsonify({
            "status": "error",
            "message": "Object catalog aggregation failed safely.",
            "detail": str(exc),
        }), 500


@app.route("/api/catalog/object/<norad_id>", methods=["GET"])
def orbitops_object_catalog_detail(norad_id):
    try:
        refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes"}
        payload = get_catalog_object(norad_id, refresh=refresh)
        status_code = 404 if payload.get("status") == "error" else 200
        return jsonify(payload), status_code
    except Exception as exc:
        app.logger.exception("OrbitOPS catalog detail endpoint failed")
        return jsonify({
            "status": "error",
            "message": "Object detail lookup failed safely.",
            "detail": str(exc),
        }), 500


@app.route("/api/catalog/export", methods=["GET"])
def orbitops_object_catalog_export():
    try:
        return jsonify(get_catalog_export(**_orbitops_catalog_filters()))
    except Exception as exc:
        app.logger.exception("OrbitOPS catalog export endpoint failed")
        return jsonify({
            "status": "error",
            "message": "Object catalog export failed safely.",
            "detail": str(exc),
        }), 500


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    if path == "api" or path.startswith("api/"):
        return error_response(
            "API route not found",
            status_code=404,
        )

    if path:
        requested_file = safe_join(FRONTEND_DIST_DIR, path)

        if requested_file and os.path.isfile(requested_file):
            return send_from_directory(
                FRONTEND_DIST_DIR,
                path,
            )

    index_file = os.path.join(
        FRONTEND_DIST_DIR,
        "index.html",
    )

    if os.path.isfile(index_file):
        return send_from_directory(
            FRONTEND_DIST_DIR,
            "index.html",
        )

    return jsonify({
        "status": "frontend_not_built",
        "message": (
            "React build not found. Run `npm run build` "
            "inside the frontend folder."
        ),
        "backend": "OrbitOPS API is running.",
        "available_endpoints": [
            "/api/health",
            "/api/debris",
            "/api/objects",
            "/api/satellites/live",
            "/api/data-status",
            "/api/high-risk",
            "/api/risk",
            "/api/conjunctions",
            "/api/collision-risk",
            "/api/stats",
            "/api/search?q=ISS",
            "/api/ai/briefing",
        ],
    }), 200


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    start_background_worker_once()

    port = int(os.environ.get("PORT", "5050"))

    logger.info("Starting OrbitOPS server on port %s", port)
    logger.info("Frontend directory: %s", FRONTEND_DIST_DIR)

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
        allow_unsafe_werkzeug=True,
        use_reloader=False,
    )
