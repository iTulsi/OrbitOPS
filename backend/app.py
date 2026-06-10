import os
import time
import threading
import requests
import numpy as np
from risk_engine import analyze_collision_pairs

# Monkey patch for numpy 2.0 compatibility
if not hasattr(np, "float_"):
    np.float_ = np.float64

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from tle_parser import get_orbital_data


# ============================================================
# OrbitOPS V3 Backend
# Features:
# - Real-time orbital object streaming
# - Risk scoring engine
# - High-risk object API
# - Search/filter APIs
# - AI mission briefing
# - Safe frontend serving
# ============================================================


# Serve React production build from frontend/dist
dist_dir = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

app = Flask(__name__, static_folder=dist_dir, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "orbitops-dev-secret")

CORS(app, resources={r"/*": {"origins": "*"}})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)
@app.route("/api/collision-risk", methods=["GET"])
def get_collision_risk():
    objects = orbit_data.get("objects", [])

    risk_pairs = analyze_collision_pairs(objects)

    return jsonify({
        "total_objects_analyzed": len(objects),
        "risk_pairs": risk_pairs,
        "model_type": "baseline-rule-based-risk-engine",
        "status": "success"
    })


# ============================================================
# Config
# ============================================================

UPDATE_INTERVAL_SECONDS = int(os.environ.get("UPDATE_INTERVAL_SECONDS", 30))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", 20))
HIGH_RISK_THRESHOLD = int(os.environ.get("HIGH_RISK_THRESHOLD", 60))
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


# ============================================================
# Global State
# ============================================================

orbit_data = {
    "objects": [],
    "high_risk_objects": [],
    "last_updated": 0,
    "stats": {},
    "source": "mock",
    "status": "starting",
    "last_error": None
}

data_lock = threading.Lock()


# ============================================================
# Utility Helpers
# ============================================================

def safe_float(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def get_first(obj, keys, default=None):
    for key in keys:
        if key in obj and obj.get(key) is not None:
            return obj.get(key)
    return default


def normalize_type(raw_type):
    if not raw_type:
        return "UNKNOWN"

    value = str(raw_type).upper()

    if "DEBRIS" in value:
        return "DEBRIS"
    if "ROCKET" in value:
        return "ROCKET_BODY"
    if "SAT" in value or "PAYLOAD" in value:
        return "SATELLITE"

    return value


def get_object_id(obj, index):
    return str(
        get_first(
            obj,
            ["id", "object_id", "norad_id", "satnum", "catalog_number", "name"],
            f"object-{index}"
        )
    )


def calculate_risk_score(obj):
    """
    Demo-level risk scoring.

    This is not a physics-grade collision model yet.
    It is a project-ready heuristic risk engine based on:
    - object type
    - altitude band
    - velocity
    - missing tracking fields
    """

    score = 0
    reasons = []

    object_type = normalize_type(obj.get("type"))

    altitude = safe_float(
        get_first(obj, ["altitude", "altitude_km", "alt_km", "height_km"])
    )

    velocity = safe_float(
        get_first(obj, ["velocity", "velocity_km_s", "speed", "speed_km_s"])
    )

    lat = safe_float(get_first(obj, ["lat", "latitude"]))
    lon = safe_float(get_first(obj, ["lon", "lng", "longitude"]))

    # Type-based score
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

    # Altitude-based score
    if altitude is not None:
        if 500 <= altitude <= 1200:
            score += 30
            reasons.append("Crowded LEO altitude band")

        elif 1200 < altitude <= 2000:
            score += 18
            reasons.append("Upper LEO orbital traffic zone")

        elif altitude < 300:
            score += 12
            reasons.append("Low altitude object may decay faster")

        elif altitude > 2000:
            score += 8
            reasons.append("High altitude object requires long-term tracking")
    else:
        score += 10
        reasons.append("Altitude data unavailable")

    # Velocity-based score
    if velocity is not None:
        if velocity >= 7.0:
            score += 15
            reasons.append("High orbital velocity")
        elif velocity >= 5.0:
            score += 8
            reasons.append("Moderate orbital velocity")
    else:
        score += 5
        reasons.append("Velocity data unavailable")

    # Position data completeness
    if lat is None or lon is None:
        score += 7
        reasons.append("Incomplete position data")

    score = min(score, 100)

    if score >= 75:
        level = "CRITICAL"
    elif score >= 60:
        level = "HIGH"
    elif score >= 35:
        level = "MEDIUM"
    else:
        level = "LOW"

    return score, level, reasons


def normalize_object(obj, index):
    object_id = get_object_id(obj, index)

    name = str(
        get_first(
            obj,
            ["name", "object_name", "satellite_name", "title"],
            f"Orbital Object {index + 1}"
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
        "lon": lon
    })

    normalized = {
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
        "risk_reasons": risk_reasons
    }

    return normalized


def build_stats(objects):
    total = len(objects)

    active = sum(1 for x in objects if x.get("type") == "SATELLITE")
    debris = sum(1 for x in objects if x.get("type") == "DEBRIS")
    rockets = sum(1 for x in objects if x.get("type") == "ROCKET_BODY")
    unknown = total - active - debris - rockets

    critical = sum(1 for x in objects if x.get("risk_level") == "CRITICAL")
    high = sum(1 for x in objects if x.get("risk_level") == "HIGH")
    medium = sum(1 for x in objects if x.get("risk_level") == "MEDIUM")
    low = sum(1 for x in objects if x.get("risk_level") == "LOW")

    altitude_bands = {
        "below_300_km": 0,
        "leo_300_1200_km": 0,
        "upper_leo_1200_2000_km": 0,
        "above_2000_km": 0,
        "unknown": 0
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
            "active_satellites": active,
            "debris": debris,
            "rocket_bodies": rockets,
            "unknown": unknown
        },
        "risk_summary": {
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low
        },
        "altitude_bands": altitude_bands,
        "risk_level": overall_risk,
        "high_risk_threshold": HIGH_RISK_THRESHOLD
    }


# ============================================================
# Data Update Engine
# ============================================================

def update_orbit_data(force=False):
    """
    Fetch orbital data, normalize it, calculate risk, and broadcast updates.
    """

    current_time = time.time()

    with data_lock:
        if (
            not force
            and orbit_data["objects"]
            and current_time - orbit_data["last_updated"] < CACHE_TTL_SECONDS
        ):
            return orbit_data

    result = get_orbital_data()

    if not result or not isinstance(result, dict):
        raise ValueError("tle_parser.get_orbital_data() returned invalid data")

    raw_objects = result.get("objects", [])
    source = result.get("source", "mock")

    normalized_objects = [
        normalize_object(obj, index)
        for index, obj in enumerate(raw_objects)
        if isinstance(obj, dict)
    ]

    normalized_objects.sort(
        key=lambda x: x.get("risk_score", 0),
        reverse=True
    )

    high_risk_objects = [
        obj for obj in normalized_objects
        if obj.get("risk_score", 0) >= HIGH_RISK_THRESHOLD
    ]

    stats = build_stats(normalized_objects)

    with data_lock:
        orbit_data["objects"] = normalized_objects
        orbit_data["high_risk_objects"] = high_risk_objects
        orbit_data["last_updated"] = current_time
        orbit_data["source"] = source
        orbit_data["stats"] = stats
        orbit_data["status"] = "online"
        orbit_data["last_error"] = None

    socketio.emit("orbital_data", orbit_data)
    socketio.emit("risk_update", {
        "stats": stats,
        "high_risk_objects": high_risk_objects[:20],
        "last_updated": current_time,
        "source": source
    })

    return orbit_data


def data_background_thread():
    print("OrbitOPS background data thread started...")

    while True:
        try:
            update_orbit_data(force=True)
        except Exception as e:
            print(f"Error in background thread: {e}")

            with data_lock:
                orbit_data["status"] = "degraded"
                orbit_data["last_error"] = str(e)

            socketio.emit("system_error", {
                "status": "degraded",
                "message": "OrbitOPS data refresh failed safely."
            })

        socketio.sleep(UPDATE_INTERVAL_SECONDS)


# ============================================================
# API Routes
# ============================================================

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "system": "OrbitOPS V3 Real-time Risk Engine",
        "source": orbit_data.get("source"),
        "objects": len(orbit_data.get("objects", [])),
        "last_updated": orbit_data.get("last_updated"),
        "backend_status": orbit_data.get("status")
    })


@app.route("/api/debris", methods=["GET"])
def get_debris():
    try:
        data = update_orbit_data()

        object_type = request.args.get("type")
        risk_level = request.args.get("risk")
        limit = request.args.get("limit", type=int)

        objects = data["objects"]

        if object_type:
            objects = [
                obj for obj in objects
                if obj.get("type") == object_type.upper()
            ]

        if risk_level:
            objects = [
                obj for obj in objects
                if obj.get("risk_level") == risk_level.upper()
            ]

        if limit:
            objects = objects[:limit]

        return jsonify({
            **data,
            "objects": objects,
            "returned_objects": len(objects)
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/objects", methods=["GET"])
def get_objects():
    try:
        data = update_orbit_data()
        return jsonify({
            "status": "ok",
            "objects": data["objects"],
            "count": len(data["objects"]),
            "source": data["source"],
            "last_updated": data["last_updated"]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/object/<object_id>", methods=["GET"])
def get_single_object(object_id):
    try:
        data = update_orbit_data()

        for obj in data["objects"]:
            if str(obj.get("id")) == str(object_id):
                return jsonify({
                    "status": "ok",
                    "object": obj
                })

        return jsonify({
            "status": "not_found",
            "message": "Object not found"
        }), 404

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/high-risk", methods=["GET"])
def get_high_risk_objects():
    try:
        data = update_orbit_data()
        limit = request.args.get("limit", 25, type=int)

        return jsonify({
            "status": "ok",
            "threshold": HIGH_RISK_THRESHOLD,
            "count": len(data["high_risk_objects"]),
            "objects": data["high_risk_objects"][:limit],
            "source": data["source"],
            "last_updated": data["last_updated"]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/risk", methods=["GET"])
def get_risk_dashboard():
    try:
        data = update_orbit_data()

        return jsonify({
            "status": "ok",
            "risk_level": data["stats"].get("risk_level"),
            "risk_summary": data["stats"].get("risk_summary"),
            "high_risk_objects": data["high_risk_objects"][:10],
            "last_updated": data["last_updated"],
            "source": data["source"]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    try:
        data = update_orbit_data()

        return jsonify({
            "status": "ok",
            "stats": data["stats"],
            "source": data["source"],
            "last_updated": data["last_updated"]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/search", methods=["GET"])
def search_objects():
    try:
        query = request.args.get("q", "").strip().lower()

        if not query:
            return jsonify({
                "status": "error",
                "message": "Search query is required. Use /api/search?q=ISS"
            }), 400

        data = update_orbit_data()

        results = [
            obj for obj in data["objects"]
            if query in str(obj.get("name", "")).lower()
            or query in str(obj.get("id", "")).lower()
            or query in str(obj.get("type", "")).lower()
        ]

        return jsonify({
            "status": "ok",
            "query": query,
            "count": len(results),
            "objects": results[:50]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/force_fetch", methods=["POST", "GET"])
def force_fetch():
    try:
        data = update_orbit_data(force=True)

        return jsonify({
            "status": "ok",
            "source": data["source"],
            "objects": len(data["objects"]),
            "high_risk_objects": len(data["high_risk_objects"]),
            "risk_level": data["stats"].get("risk_level"),
            "last_updated": data["last_updated"]
        })

    except Exception as e:
        print(f"Force fetch error: {e}")

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# ============================================================
# AI Mission Briefing
# ============================================================

@app.route("/api/ai/briefing", methods=["GET"])
def ai_mission_briefing():
    try:
        api_key = os.environ.get("GEMINI_API_KEY")

        data = update_orbit_data()
        objects = data.get("objects", [])
        stats = data.get("stats", {})
        source = data.get("source", "unknown")
        high_risk_objects = data.get("high_risk_objects", [])[:5]

        fallback_briefing = f"""
1. Mission Status
OrbitOPS is actively monitoring orbital objects using the {source} data pipeline.

2. Key Risk Observations
The system is tracking {stats.get("total_objects", len(objects))} orbital objects. Current mission risk level is {stats.get("risk_level", "UNKNOWN")}.

3. Satellite/Debris Situation
Classification summary:
- Active satellites: {stats.get("classification", {}).get("active_satellites", 0)}
- Debris: {stats.get("classification", {}).get("debris", 0)}
- Rocket bodies: {stats.get("classification", {}).get("rocket_bodies", 0)}

4. Recommended Operator Actions
Operators should prioritize high-risk objects, monitor crowded LEO altitude bands, refresh live tracking data, and inspect objects with missing altitude or velocity values.

5. Final Risk Level
Final risk level: {stats.get("risk_level", "HIGH")}.
"""

        if not api_key:
            return jsonify({
                "status": "fallback",
                "model": "rule-based-fallback",
                "briefing": fallback_briefing,
                "message": "GEMINI_API_KEY is not configured."
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
"""

        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/{GEMINI_MODEL}:generateContent?key={api_key}"
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

        response = requests.post(url, json=payload, timeout=60)

        if response.status_code == 429:
            return jsonify({
                "status": "fallback",
                "model": "quota-safe-fallback",
                "briefing": fallback_briefing,
                "message": "Gemini quota or rate limit reached."
            })

        response.raise_for_status()
        result = response.json()

        text = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )

        if not text:
            text = fallback_briefing

        return jsonify({
            "status": "ok",
            "model": GEMINI_MODEL,
            "briefing": text
        })

    except Exception as e:
        print(f"AI briefing error: {e}")

        return jsonify({
            "status": "fallback",
            "model": "safe-error-fallback",
            "briefing": "OrbitOPS AI Briefing is temporarily unavailable. The system is still tracking orbital objects and monitoring mission risk indicators.",
            "message": "AI briefing failed safely without exposing server secrets."
        })


# ============================================================
# Socket.IO Events
# ============================================================

@socketio.on("connect")
def socket_connect():
    print("Client connected to OrbitOPS socket")

    emit("connection_response", {
        "data": "Connected to OrbitOPS Real-time Data Stream",
        "system": "OrbitOPS V3"
    })

    try:
        data = update_orbit_data()
        emit("orbital_data", data)
        emit("risk_update", {
            "stats": data["stats"],
            "high_risk_objects": data["high_risk_objects"][:20],
            "last_updated": data["last_updated"],
            "source": data["source"]
        })

    except Exception as e:
        emit("system_error", {
            "message": str(e)
        })


@socketio.on("disconnect")
def socket_disconnect():
    print("Client disconnected from OrbitOPS socket")


# ============================================================
# React Frontend Route
# Keep this AFTER all /api routes
# ============================================================

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        return jsonify({"error": "API route not found"}), 404

    if path:
        file_path = os.path.join(app.static_folder, path)

        if os.path.exists(file_path):
            return send_from_directory(app.static_folder, path)

    index_path = os.path.join(app.static_folder, "index.html")

    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, "index.html")

    return jsonify({
        "status": "frontend_not_built",
        "message": "React build not found. Run `npm run build` inside the frontend folder.",
        "backend": "OrbitOPS V3 API is running.",
        "available_endpoints": [
            "/api/health",
            "/api/debris",
            "/api/objects",
            "/api/high-risk",
            "/api/risk",
            "/api/stats",
            "/api/search?q=ISS",
            "/api/ai/briefing",
            "/api/force_fetch"
        ]
    })


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    socketio.start_background_task(data_background_thread)

    port = int(os.environ.get("PORT", 5050))

    print(f"Starting OrbitOPS V3 Flask-SocketIO server on port {port}...")
    print(f"Frontend directory: {dist_dir}")

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True,
        use_reloader=False
    )