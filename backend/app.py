import numpy as np

# Monkey patch for numpy 2.0 compatibility (sgp4/skyfield fix)
if not hasattr(np, 'float_'):
    np.float_ = np.float64

from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from tle_parser import get_orbital_data
import time
import threading

app = Flask(__name__)
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

@socketio.on('connect')
def test_connect():
    print('Client connected to socket')
    emit('connection_response', {'data': 'Connected to OrbitOPS Data Stream'})

@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    # Start background thread
    socketio.start_background_task(data_background_thread)
    # Run server
    print("Starting Flask-SocketIO server on port 5000...")
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
