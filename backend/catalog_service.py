from __future__ import annotations

import json
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OMM_CACHE_DIR = DATA_DIR / "celestrak_omm"
LIVE_SNAPSHOT_PATH = DATA_DIR / "live_orbit_snapshot.json"
SATCAT_CACHE_PATH = DATA_DIR / "satcat_onorbit.json"
SATCAT_META_PATH = DATA_DIR / "satcat_onorbit_meta.json"
DETAIL_CACHE_DIR = DATA_DIR / "catalog_details"

SATCAT_URL = "https://celestrak.org/satcat/records.php?ONORBIT=1&FORMAT=JSON"
SATCAT_DETAIL_URL = "https://celestrak.org/satcat/records.php?CATNR={catalog_id}&FORMAT=JSON"
GP_DETAIL_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR={catalog_id}&FORMAT=JSON"

SATCAT_REFRESH_SECONDS = int(os.getenv("ORBITOPS_SATCAT_REFRESH_SECONDS", "21600"))
DETAIL_REFRESH_SECONDS = int(os.getenv("ORBITOPS_CATALOG_DETAIL_REFRESH_SECONDS", "21600"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("ORBITOPS_CATALOG_REQUEST_TIMEOUT_SECONDS", "18"))
REQUEST_RETRIES = max(1, int(os.getenv("ORBITOPS_CATALOG_REQUEST_RETRIES", "2")))
MAX_EXPORT_ROWS = max(1000, int(os.getenv("ORBITOPS_CATALOG_MAX_EXPORT_ROWS", "50000")))

EARTH_RADIUS_KM = 6378.137
EARTH_MU_KM3_S2 = 398600.4418

_STATE_LOCK = threading.RLock()
_REFRESH_THREAD: threading.Thread | None = None
_LAST_REFRESH_ERROR: str | None = None
_CATALOG_RECORDS: list[dict[str, Any]] = []
_CATALOG_INDEX: dict[str, dict[str, Any]] = {}
_CATALOG_META: dict[str, Any] = {}

ACTIVE_CODES = {"+", "P", "B", "S", "X"}
STATUS_LABELS = {
    "+": "OPERATIONAL",
    "-": "NONOPERATIONAL",
    "P": "PARTIAL",
    "B": "STANDBY",
    "S": "SPARE",
    "X": "EXTENDED",
    "D": "DECAYED",
    "?": "UNKNOWN",
    "": "UNKNOWN",
}

OWNER_NAMES = {
    "AB": "Arabsat",
    "ABS": "Asia Broadcast Satellite",
    "AC": "AsiaSat",
    "ALG": "Algeria",
    "ARGN": "Argentina",
    "AUS": "Australia",
    "BEL": "Belgium",
    "BELA": "Belarus",
    "BGD": "Bangladesh",
    "BRAZ": "Brazil",
    "CA": "Canada",
    "CHBZ": "China / Brazil",
    "CHLE": "Chile",
    "CIS": "Commonwealth of Independent States",
    "CZCH": "Czech Republic",
    "DEN": "Denmark",
    "EGYP": "Egypt",
    "ESA": "European Space Agency",
    "EUME": "EUMETSAT",
    "EUTE": "Eutelsat",
    "FIN": "Finland",
    "FR": "France",
    "GER": "Germany",
    "GLOB": "Globalstar",
    "GREC": "Greece",
    "HUN": "Hungary",
    "IND": "India",
    "INDO": "Indonesia",
    "IRAN": "Iran",
    "IRID": "Iridium",
    "IRL": "Ireland",
    "ISRA": "Israel",
    "ISRO": "Indian Space Research Organisation",
    "ISS": "International Space Station",
    "IT": "Italy",
    "ITSO": "Intelsat",
    "JPN": "Japan",
    "KAZ": "Kazakhstan",
    "LUXE": "Luxembourg",
    "MALA": "Malaysia",
    "MEX": "Mexico",
    "NATO": "NATO",
    "NETH": "Netherlands",
    "NIG": "Nigeria",
    "NKOR": "North Korea",
    "NOR": "Norway",
    "NZ": "New Zealand",
    "O3B": "O3b Networks",
    "ORB": "ORBCOMM",
    "PAKI": "Pakistan",
    "POL": "Poland",
    "POR": "Portugal",
    "PRC": "China",
    "ROC": "Taiwan",
    "ROM": "Romania",
    "RP": "Philippines",
    "SAFR": "South Africa",
    "SAUD": "Saudi Arabia",
    "SES": "SES",
    "SING": "Singapore",
    "SKOR": "South Korea",
    "SPN": "Spain",
    "SWED": "Sweden",
    "SWTZ": "Switzerland",
    "THAI": "Thailand",
    "TURK": "Türkiye",
    "UAE": "United Arab Emirates",
    "UK": "United Kingdom",
    "UKR": "Ukraine",
    "UNK": "Unknown",
    "US": "United States",
    "USBZ": "United States / Brazil",
    "VENZ": "Venezuela",
    "VTNM": "Vietnam",
}

OWNER_FLAGS = {
    "ALG": "🇩🇿", "ARGN": "🇦🇷", "AUS": "🇦🇺", "BEL": "🇧🇪", "BELA": "🇧🇾",
    "BGD": "🇧🇩", "BRAZ": "🇧🇷", "CA": "🇨🇦", "CHLE": "🇨🇱", "CZCH": "🇨🇿",
    "DEN": "🇩🇰", "EGYP": "🇪🇬", "FIN": "🇫🇮", "FR": "🇫🇷", "GER": "🇩🇪",
    "GREC": "🇬🇷", "HUN": "🇭🇺", "IND": "🇮🇳", "INDO": "🇮🇩", "IRAN": "🇮🇷",
    "IRL": "🇮🇪", "ISRA": "🇮🇱", "IT": "🇮🇹", "JPN": "🇯🇵", "KAZ": "🇰🇿",
    "LUXE": "🇱🇺", "MALA": "🇲🇾", "MEX": "🇲🇽", "NETH": "🇳🇱", "NIG": "🇳🇬",
    "NKOR": "🇰🇵", "NOR": "🇳🇴", "NZ": "🇳🇿", "PAKI": "🇵🇰", "POL": "🇵🇱",
    "POR": "🇵🇹", "PRC": "🇨🇳", "ROC": "🇹🇼", "ROM": "🇷🇴", "RP": "🇵🇭",
    "SAFR": "🇿🇦", "SAUD": "🇸🇦", "SING": "🇸🇬", "SKOR": "🇰🇷", "SPN": "🇪🇸",
    "SWED": "🇸🇪", "SWTZ": "🇨🇭", "THAI": "🇹🇭", "TURK": "🇹🇷", "UAE": "🇦🇪",
    "UK": "🇬🇧", "UKR": "🇺🇦", "US": "🇺🇸", "VENZ": "🇻🇪", "VTNM": "🇻🇳",
    "ESA": "🌐", "ISS": "🌐", "NATO": "🌐", "UNK": "◉",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(value: datetime | None = None) -> str:
    return (value or _utc_now()).isoformat().replace("+00:00", "Z")


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def _write_json_atomic(path: Path, payload: Any, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=indent, separators=None if indent else (",", ":")),
        encoding="utf-8",
    )
    temporary.replace(path)


def _float(value: Any, default: float | None = None) -> float | None:
    try:
        parsed = float(value)
        if math.isfinite(parsed):
            return parsed
    except (TypeError, ValueError):
        pass
    return default


def _catalog_id(record: dict[str, Any]) -> str:
    value = record.get("NORAD_CAT_ID")
    if value is None:
        value = record.get("norad_id") or record.get("id")
    return str(value or "").strip()


def _object_type(raw: Any, name: str = "", forced: str | None = None) -> str:
    if forced:
        return forced
    value = str(raw or "").upper().strip()
    upper_name = name.upper()
    if value in {"PAY", "PAYLOAD", "SATELLITE"}:
        return "PAYLOAD"
    if value in {"R/B", "ROCKET BODY", "ROCKET_BODY"} or " R/B" in upper_name or upper_name.endswith("R/B"):
        return "ROCKET_BODY"
    if value in {"DEB", "DEBRIS"} or " DEB" in upper_name or "DEBRIS" in upper_name:
        return "DEBRIS"
    return "UNKNOWN"


def _orbital_values_from_mean_motion(mean_motion: Any, eccentricity: Any) -> dict[str, float | None]:
    motion = _float(mean_motion)
    ecc = max(0.0, min(_float(eccentricity, 0.0) or 0.0, 0.999999))
    if not motion or motion <= 0:
        return {
            "period_min": None,
            "altitude_km": None,
            "apogee_km": None,
            "perigee_km": None,
            "velocity_km_s": None,
        }

    period_seconds = 86400.0 / motion
    semi_major_axis = (EARTH_MU_KM3_S2 * (period_seconds / (2.0 * math.pi)) ** 2) ** (1.0 / 3.0)
    altitude = semi_major_axis - EARTH_RADIUS_KM
    apogee = semi_major_axis * (1.0 + ecc) - EARTH_RADIUS_KM
    perigee = semi_major_axis * (1.0 - ecc) - EARTH_RADIUS_KM
    velocity = math.sqrt(EARTH_MU_KM3_S2 / semi_major_axis)
    return {
        "period_min": period_seconds / 60.0,
        "altitude_km": altitude,
        "apogee_km": apogee,
        "perigee_km": perigee,
        "velocity_km_s": velocity,
    }


def _orbital_regime(altitude: float | None, perigee: float | None, apogee: float | None) -> str:
    if perigee is not None and apogee is not None and perigee < 2000 and apogee > 37000:
        return "HEO"
    if altitude is None:
        return "UNKNOWN"
    if altitude < 2000:
        return "LEO"
    if altitude < 35000:
        return "MEO"
    if altitude <= 37000:
        return "GEO"
    return "HEO"


def _status_info(code: Any, object_type: str) -> tuple[str, bool]:
    normalized = str(code or "").strip().upper()
    if object_type != "PAYLOAD" and normalized not in {"D"}:
        return "TRACKED", False
    return STATUS_LABELS.get(normalized, "UNKNOWN"), normalized in ACTIVE_CODES


def _normalize_satcat_record(record: dict[str, Any], live_index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    catalog_id = _catalog_id(record)
    if not catalog_id:
        return None

    name = str(record.get("OBJECT_NAME") or f"NORAD {catalog_id}").strip()
    object_type = _object_type(record.get("OBJECT_TYPE"), name)
    status, is_active = _status_info(record.get("OPS_STATUS_CODE"), object_type)
    owner_code = str(record.get("OWNER") or "UNK").strip().upper() or "UNK"

    apogee = _float(record.get("APOGEE"))
    perigee = _float(record.get("PERIGEE"))
    period = _float(record.get("PERIOD"))
    altitude = None
    if apogee is not None and perigee is not None:
        altitude = (apogee + perigee) / 2.0

    velocity = None
    if altitude is not None and altitude > -EARTH_RADIUS_KM:
        velocity = math.sqrt(EARTH_MU_KM3_S2 / (EARTH_RADIUS_KM + altitude))

    live = live_index.get(catalog_id)
    if live:
        altitude = _float(live.get("altitude_km"), altitude)
        velocity = _float(live.get("velocity_km_s"), velocity)

    regime = _orbital_regime(altitude, perigee, apogee)
    updated_at = None
    if live:
        updated_at = live.get("position_timestamp") or live.get("element_epoch")

    return {
        "norad_id": catalog_id,
        "name": name,
        "international_designator": record.get("OBJECT_ID"),
        "type": object_type,
        "owner_code": owner_code,
        "country": OWNER_NAMES.get(owner_code, owner_code if owner_code != "UNK" else "Unknown"),
        "flag": OWNER_FLAGS.get(owner_code, "◉"),
        "status": status,
        "ops_status_code": str(record.get("OPS_STATUS_CODE") or ""),
        "is_active": is_active,
        "launch_date": record.get("LAUNCH_DATE"),
        "launch_site": record.get("LAUNCH_SITE"),
        "decay_date": record.get("DECAY_DATE"),
        "period_min": round(period, 4) if period is not None else None,
        "inclination_deg": _float(record.get("INCLINATION")),
        "apogee_km": apogee,
        "perigee_km": perigee,
        "altitude_km": round(altitude, 3) if altitude is not None else None,
        "velocity_km_s": round(velocity, 5) if velocity is not None else None,
        "orbital_regime": regime,
        "rcs_m2": _float(record.get("RCS")),
        "data_status_code": record.get("DATA_STATUS_CODE"),
        "orbit_center": record.get("ORBIT_CENTER") or "EA",
        "orbit_type": record.get("ORBIT_TYPE") or "ORB",
        "updated_at": updated_at,
        "data_source": "CelesTrak SATCAT",
        "has_live_state": bool(live),
    }


def _normalize_omm_record(record: dict[str, Any], source_name: str, live_index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    catalog_id = _catalog_id(record)
    if not catalog_id:
        return None

    name = str(record.get("OBJECT_NAME") or f"NORAD {catalog_id}").strip()
    forced = "DEBRIS" if "debris" in source_name else "ROCKET_BODY" if "rocket" in source_name else None
    object_type = _object_type(record.get("OBJECT_TYPE"), name, forced)
    owner_code = str(record.get("COUNTRY_CODE") or record.get("OWNER") or "UNK").strip().upper() or "UNK"
    status = "ACTIVE" if source_name == "active" and object_type == "PAYLOAD" else "TRACKED"
    is_active = status == "ACTIVE"

    derived = _orbital_values_from_mean_motion(record.get("MEAN_MOTION"), record.get("ECCENTRICITY"))
    live = live_index.get(catalog_id)
    altitude = _float(live.get("altitude_km"), derived["altitude_km"]) if live else derived["altitude_km"]
    velocity = _float(live.get("velocity_km_s"), derived["velocity_km_s"]) if live else derived["velocity_km_s"]
    regime = _orbital_regime(altitude, derived["perigee_km"], derived["apogee_km"])

    return {
        "norad_id": catalog_id,
        "name": name,
        "international_designator": record.get("OBJECT_ID"),
        "type": object_type,
        "owner_code": owner_code,
        "country": OWNER_NAMES.get(owner_code, owner_code if owner_code != "UNK" else "Unknown"),
        "flag": OWNER_FLAGS.get(owner_code, "◉"),
        "status": status,
        "ops_status_code": "+" if is_active else "",
        "is_active": is_active,
        "launch_date": record.get("LAUNCH_DATE"),
        "launch_site": record.get("SITE"),
        "decay_date": None,
        "period_min": round(derived["period_min"], 4) if derived["period_min"] is not None else None,
        "inclination_deg": _float(record.get("INCLINATION")),
        "apogee_km": round(derived["apogee_km"], 3) if derived["apogee_km"] is not None else None,
        "perigee_km": round(derived["perigee_km"], 3) if derived["perigee_km"] is not None else None,
        "altitude_km": round(altitude, 3) if altitude is not None else None,
        "velocity_km_s": round(velocity, 5) if velocity is not None else None,
        "orbital_regime": regime,
        "rcs_m2": None,
        "data_status_code": None,
        "orbit_center": "EA",
        "orbit_type": "ORB",
        "updated_at": (live or {}).get("position_timestamp") or record.get("EPOCH"),
        "data_source": "CelesTrak OMM preview",
        "has_live_state": bool(live),
    }


def _load_live_index() -> dict[str, dict[str, Any]]:
    payload = _read_json(LIVE_SNAPSHOT_PATH, {})
    objects = payload.get("objects", []) if isinstance(payload, dict) else []
    index: dict[str, dict[str, Any]] = {}
    if isinstance(objects, list):
        for item in objects:
            if not isinstance(item, dict):
                continue
            catalog_id = str(item.get("norad_id") or item.get("id") or "").strip()
            if catalog_id:
                index[catalog_id] = item
    return index


def _build_preview_records() -> list[dict[str, Any]]:
    live_index = _load_live_index()
    records: list[dict[str, Any]] = []
    seen: set[str] = set()

    if OMM_CACHE_DIR.exists():
        for path in sorted(OMM_CACHE_DIR.glob("*.json")):
            source_name = path.stem
            payload = _read_json(path, [])
            if not isinstance(payload, list):
                continue
            for record in payload:
                if not isinstance(record, dict):
                    continue
                normalized = _normalize_omm_record(record, source_name, live_index)
                if not normalized or normalized["norad_id"] in seen:
                    continue
                seen.add(normalized["norad_id"])
                records.append(normalized)

    if not records:
        for live in live_index.values():
            record = {
                "NORAD_CAT_ID": live.get("norad_id") or live.get("id"),
                "OBJECT_NAME": live.get("name"),
                "OBJECT_TYPE": live.get("type"),
                "EPOCH": live.get("element_epoch"),
            }
            normalized = _normalize_omm_record(record, str(live.get("source_group") or "live"), live_index)
            if normalized and normalized["norad_id"] not in seen:
                seen.add(normalized["norad_id"])
                records.append(normalized)

    return records


def _download_json(url: str) -> Any:
    headers = {
        "User-Agent": "OrbitOPS/4.0 (educational orbital catalog; contact: tulsitomar2019@gmail.com)",
        "Accept": "application/json",
    }
    last_error: Exception | None = None
    for attempt in range(1, REQUEST_RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < REQUEST_RETRIES:
                time.sleep(0.8 * attempt)
    raise RuntimeError(f"CelesTrak request failed: {last_error}")


def _satcat_cache_is_fresh() -> bool:
    if not SATCAT_CACHE_PATH.exists():
        return False
    return (time.time() - SATCAT_CACHE_PATH.stat().st_mtime) < SATCAT_REFRESH_SECONDS


def _publish(records: list[dict[str, Any]], meta: dict[str, Any]) -> None:
    global _CATALOG_RECORDS, _CATALOG_INDEX, _CATALOG_META
    index = {str(item["norad_id"]): item for item in records if item.get("norad_id")}
    with _STATE_LOCK:
        _CATALOG_RECORDS = records
        _CATALOG_INDEX = index
        _CATALOG_META = meta


def _load_initial_catalog() -> None:
    cached = _read_json(SATCAT_CACHE_PATH, [])
    metadata = _read_json(SATCAT_META_PATH, {})
    live_index = _load_live_index()

    if isinstance(cached, list) and cached:
        normalized = [
            item
            for item in (_normalize_satcat_record(record, live_index) for record in cached if isinstance(record, dict))
            if item
        ]
        if normalized:
            _publish(normalized, {
                "scope": "complete",
                "source_status": "live" if _satcat_cache_is_fresh() else "cached",
                "last_updated": metadata.get("last_updated") or _iso_utc(datetime.fromtimestamp(SATCAT_CACHE_PATH.stat().st_mtime, timezone.utc)),
                "source_record_count": len(normalized),
            })
            return

    preview = _build_preview_records()
    _publish(preview, {
        "scope": "preview",
        "source_status": "warming",
        "last_updated": None,
        "source_record_count": len(preview),
    })


def _refresh_worker() -> None:
    global _LAST_REFRESH_ERROR
    try:
        payload = _download_json(SATCAT_URL)
        if not isinstance(payload, list) or not payload:
            raise RuntimeError("CelesTrak SATCAT returned no on-orbit records")

        raw_records = [record for record in payload if isinstance(record, dict)]
        live_index = _load_live_index()
        normalized = [
            item
            for item in (_normalize_satcat_record(record, live_index) for record in raw_records)
            if item
        ]
        if not normalized:
            raise RuntimeError("No valid SATCAT records could be normalized")

        updated_at = _iso_utc()
        _write_json_atomic(SATCAT_CACHE_PATH, raw_records)
        _write_json_atomic(SATCAT_META_PATH, {
            "source": "CelesTrak SATCAT",
            "last_updated": updated_at,
            "record_count": len(normalized),
            "query": "ONORBIT=1",
        }, indent=2)
        _publish(normalized, {
            "scope": "complete",
            "source_status": "live",
            "last_updated": updated_at,
            "source_record_count": len(normalized),
        })
        with _STATE_LOCK:
            _LAST_REFRESH_ERROR = None
    except Exception as exc:
        with _STATE_LOCK:
            _LAST_REFRESH_ERROR = str(exc)


def _refresh_running() -> bool:
    with _STATE_LOCK:
        return bool(_REFRESH_THREAD and _REFRESH_THREAD.is_alive())


def _start_refresh() -> bool:
    global _REFRESH_THREAD
    with _STATE_LOCK:
        if _REFRESH_THREAD and _REFRESH_THREAD.is_alive():
            return False
        _REFRESH_THREAD = threading.Thread(
            target=_refresh_worker,
            name="orbitops-satcat-refresh",
            daemon=True,
        )
        _REFRESH_THREAD.start()
        return True


def _split_values(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = str(value).split(",")
    return {str(item).strip().upper() for item in values if str(item).strip()}


def _match_filters(
    record: dict[str, Any],
    *,
    query: str,
    object_types: set[str],
    regimes: set[str],
    min_altitude: float | None,
    max_altitude: float | None,
    min_inclination: float | None,
    max_inclination: float | None,
    owner: str,
    status: str,
) -> bool:
    if query:
        haystack = " ".join([
            str(record.get("name") or ""),
            str(record.get("norad_id") or ""),
            str(record.get("international_designator") or ""),
            str(record.get("country") or ""),
            str(record.get("owner_code") or ""),
        ]).lower()
        if query.lower() not in haystack:
            return False

    if object_types and record.get("type") not in object_types:
        return False
    if regimes and record.get("orbital_regime") not in regimes:
        return False

    altitude = _float(record.get("altitude_km"))
    if min_altitude is not None and (altitude is None or altitude < min_altitude):
        return False
    if max_altitude is not None and (altitude is None or altitude > max_altitude):
        return False

    inclination = _float(record.get("inclination_deg"))
    if min_inclination is not None and (inclination is None or inclination < min_inclination):
        return False
    if max_inclination is not None and (inclination is None or inclination > max_inclination):
        return False

    owner_normalized = owner.strip().upper()
    if owner_normalized and owner_normalized != "ALL" and str(record.get("owner_code") or "").upper() != owner_normalized:
        return False

    status_normalized = status.strip().upper()
    if status_normalized and status_normalized != "ALL":
        if status_normalized == "ACTIVE":
            if not record.get("is_active"):
                return False
        elif str(record.get("status") or "").upper() != status_normalized:
            return False

    return True


def _sort_records(records: list[dict[str, Any]], sort_by: str, sort_dir: str) -> list[dict[str, Any]]:
    keys = {
        "norad_id": lambda item: int(item["norad_id"]) if str(item.get("norad_id", "")).isdigit() else 10**12,
        "name": lambda item: str(item.get("name") or "").upper(),
        "type": lambda item: str(item.get("type") or ""),
        "country": lambda item: str(item.get("country") or ""),
        "altitude": lambda item: _float(item.get("altitude_km"), math.inf),
        "inclination": lambda item: _float(item.get("inclination_deg"), math.inf),
        "velocity": lambda item: _float(item.get("velocity_km_s"), math.inf),
        "status": lambda item: str(item.get("status") or ""),
    }
    key = keys.get(sort_by, keys["norad_id"])
    return sorted(records, key=key, reverse=str(sort_dir).lower() == "desc")


def _summary(records: Iterable[dict[str, Any]]) -> dict[str, int]:
    total = payloads = debris = rocket_bodies = active_payloads = 0
    owners: set[str] = set()
    for record in records:
        total += 1
        item_type = record.get("type")
        if item_type == "PAYLOAD":
            payloads += 1
            if record.get("is_active"):
                active_payloads += 1
        elif item_type == "DEBRIS":
            debris += 1
        elif item_type == "ROCKET_BODY":
            rocket_bodies += 1
        owner = str(record.get("owner_code") or "").strip()
        if owner and owner != "UNK":
            owners.add(owner)
    return {
        "total_objects": total,
        "satellites": payloads,
        "debris": debris,
        "rocket_bodies": rocket_bodies,
        "active_payloads": active_payloads,
        "countries": len(owners),
    }


def _countries(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    names: dict[str, str] = {}
    flags: dict[str, str] = {}
    for record in records:
        code = str(record.get("owner_code") or "UNK")
        counts[code] = counts.get(code, 0) + 1
        names[code] = str(record.get("country") or code)
        flags[code] = str(record.get("flag") or "◉")
    return [
        {"code": code, "name": names[code], "flag": flags[code], "count": count}
        for code, count in sorted(counts.items(), key=lambda pair: (-pair[1], names.get(pair[0], pair[0])))
    ]


def get_catalog_payload(
    *,
    page: int = 1,
    per_page: int = 25,
    query: str = "",
    object_types: Any = None,
    regimes: Any = None,
    min_altitude: Any = None,
    max_altitude: Any = None,
    min_inclination: Any = None,
    max_inclination: Any = None,
    owner: str = "ALL",
    status: str = "ALL",
    sort_by: str = "norad_id",
    sort_dir: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    if refresh or not _satcat_cache_is_fresh():
        _start_refresh()

    with _STATE_LOCK:
        records = list(_CATALOG_RECORDS)
        meta = dict(_CATALOG_META)
        last_error = _LAST_REFRESH_ERROR

    type_values = _split_values(object_types)
    regime_values = _split_values(regimes)
    min_alt = _float(min_altitude)
    max_alt = _float(max_altitude)
    min_inc = _float(min_inclination)
    max_inc = _float(max_inclination)

    filtered = [
        record for record in records
        if _match_filters(
            record,
            query=query.strip(),
            object_types=type_values,
            regimes=regime_values,
            min_altitude=min_alt,
            max_altitude=max_alt,
            min_inclination=min_inc,
            max_inclination=max_inc,
            owner=owner,
            status=status,
        )
    ]
    filtered = _sort_records(filtered, sort_by, sort_dir)

    safe_per_page = max(5, min(int(per_page or 25), 100))
    total_pages = max(1, math.ceil(len(filtered) / safe_per_page))
    safe_page = max(1, min(int(page or 1), total_pages))
    start = (safe_page - 1) * safe_per_page
    rows = filtered[start:start + safe_per_page]

    status_value = meta.get("source_status", "warming")
    if not records:
        status_value = "warming"

    return {
        "status": status_value,
        "source": "CelesTrak SATCAT + OMM/SGP4",
        "scope": meta.get("scope", "preview"),
        "last_updated": meta.get("last_updated"),
        "refresh_in_progress": _refresh_running(),
        "background_refresh_error": last_error,
        "summary": _summary(records),
        "filtered_count": len(filtered),
        "page": safe_page,
        "per_page": safe_per_page,
        "total_pages": total_pages,
        "rows": rows,
        "countries": _countries(records),
        "filters": {
            "query": query,
            "object_types": sorted(type_values),
            "regimes": sorted(regime_values),
            "min_altitude": min_alt,
            "max_altitude": max_alt,
            "min_inclination": min_inc,
            "max_inclination": max_inc,
            "owner": owner,
            "status": status,
            "sort_by": sort_by,
            "sort_dir": sort_dir,
        },
    }


def get_catalog_export(
    *,
    query: str = "",
    object_types: Any = None,
    regimes: Any = None,
    min_altitude: Any = None,
    max_altitude: Any = None,
    min_inclination: Any = None,
    max_inclination: Any = None,
    owner: str = "ALL",
    status: str = "ALL",
    sort_by: str = "norad_id",
    sort_dir: str = "asc",
) -> dict[str, Any]:
    with _STATE_LOCK:
        records = list(_CATALOG_RECORDS)
        meta = dict(_CATALOG_META)

    filtered = [
        record for record in records
        if _match_filters(
            record,
            query=query.strip(),
            object_types=_split_values(object_types),
            regimes=_split_values(regimes),
            min_altitude=_float(min_altitude),
            max_altitude=_float(max_altitude),
            min_inclination=_float(min_inclination),
            max_inclination=_float(max_inclination),
            owner=owner,
            status=status,
        )
    ]
    filtered = _sort_records(filtered, sort_by, sort_dir)[:MAX_EXPORT_ROWS]
    return {
        "source": "CelesTrak SATCAT + OMM/SGP4",
        "generated_at": _iso_utc(),
        "last_updated": meta.get("last_updated"),
        "count": len(filtered),
        "truncated": len(filtered) >= MAX_EXPORT_ROWS,
        "rows": filtered,
    }


def _detail_cache_path(catalog_id: str) -> Path:
    return DETAIL_CACHE_DIR / f"{catalog_id}.json"


def _detail_cache_fresh(catalog_id: str) -> bool:
    path = _detail_cache_path(catalog_id)
    return path.exists() and (time.time() - path.stat().st_mtime) < DETAIL_REFRESH_SECONDS


def _first_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0]
    if isinstance(payload, dict):
        return payload
    return {}


def _fetch_detail(catalog_id: str) -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=2) as executor:
        satcat_future = executor.submit(_download_json, SATCAT_DETAIL_URL.format(catalog_id=catalog_id))
        gp_future = executor.submit(_download_json, GP_DETAIL_URL.format(catalog_id=catalog_id))
        satcat = _first_dict(satcat_future.result())
        gp = _first_dict(gp_future.result())
    return {"satcat": satcat, "gp": gp, "fetched_at": _iso_utc()}


def get_catalog_object(catalog_id: str, *, refresh: bool = False) -> dict[str, Any]:
    clean_id = str(catalog_id or "").strip()
    if not clean_id or not clean_id.isdigit():
        return {"status": "error", "message": "A numeric NORAD catalog ID is required."}

    with _STATE_LOCK:
        base = dict(_CATALOG_INDEX.get(clean_id) or {})

    cache_path = _detail_cache_path(clean_id)
    detail_payload = _read_json(cache_path, {})
    detail_status = "cached" if detail_payload else "unavailable"
    detail_error: str | None = None

    if refresh or not _detail_cache_fresh(clean_id):
        try:
            detail_payload = _fetch_detail(clean_id)
            _write_json_atomic(cache_path, detail_payload)
            detail_status = "live"
        except Exception as exc:
            detail_error = str(exc)
            if not detail_payload:
                detail_payload = {}

    satcat = detail_payload.get("satcat", {}) if isinstance(detail_payload, dict) else {}
    gp = detail_payload.get("gp", {}) if isinstance(detail_payload, dict) else {}
    live_index = _load_live_index()
    live = live_index.get(clean_id, {})

    if satcat:
        normalized = _normalize_satcat_record(satcat, live_index)
        if normalized:
            base.update(normalized)
    elif gp and not base:
        normalized = _normalize_omm_record(gp, "detail", live_index)
        if normalized:
            base.update(normalized)

    if not base:
        return {
            "status": "error",
            "message": f"NORAD {clean_id} was not found in the current on-orbit catalog.",
            "detail_error": detail_error,
        }

    mean_motion = _float(gp.get("MEAN_MOTION"))
    period = (1440.0 / mean_motion) if mean_motion else base.get("period_min")
    base.update({
        "epoch": gp.get("EPOCH"),
        "mean_motion_rev_day": mean_motion,
        "eccentricity": _float(gp.get("ECCENTRICITY")),
        "raan_deg": _float(gp.get("RA_OF_ASC_NODE")),
        "argument_of_perigee_deg": _float(gp.get("ARG_OF_PERICENTER")),
        "mean_anomaly_deg": _float(gp.get("MEAN_ANOMALY")),
        "bstar": _float(gp.get("BSTAR")),
        "element_set_no": gp.get("ELEMENT_SET_NO"),
        "rev_at_epoch": gp.get("REV_AT_EPOCH"),
        "period_min": round(float(period), 5) if period is not None else None,
        "current_latitude_deg": _float(live.get("lat")),
        "current_longitude_deg": _float(live.get("lon")),
        "current_altitude_km": _float(live.get("altitude_km")),
        "current_velocity_km_s": _float(live.get("velocity_km_s")),
        "position_timestamp": live.get("position_timestamp"),
        "detail_source_status": detail_status,
        "detail_fetched_at": detail_payload.get("fetched_at") if isinstance(detail_payload, dict) else None,
        "detail_error": detail_error,
    })

    return {
        "status": "live" if detail_status == "live" else "cached",
        "source": "CelesTrak SATCAT + OMM/GP",
        "object": base,
    }


_load_initial_catalog()
