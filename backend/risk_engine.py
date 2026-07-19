import math
from itertools import combinations


def safe_float(value, default=0.0):
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


def haversine_distance_km(lat1, lon1, lat2, lon2):
    """Approximate distance between two latitude/longitude points."""
    earth_radius_km = 6371.0

    lat1 = math.radians(safe_float(lat1))
    lon1 = math.radians(safe_float(lon1))
    lat2 = math.radians(safe_float(lat2))
    lon2 = math.radians(safe_float(lon2))

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def classify_risk(score):
    if score >= 75:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 35:
        return "MEDIUM"
    return "LOW"


def normalize_collision_object(obj):
    """Make different object formats compatible with the risk engine."""
    return {
        "id": get_first(obj, ["id", "object_id", "norad_id", "satnum"], "unknown"),
        "name": get_first(obj, ["name", "object_name", "satellite_name", "title"], "Unknown Object"),
        "type": str(get_first(obj, ["type", "object_type", "classification"], "UNKNOWN")).upper(),
        "lat": safe_float(get_first(obj, ["lat", "latitude"], 0)),
        "lon": safe_float(get_first(obj, ["lon", "lng", "longitude"], 0)),
        "altitude_km": safe_float(get_first(obj, ["altitude_km", "altitude", "alt_km", "height_km"], 0)),
        "velocity_km_s": safe_float(get_first(obj, ["velocity_km_s", "velocity", "speed", "speed_km_s"], 0)),
    }


def estimate_collision_risk(object_a, object_b):
    """
    Baseline OrbitOPS collision-risk model.

    This is a project-ready heuristic model based on:
    - object distance
    - altitude gap
    - velocity gap
    - debris/rocket-body involvement
    """

    a = normalize_collision_object(object_a)
    b = normalize_collision_object(object_b)

    distance_km = haversine_distance_km(
        a["lat"],
        a["lon"],
        b["lat"],
        b["lon"]
    )

    altitude_gap_km = abs(a["altitude_km"] - b["altitude_km"])
    velocity_gap_km_s = abs(a["velocity_km_s"] - b["velocity_km_s"])

    distance_score = max(0, 1 - distance_km / 500)
    altitude_score = max(0, 1 - altitude_gap_km / 100)
    velocity_score = min(1, velocity_gap_km_s / 15)

    debris_factor = 1.0

    if "DEBRIS" in a["type"] or "DEBRIS" in b["type"]:
        debris_factor += 0.20

    if "ROCKET" in a["type"] or "ROCKET" in b["type"]:
        debris_factor += 0.12

    risk_score = (
        distance_score * 0.45
        + altitude_score * 0.35
        + velocity_score * 0.20
    ) * 100 * debris_factor

    risk_score = round(min(risk_score, 100), 2)

    return {
        "object_a": a["name"],
        "object_b": b["name"],
        "object_a_type": a["type"],
        "object_b_type": b["type"],
        "distance_km": round(distance_km, 2),
        "altitude_gap_km": round(altitude_gap_km, 2),
        "velocity_gap_km_s": round(velocity_gap_km_s, 2),
        "risk_score": risk_score,
        "risk_level": classify_risk(risk_score)
    }


def analyze_collision_pairs(objects, limit=10):
    """Return top risky orbital-object pairs sorted by risk score."""

    if not objects or len(objects) < 2:
        return []

    risk_pairs = []

    for object_a, object_b in combinations(objects, 2):
        try:
            risk_pairs.append(estimate_collision_risk(object_a, object_b))
        except Exception:
            continue

    risk_pairs.sort(key=lambda item: item["risk_score"], reverse=True)

    return risk_pairs[:limit]


UNCONTROLLED_OBJECT_TYPES = frozenset({"DEBRIS", "ROCKET_BODY"})


def _require_non_negative_finite(value, *, field):
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a finite non-negative number") from exc
    if not math.isfinite(parsed) or parsed < 0:
        raise ValueError(f"{field} must be a finite non-negative number")
    return parsed


def _normalize_object_type(value):
    text = str(value or "UNKNOWN").upper().replace("-", "_").replace(" ", "_")
    if "DEBRIS" in text or text.endswith("_DEB"):
        return "DEBRIS"
    if "ROCKET" in text or "R_B" in text:
        return "ROCKET_BODY"
    if "SAT" in text or "PAYLOAD" in text:
        return "SATELLITE"
    return "UNKNOWN"


def _distance_priority(miss_distance_km):
    if miss_distance_km <= 1.0:
        return 98.0
    if miss_distance_km <= 5.0:
        return 92.0 - (miss_distance_km - 1.0) * 2.0
    if miss_distance_km <= 10.0:
        return 84.0 - (miss_distance_km - 5.0) * 1.4
    if miss_distance_km <= 25.0:
        return 72.0 - (miss_distance_km - 10.0) * 0.8
    if miss_distance_km <= 50.0:
        return 52.0 - (miss_distance_km - 25.0) * 0.6
    return 36.0 - (miss_distance_km - 50.0) * 0.36


def _classify_screening_priority(
    score,
    *,
    miss_distance_km,
    has_uncontrolled_object,
):
    # Reserve CRITICAL for a sub-kilometre event or a close approach that
    # involves an object that cannot manoeuvre. This limits alarm inflation.
    if score >= 90.0 and (miss_distance_km <= 1.0 or has_uncontrolled_object):
        return "CRITICAL"
    if score >= 70.0:
        return "HIGH"
    if score >= 40.0:
        return "MEDIUM"
    return "MONITORED"


def score_conjunction_event(
    *,
    miss_distance_km,
    relative_velocity_km_s=None,
    time_to_closest_approach_hours=0.0,
    object_a_type="UNKNOWN",
    object_b_type="UNKNOWN",
    has_full_state=True,
):
    """Return an explainable screening priority for a validated conjunction.

    This deterministic heuristic is not collision probability. Candidate
    detection and TCA refinement remain the conjunction service's concern.
    """
    distance = _require_non_negative_finite(
        miss_distance_km,
        field="miss_distance_km",
    )
    tca_hours = _require_non_negative_finite(
        time_to_closest_approach_hours,
        field="time_to_closest_approach_hours",
    )

    relative_velocity = None
    if relative_velocity_km_s is not None:
        relative_velocity = _require_non_negative_finite(
            relative_velocity_km_s,
            field="relative_velocity_km_s",
        )

    type_a = _normalize_object_type(object_a_type)
    type_b = _normalize_object_type(object_b_type)
    has_uncontrolled_object = bool(
        {type_a, type_b} & UNCONTROLLED_OBJECT_TYPES
    )

    distance_component = max(0.0, _distance_priority(distance))
    object_control_adjustment = 5.0 if has_uncontrolled_object else 0.0
    velocity_adjustment = (
        min(relative_velocity, 15.0) / 15.0 * 2.0
        if relative_velocity is not None
        else 0.0
    )
    if tca_hours <= 6.0:
        tca_adjustment = 2.0
    elif tca_hours < 24.0:
        tca_adjustment = (24.0 - tca_hours) / 18.0 * 2.0
    else:
        tca_adjustment = 0.0

    confidence_cap = None if has_full_state else 55.0
    score = min(
        100.0,
        distance_component
        + object_control_adjustment
        + velocity_adjustment
        + tca_adjustment,
    )
    if confidence_cap is not None:
        score = min(score, confidence_cap)
    score = round(max(0.0, score), 1)

    return {
        "score": score,
        "level": _classify_screening_priority(
            score,
            miss_distance_km=distance,
            has_uncontrolled_object=has_uncontrolled_object,
        ),
        "model_basis": (
            "linear-relative-motion" if has_full_state else "current-frame-proximity"
        ),
        "severity_basis": (
            "miss-distance-and-object-control-status-heuristic"
        ),
        "components": {
            "miss_distance": round(distance_component, 1),
            "relative_velocity": round(velocity_adjustment, 1),
            "tca_urgency": round(tca_adjustment, 1),
            "object_control": round(object_control_adjustment, 1),
            "confidence_cap": confidence_cap,
        },
    }
