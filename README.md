# OrbitOPS

**Real-time orbital object monitoring, visualization, and space-debris intelligence platform.**

[![Live Application](https://img.shields.io/badge/Live-OrbitOPS-success)](https://orbitops-shjr.onrender.com)
![Backend](https://img.shields.io/badge/Backend-Flask-blue)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-646CFF)
![Visualization](https://img.shields.io/badge/Visualization-Three.js-black)
![Propagation](https://img.shields.io/badge/Propagation-SGP4-orange)
![Data](https://img.shields.io/badge/Data-CelesTrak-green)

OrbitOPS is a full-stack space situational awareness project that retrieves genuine orbital elements from CelesTrak, propagates object positions using SGP4, evaluates risk indicators, and presents the results through an interactive mission-control interface.

## Live application

https://orbitops-shjr.onrender.com

> Render free-tier instances may require a short cold start after inactivity.

## Verified repository baseline

The current automated baseline includes:

- Genuine CelesTrak OMM JSON/GP orbital elements
- Runtime SGP4 propagation
- Latitude, longitude, altitude, ECI position, and velocity output
- 48 backend tests passing
- 6 backend parameterized subtests passing
- Backend compilation checks passing
- Vite production build passing
- GitHub Actions backend and frontend jobs passing

Live object counts vary with the available CelesTrak snapshot and configured deployment limits.

## Features

- Real CelesTrak orbital-data ingestion
- SGP4 orbital propagation
- Interactive Three.js Earth visualization
- Satellite, debris, and rocket-body catalogue
- Object search and detailed telemetry
- Risk scoring and risk explanations
- Multi-epoch conjunction screening
- Conjunction history
- AI-assisted mission briefings
- Mission overview and analytics
- Alerts and reports
- Analytics history accumulated from genuine telemetry snapshots
- Production health endpoints
- Genuine orbital-data cache for upstream resilience
- Docker and Render deployment
- GitHub Actions continuous integration

## Architecture

```text
CelesTrak OMM JSON/GP
        |
        v
Orbital ingestion and real-data cache
        |
        v
SGP4 propagation engine
        |
        +-- Position and velocity calculation
        +-- Object classification
        +-- Risk analytics
        +-- Conjunction screening
        |
        v
Flask REST API and Socket.IO
        |
        v
React, Vite, Three.js and Recharts
```

## Technology stack

### Backend

Python, Flask, Flask-CORS, Flask-SocketIO, SGP4, Skyfield, NumPy, Requests, Gunicorn, and Pytest.

### Frontend

React, Vite, Three.js, React Three Fiber, Framer Motion, Recharts, Tailwind CSS, and Socket.IO client.

### Infrastructure

Docker, Render, GitHub Actions, ESLint, and Vite.

## Application routes

| Canonical route | Purpose |
|---|---|
| `/` | Landing page |
| `/overview` | Mission overview |
| `/live-tracking` | Interactive orbital globe and live telemetry |
| `/conjunctions` | Conjunction screening and event details |
| `/analytics` | Mission analytics and accumulated history |
| `/object-catalog` | Searchable orbital catalogue |
| `/reports` | AI-assisted mission briefings and reports |

The legacy routes `/visualization`, `/alerts`, `/satellites`, and `/launches`
currently redirect to their corresponding canonical pages.

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Deployment and backend health |
| `GET /api/data-status` | CelesTrak and cache status |
| `GET /api/debris` | Propagated orbital objects |
| `GET /api/objects` | Object catalogue |
| `GET /api/object/<id>` | Individual object details |
| `GET /api/risk` | Risk analytics |
| `GET /api/high-risk` | High-risk objects |
| `GET /api/conjunctions` | Conjunction screening |
| `GET /api/conjunction-history` | Conjunction history |
| `GET /api/stats` | Platform statistics |
| `GET /api/search` | Object search |
| `GET /api/ai/briefing` | AI-assisted mission briefing |

## Example production object

```json
{
  "name": "FENGYUN 1C",
  "norad_id": 25730,
  "type": "DEBRIS",
  "lat": -66.211643,
  "lon": -141.133523,
  "altitude_km": 819.749,
  "velocity_km_s": 7.44595,
  "propagator": "SGP4",
  "element_source": "CelesTrak",
  "data_mode": "live-propagated"
}
```

## Deployment behavior

The Render/Docker deployment is the authoritative long-running backend runtime.
It supports background refresh workers, filesystem-backed snapshots, and
Socket.IO communication.

The repository also contains a Vercel compatibility runtime. That runtime uses
serverless execution, reduced object and event limits, ephemeral `/tmp` storage,
disabled background workers, and frontend polling. It is therefore not
operationally equivalent to the Render deployment.

The planned production-hardening work will converge OrbitOPS on one authoritative
backend execution model instead of maintaining two divergent implementations.

## Engineering boundaries

- OrbitOPS provides screening-priority heuristics, not physical collision probability.
- Generated risk scores must not be treated as maneuver recommendations.
- Gesture controls are documented as planned work and are not currently implemented.
- Production configuration, secrets, origins, timeouts, and operational limits must
  move toward validated environment-based configuration rather than embedded defaults.

## Local development

```bash
git clone https://github.com/iTulsi/OrbitOPS.git
cd OrbitOPS
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r requirements.txt
python backend/app.py
```

Start the frontend in another Terminal:

```bash
cd frontend
npm ci
npm run dev
```

## Testing

```bash
cd backend
.venv/bin/python -m pytest -q
```

```bash
cd frontend
npm run lint
npm run build
```

## Data resilience

OrbitOPS first attempts to retrieve current orbital elements from CelesTrak. When CelesTrak is temporarily unavailable, the application uses a curated cache containing genuine CelesTrak OMM records. Positions and velocities are still recalculated using SGP4 at runtime.

OrbitOPS does not silently replace unavailable orbital telemetry with fabricated mock objects.

## Disclaimer

OrbitOPS is an educational and portfolio engineering project. It is not affiliated with NASA, NORAD, CelesTrak, the United States Space Force, or any commercial space-traffic-management provider.

It must not be used as the sole source for spacecraft maneuver planning, collision-avoidance decisions, or operational flight safety.

## Author

**Tulsi Sanskrati Tomar**

- GitHub: [@iTulsi](https://github.com/iTulsi)
- Live application: [OrbitOPS](https://orbitops-shjr.onrender.com)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, testing, branch naming, and pull request guidelines.
