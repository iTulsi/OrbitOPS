import os
import requests
from flask import Flask, jsonify, send_from_directory

# Monkey patch for numpy 2.0 compatibility (sgp4/skyfield fix)
if not hasattr(np, 'float_'):
    np.float_ = np.float64

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from tle_parser import get_orbital_data
import time
import threading

dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
app = Flask(__name__, static_folder=dist_dir, static_url_path='')
app.config['SECRET_KEY'] = 'secret!'
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Global state
orbit_data = {
    "objects": [],
    "last_updated": 0,
    "stats": {},
    "source": "mock"
}

def data_background_thread():
    """Background thread to update and broadcast orbital data every 3 seconds."""
    print("Background data thread started...")
    while True:
        try:
            # Fetch and propagate
            result = get_orbital_data()
            if result and isinstance(result, dict):
                objs = result.get('objects', [])
                source = result.get('source', 'mock')

                current_time = time.time()

                # Calculate stats
                total = len(objs)
                debris = sum(1 for x in objs if x.get('type') == 'DEBRIS')
                active = sum(1 for x in objs if x.get('type') == 'SATELLITE')
                rockets = sum(1 for x in objs if x.get('type') == 'ROCKET_BODY')

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

                # Broadcast to all connected clients
                socketio.emit('orbital_data', orbit_data)
            
        except Exception as e:
            print(f"Error in background thread: {e}")
            
        socketio.sleep(3) # Non-blocking sleep

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "system": "OrbitOPS V2 Real-time"})

@app.route('/api/debris', methods=['GET'])
def get_debris():
    # Fallback for REST API (initial load)
    return jsonify(orbit_data if orbit_data["objects"] else {"status": "initializing"})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(orbit_data["stats"] if orbit_data["stats"] else {"status": "initializing"})


@app.route('/api/force_fetch', methods=['POST', 'GET'])
def force_fetch():
    """Force an immediate fetch from CelestTrak and return the updated source/status."""
    try:
        result = get_orbital_data()
        if result and isinstance(result, dict):
            objs = result.get('objects', [])
            source = result.get('source', 'mock')
            current_time = time.time()

            orbit_data["objects"] = objs
            orbit_data["last_updated"] = current_time
            orbit_data["source"] = source

            # Recompute stats quickly
            total = len(objs)
            debris = sum(1 for x in objs if x.get('type') == 'DEBRIS')
            active = sum(1 for x in objs if x.get('type') == 'SATELLITE')
            rockets = sum(1 for x in objs if x.get('type') == 'ROCKET_BODY')

            orbit_data["stats"] = {
                "total_objects": total,
                "classification": {
                    "active_satellites": active,
                    "debris": debris,
                    "rocket_bodies": rockets
                },
                "risk_level": "CRITICAL" if debris > 12000 else "HIGH"
            }

            # Broadcast new data
            socketio.emit('orbital_data', orbit_data)

            return jsonify({"status": "ok", "source": source, "objects": len(objs)})
    except Exception as e:
        print(f"Force fetch error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "no_data"}), 204

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
@app.route('/api/ai/briefing', methods=['GET'])
def ai_mission_briefing():
    try:
        api_key = os.environ.get("GEMINI_API_KEY")

        if not api_key:
            return jsonify({
                "status": "error",
                "message": "GEMINI_API_KEY is not configured on the server."
            }), 500

        objects = orbit_data.get("objects", [])
        stats = orbit_data.get("stats", {})
        source = orbit_data.get("source", "unknown")

        if not objects:
            return jsonify({
                "status": "no_data",
                "message": "No orbital data available yet. Wait a few seconds and try again."
            }), 400

        sample_objects = objects[:8]

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

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

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
        response.raise_for_status()
        result = response.json()

        text = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )

        return jsonify({
            "status": "ok",
            "model": "gemini-2.0-flash",
            "briefing": text
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
def serve_frontend(path):
    # Let API routes stay API routes
    if path.startswith('api/'):
        return jsonify({"error": "API route not found"}), 404

    # Serve real static files like JS/CSS/assets
    file_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)

    # React Router fallback for /dashboard, /visualization, etc.
    return send_from_directory(app.static_folder, 'index.html')
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path.startswith('api/'):
        return jsonify({"error": "API route not found"}), 404

    file_path = os.path.join(app.static_folder, path)

    if path and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)

    return send_from_directory(app.static_folder, 'index.html')

@socketio.on('connect')
def test_connect():
    print('Client connected to socket')
    emit('connection_response', {'data': 'Connected to OrbitOPS Data Stream'})

@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')
    
if __name__ == '__main__':
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