import requests
from sgp4.api import Satrec, WGS72
from skyfield.api import Topos, load, EarthSatellite
import datetime
import numpy as np
import random
import concurrent.futures

# CelesTrak URLs
TLE_URLS = [
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", # Active Satellites
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=tle", # Major debris cloud
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle" # Another debris cloud
]

def fetch_single_url(url, retries=3, timeout=15):
    """Fetch URL with retry logic and longer timeout."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    for attempt in range(retries):
        try:
            print(f"Connecting to {url}... (Attempt {attempt + 1}/{retries})")
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            print(f"Successfully fetched {url}")
            return response.text
        except requests.exceptions.Timeout:
            print(f"Timeout fetching {url} (attempt {attempt + 1}/{retries}). Retrying...")
        except requests.exceptions.ConnectionError:
            print(f"Connection error fetching {url} (attempt {attempt + 1}/{retries}). Retrying...")
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            if attempt == retries - 1:
                return ""
    
    return ""

def fetch_tle_data():
    """Fetches TLE data from multiple CelesTrak sources concurrently with short timeout."""
    combined_tle = ""
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        # Use shorter timeout and fewer retries to fail fast
        futures = [executor.submit(fetch_single_url, url, retries=1, timeout=5) for url in TLE_URLS]
        for future in concurrent.futures.as_completed(futures, timeout=8):
            try:
                res = future.result()
                if res:
                    combined_tle += res + "\n"
            except Exception as e:
                print(f"Exception in fetch: {e}")
                continue
    
    return combined_tle if combined_tle.strip() else None

def parse_and_propagate(tle_data):
    """
    Parses TLE data and propagates to current time.
    Returns a list of satellite objects with position data.
    """
    satellites = []
    lines = tle_data.strip().split('\n')
    
    ts = load.timescale()
    t = ts.now()
    
    # Cleaning lines
    lines = [l.strip() for l in lines if l.strip()]
    
    # Limit to prevent overload if response is massive (e.g. 20k objects might be too slow for this Python loop every 3s)
    # 5000 is a good balance for "busy" look
    limit = 5000
    count = 0

    for i in range(0, len(lines), 3):
        if i + 2 >= len(lines):
            break
        
        if count >= limit:
            break
            
        name = lines[i]
        line1 = lines[i+1]
        line2 = lines[i+2]
        
        try:
            satellite = EarthSatellite(line1, line2, name, ts)
            geocentric = satellite.at(t)
            subpoint = geocentric.subpoint()
            
            lat = subpoint.latitude.degrees
            lon = subpoint.longitude.degrees
            alt = subpoint.elevation.km
            
            # Classification Logic
            obj_type = "SATELLITE"
            if "DEB" in name or "DEBRIS" in name: 
                obj_type = "DEBRIS"
            elif "R/B" in name or "ROCKET" in name:
                obj_type = "ROCKET_BODY"
            
            satellites.append({
                "id": satellite.model.satnum,
                "name": name,
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "type": obj_type,
                "velocity": np.linalg.norm(geocentric.velocity.km_per_s)
            })
            count += 1
            
        except Exception:
            continue
            
    return satellites

def generate_mock_data(count=12000):
    """Generates mock orbital data for demonstration when API fails."""
    print(f"Generating {count} mock objects...")
    mock_objects = []
    
    # Ratios based on reference image: ~33% Active, ~66% Debris
    for i in range(count):
        is_active = random.random() < 0.33
        obj_type = 'SATELLITE' if is_active else random.choice(['DEBRIS', 'ROCKET_BODY'])
        
        # Risk factor - properly handle the logic
        risk_rand = random.random()
        if risk_rand < 0.01: 
            risk_level = "HIGH"
        elif risk_rand < 0.06: 
            risk_level = "MEDIUM"
        else: 
            risk_level = "LOW"
        
        mock_objects.append({
            "id": 90000 + i,
            "name": f"{'SAT' if is_active else 'DEB'}-{i:04d}",
            "lat": random.uniform(-80, 80),
            "lon": random.uniform(-180, 180),
            "alt": random.uniform(300, 2000), 
            "type": obj_type,
            "velocity": 7.6 + random.uniform(-0.5, 0.5),
            "risk": risk_level,
            "status": "ACTIVE" if is_active else "INACTIVE"
        })
    return mock_objects

def get_orbital_data():
    """Get orbital data - use mock data immediately, try CelestTrak and return source info."""
    print("Fetching orbital data...")

    # Start with mock data to ensure dashboard loads
    mock_data = generate_mock_data()

    # Try to fetch from CelestTrak (may fail, which is ok)
    try:
        raw_tle = fetch_tle_data()
        if raw_tle:
            print("TLE data fetched successfully from CelestTrak.")
            real_data = parse_and_propagate(raw_tle)
            if real_data and len(real_data) > 100:  # Only use if we got significant data
                print(f"Using real data with {len(real_data)} objects")
                return {"objects": real_data, "source": "celestrak"}
    except Exception as e:
        print(f"CelestTrak fetch failed: {e}")

    print(f"Using fallback mock data with {len(mock_data)} objects")
    return {"objects": mock_data, "source": "mock"}
