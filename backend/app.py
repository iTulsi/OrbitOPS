import os
import time
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple

import requests
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit

from risk_engine import analyze_collision_pairs
from tle_parser import get_orbital_data


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

SECRET_KEY = os.environ.get("SECRET_KEY", "orbitops-dev-secret")

UPDATE_INTERVAL_SECONDS = int(os.environ.get("UPDATE_INTERVAL_SECONDS", "30"))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "20"))
HIGH_RISK_THRESHOLD = int(os.environ.get("HIGH_RISK_THRESHOLD", "60"))

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")


# ============================================================
# Flask App
# ============================================================

app = Flask(
    __name__,
    static_folder=FRONTEND_DIST_DIR,
    static_url_path="",
)

app.config["SECRET_KEY"] = SECRET_KEY

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
    return jsonify({
        "status": status,
        "message": message,
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

    result = get_orbital_data()

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


def start_background_worker_once() -> None:
    global background_worker_started

    with background_worker_lock:
        if background_worker_started:
            return

        socketio.start_background_task(data_background_thread)
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
        limit = request.args.get("limit", type=int)

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

        if limit is not None and limit > 0:
            objects = objects[:min(limit, 100)]

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
        limit = request.args.get("limit", type=int)

        objects = data.get("objects", [])

        if limit is not None and limit > 0:
            objects = objects[:min(limit, 100)]

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
    try:
        data = update_orbit_data()
        objects = data.get("objects", [])

        risk_pairs = analyze_collision_pairs(objects)

        return success_response({
            "total_objects_analyzed": len(objects),
            "risk_pairs": risk_pairs,
            "model_type": "baseline-rule-based-risk-engine",
            "source": data.get("source"),
            "last_updated": data.get("last_updated"),
        })

    except Exception as error:
        logger.exception("Failed to analyze collision risk")
        return error_response(str(error))


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


@app.route("/api/force_fetch", methods=["POST", "GET"])
def force_fetch():
    try:
        data = update_orbit_data(force=True)

        return success_response({
            "source": data.get("source"),
            "objects": len(data.get("objects", [])),
            "high_risk_objects": len(data.get("high_risk_objects", [])),
            "risk_level": data.get("stats", {}).get("risk_level"),
            "last_updated": data.get("last_updated"),
        })

    except Exception as error:
        logger.exception("Force fetch failed")
        return error_response(str(error))


# ============================================================
# AI Mission Briefing
# ============================================================

def build_fallback_briefing(
    source: str,
    objects: List[Dict[str, Any]],
    stats: Dict[str, Any],
) -> str:
    classification = stats.get("classification", {})

    return f"""
1. Mission Status
OrbitOPS is actively monitoring orbital objects using the {source} data pipeline.

2. Key Risk Observations
The system is tracking {stats.get("total_objects", len(objects))} orbital objects.
Current mission risk level is {stats.get("risk_level", "UNKNOWN")}.

3. Satellite/Debris Situation
Classification summary:
- Active satellites: {classification.get("active_satellites", 0)}
- Debris: {classification.get("debris", 0)}
- Rocket bodies: {classification.get("rocket_bodies", 0)}

4. Recommended Operator Actions
Operators should prioritize high-risk objects, monitor crowded LEO altitude bands,
refresh live tracking data, and inspect objects with missing altitude or velocity values.

5. Final Risk Level
Final risk level: {stats.get("risk_level", "UNKNOWN")}.
""".strip()


@app.route("/api/ai/briefing", methods=["GET"])
def ai_mission_briefing():
    try:
        data = update_orbit_data()

        objects = data.get("objects", [])
        stats = data.get("stats", {})
        source = data.get("source", "unknown")
        high_risk_objects = data.get("high_risk_objects", [])[:5]

        fallback_briefing = build_fallback_briefing(
            source=source,
            objects=objects,
            stats=stats,
        )

        if not GEMINI_API_KEY:
            return jsonify({
                "status": "fallback",
                "model": "rule-based-fallback",
                "briefing": fallback_briefing,
                "message": "GEMINI_API_KEY is not configured.",
            })

        prompt = f"""
You are OrbitOPS AI Mission Analyst.

Analyze this orbital monitoring data and generate a concise mission briefing.

Data source:
{source}

System stats:
{stats}

Top high-risk objects:
{high_risk_objects}

Write in this structure:
1. Mission Status
2. Key Risk Observations
3. Satellite/Debris Situation
4. Recommended Operator Actions
5. Final Risk Level

Important:
- Do not exaggerate.
- Do not claim exact collision probability.
- Explain risk based on tracking, object type, altitude, and velocity.
- Keep it professional and dashboard-ready.
""".strip()

        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }

        response = requests.post(url, json=payload, timeout=30)

        if response.status_code == 429:
            return jsonify({
                "status": "fallback",
                "model": "quota-safe-fallback",
                "briefing": fallback_briefing,
                "message": "Gemini quota or rate limit reached.",
            })

        response.raise_for_status()
        result = response.json()

        briefing = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )

        if not briefing:
            briefing = fallback_briefing

        return success_response({
            "model": GEMINI_MODEL,
            "briefing": briefing,
        })

    except Exception:
        logger.exception("AI briefing failed")

        return jsonify({
            "status": "fallback",
            "model": "safe-error-fallback",
            "briefing": (
                "OrbitOPS AI Briefing is temporarily unavailable. "
                "The system is still tracking orbital objects and monitoring mission risk indicators."
            ),
            "message": "AI briefing failed safely without exposing server secrets.",
        })


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

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    if path.startswith("api/"):
        return error_response("API route not found", status_code=404)

    if path:
        requested_file = os.path.join(app.static_folder, path)

        if os.path.exists(requested_file):
            return send_from_directory(app.static_folder, path)

    index_file = os.path.join(app.static_folder, "index.html")

    if os.path.exists(index_file):
        return send_from_directory(app.static_folder, "index.html")

    return jsonify({
        "status": "frontend_not_built",
        "message": "React build not found. Run `npm run build` inside the frontend folder.",
        "backend": "OrbitOPS API is running.",
        "available_endpoints": [
            "/api/health",
            "/api/debris",
            "/api/objects",
            "/api/high-risk",
            "/api/risk",
            "/api/collision-risk",
            "/api/stats",
            "/api/search?q=ISS",
            "/api/ai/briefing",
            "/api/force_fetch",
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