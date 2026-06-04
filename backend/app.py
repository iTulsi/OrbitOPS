import os
import time
import requests
import numpy as np

# Monkey patch for numpy 2.0 compatibility
if not hasattr(np, "float_"):
    np.float_ = np.float64

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from tle_parser import get_orbital_data


# Serve React production build from frontend/dist
dist_dir = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

app = Flask(__name__, static_folder=dist_dir, static_url_path="")
app.config["SECRET_KEY"] = "secret!"

CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# Global state
orbit_data = {
    "objects": [],
    "last_updated": 0,
    "stats": {},
    "source": "mock"
}


def update_orbit_data():
    """Fetch orbital data and update global state."""
    result = get_orbital_data()

    if result and isinstance(result, dict):
        objs = result.get("objects", [])
        source = result.get("source", "mock")
        current_time = time.time()

        total = len(objs)
        debris = sum(1 for x in objs if x.get("type") == "DEBRIS")
        active = sum(1 for x in objs if x.get("type") == "SATELLITE")
        rockets = sum(1 for x in objs if x.get("type") == "ROCKET_BODY")

        orbit_data["objects"] = objs
        orbit_data["last_updated"] = current_time
        orbit_data["source"] = source
        orbit_data["stats"] = {
            "total_objects": total,
            "classification": {
                "active_satellites": active,
                "debris": debris,
                "rocket_bodies": rockets
            },
            "risk_level": "CRITICAL" if debris > 12000 else "HIGH"
        }

        socketio.emit("orbital_data", orbit_data)

    return orbit_data


def data_background_thread():
    """Background thread to update and broadcast orbital data."""
    print("Background data thread started...")

    while True:
        try:
            update_orbit_data()
        except Exception as e:
            print(f"Error in background thread: {e}")

        socketio.sleep(30)


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "system": "OrbitOPS V2 Real-time"
    })


@app.route("/api/debris", methods=["GET"])
def get_debris():
    try:
        if not orbit_data["objects"]:
            update_orbit_data()

        return jsonify(orbit_data)

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    try:
        if not orbit_data["stats"]:
            update_orbit_data()

        return jsonify(orbit_data["stats"])

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/force_fetch", methods=["POST", "GET"])
def force_fetch():
    try:
        update_orbit_data()

        return jsonify({
            "status": "ok",
            "source": orbit_data["source"],
            "objects": len(orbit_data["objects"])
        })

    except Exception as e:
        print(f"Force fetch error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/ai/briefing", methods=["GET"])
def ai_mission_briefing():
    try:
        api_key = os.environ.get("GEMINI_API_KEY")

        if not orbit_data["objects"]:
            update_orbit_data()

        objects = orbit_data.get("objects", [])
        stats = orbit_data.get("stats", {})
        source = orbit_data.get("source", "unknown")
        sample_objects = objects[:5]

        fallback_briefing = f"""
1. Mission Status
OrbitOPS is actively monitoring orbital objects using the {source} data pipeline.

2. Key Risk Observations
The system is currently tracking {stats.get("total_objects", len(objects))} orbital objects. Debris and rocket body density should be reviewed continuously because unmanaged orbital objects can increase collision risk in crowded orbital zones.

3. Satellite/Debris Situation
Active satellites, debris, and rocket bodies are being classified and streamed to the dashboard in real time. The current system risk level is {stats.get("risk_level", "HIGH")}.

4. Recommended Operator Actions
Operators should review high-risk objects, monitor debris-heavy regions, refresh live data periodically, and inspect unusual altitude or velocity patterns.

5. Final Risk Level
Final risk level: {stats.get("risk_level", "HIGH")}.
"""

        if not api_key:
            return jsonify({
                "status": "fallback",
                "model": "rule-based-fallback",
                "briefing": fallback_briefing,
                "message": "GEMINI_API_KEY is not configured, so fallback briefing was generated."
            })

        prompt = f"""
You are OrbitOPS AI Mission Analyst.

Analyze this orbital monitoring data and generate a concise mission briefing.

Data source: {source}

Stats:
{stats}

Sample tracked objects:
{sample_objects}

Write in this structure:
1. Mission Status
2. Key Risk Observations
3. Satellite/Debris Situation
4. Recommended Operator Actions
5. Final Risk Level

Keep it professional, realistic, and understandable.
"""

        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/gemini-2.0-flash:generateContent?key={api_key}"
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
                "message": "Gemini free-tier quota/rate limit was reached. Showing fallback briefing."
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
            "model": "gemini-2.0-flash",
            "briefing": text
        })

    except Exception:
        return jsonify({
            "status": "fallback",
            "model": "safe-error-fallback",
            "briefing": "OrbitOPS AI Briefing is temporarily unavailable. The system is still tracking orbital objects and monitoring mission risk indicators.",
            "message": "AI briefing failed safely without exposing server secrets."
        })


@socketio.on("connect")
def test_connect():
    print("Client connected to socket")
    emit("connection_response", {"data": "Connected to OrbitOPS Data Stream"})

    if orbit_data["objects"]:
        emit("orbital_data", orbit_data)


@socketio.on("disconnect")
def test_disconnect():
    print("Client disconnected")


# React frontend route - keep this AFTER all /api routes
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        return jsonify({"error": "API route not found"}), 404

    file_path = os.path.join(app.static_folder, path)

    if path and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)

    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    socketio.start_background_task(data_background_thread)

    port = int(os.environ.get("PORT", 5050))
    print(f"Starting Flask-SocketIO server on port {port}...")

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True,
        use_reloader=False
    )