import asyncio
import httpx
import math
from datetime import datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from cachetools import TTLCache
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="SalmonCharterAI-Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OWM_KEY = os.getenv("OWM_API_KEY")
USER_AGENT = {"User-Agent": "SalmonCharterAI/1.0 (brianrose75@gmail.com)"}

env_cache = TTLCache(maxsize=100, ttl=300)

STATIONS = {
    "superior":     {"id": "45001", "lat": 48.068, "lng": -86.603},
    "michigan":     {"id": "45007", "lat": 45.022, "lng": -87.105},
    "huron":        {"id": "45003", "lat": 45.349, "lng": -82.836},
    "georgian_bay": {"id": "45143", "lat": 44.792, "lng": -80.277},
    "erie":         {"id": "45005", "lat": 41.680, "lng": -82.390},
    "ontario":      {"id": "45012", "lat": 43.618, "lng": -77.394},
}

LAKE_BOXES = [
    {"id": "georgian_bay", "latMin": 44.5, "latMax": 46.0, "lngMin": -81.3, "lngMax": -79.5},
    {"id": "superior",     "latMin": 46.2, "latMax": 49.1, "lngMin": -92.2, "lngMax": -84.3},
    {"id": "michigan",     "latMin": 41.6, "latMax": 46.1, "lngMin": -87.6, "lngMax": -84.7},
    {"id": "huron",        "latMin": 43.0, "latMax": 46.4, "lngMin": -84.8, "lngMax": -79.4},
    {"id": "erie",         "latMin": 41.3, "latMax": 43.0, "lngMin": -83.5, "lngMax": -78.8},
    {"id": "ontario",      "latMin": 43.1, "latMax": 44.4, "lngMin": -79.9, "lngMax": -76.0},
]

def determine_lake(lat, lng):
    for box in LAKE_BOXES:
        if box["latMin"] <= lat <= box["latMax"] and box["lngMin"] <= lng <= box["lngMax"]:
            return box["id"], STATIONS[box["id"]]["id"]
    # fallback: nearest station
    nearest = min(STATIONS.items(), key=lambda kv: (kv[1]["lat"] - lat)**2 + (kv[1]["lng"] - lng)**2)
    return nearest[0], nearest[1]["id"]

def degrees_to_cardinal(deg):
    if deg is None: return None
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[round(deg / 45) % 8]

def r1(n):
    if n is None: return None
    try: return round(float(n), 1)
    except: return None

def calc_moon_phase(date):
    known_new = datetime(2000, 1, 6)
    cycle = 29.53058867
    days = (date - known_new).days % cycle
    return round(days / cycle, 3)

def moon_phase_label(phase):
    if phase < 0.03 or phase > 0.97: return "New Moon"
    if phase < 0.22: return "Waxing Crescent"
    if phase < 0.28: return "First Quarter"
    if phase < 0.47: return "Waxing Gibbous"
    if phase < 0.53: return "Full Moon"
    if phase < 0.72: return "Waning Gibbous"
    if phase < 0.78: return "Last Quarter"
    return "Waning Crescent"

def uv_label(uv):
    if uv is None: return None
    if uv < 3: return "Low"
    if uv < 6: return "Moderate"
    if uv < 8: return "High"
    if uv < 11: return "Very High"
    return "Extreme"

async def fetch_open_meteo(client, lat, lng):
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
            f"cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"
            f"&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,pressure_msl"
            f"&wind_speed_unit=mph&forecast_days=1&past_days=1"
        )
        resp = await client.get(url, timeout=10.0)
        return resp.json()
    except:
        return {}

async def fetch_ndbc(client, station_id):
    try:
        url = f"https://www.ndbc.noaa.gov/data/realtime2/{station_id}.txt"
        resp = await client.get(url, timeout=10.0, headers=USER_AGENT)
        lines = resp.text.strip().split("\n")
        if len(lines) < 3: return {}
        headers = lines[0].lstrip("#").split()
        values = lines[2].split()
        if len(values) < len(headers): return {}
        row = dict(zip(headers, values))

        def mm(k):
            v = row.get(k, "MM")
            if v == "MM": return None
            try: return float(v)
            except: return None

        wvht = mm("WVHT")
        return {
            "wave_height_ft": r1(wvht * 3.28084) if wvht else None,
            "wave_period_dominant_s": mm("DPD"),
            "wave_direction_deg": mm("MWD"),
            "sst_buoy_c": mm("WTMP"),
            "barometric_pressure_hpa": mm("PRES"),
        }
    except:
        return {}

async def fetch_nominatim(client, lat, lng):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=14"
        resp = await client.get(url, headers=USER_AGENT, timeout=10.0)
        return resp.json()
    except:
        return {}

async def fetch_owm(client, lat, lng):
    if not OWM_KEY:
        return {}
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={OWM_KEY}&units=metric"
        resp = await client.get(url, timeout=10.0)
        data = resp.json()
        weather = data.get("weather", [{}])[0]
        return {
            "conditions_text": weather.get("description", "").capitalize(),
            "visibility_km": r1(data.get("visibility", None) / 1000) if data.get("visibility") else None,
        }
    except:
        return {}

async def fetch_uv(client, lat, lng):
    if not OWM_KEY:
        return {}
    try:
        url = f"https://api.openweathermap.org/data/2.5/uvi?lat={lat}&lon={lng}&appid={OWM_KEY}"
        resp = await client.get(url, timeout=10.0)
        data = resp.json()
        uv = data.get("value")
        return {"uv_index": uv, "uv_index_label": uv_label(uv)}
    except:
        return {}

def build_previous_wind(om_data, current_hour):
    try:
        hourly = om_data.get("hourly", {})
        times = hourly.get("time", [])
        speeds = hourly.get("wind_speed_10m", [])
        dirs = hourly.get("wind_direction_10m", [])
        temps = hourly.get("temperature_2m", [])
        clouds = hourly.get("cloud_cover", [])
        precip = hourly.get("precipitation", [])
        pressures = hourly.get("pressure_msl", [])

        result = []
        for i, t in enumerate(times):
            if t < current_hour and i < len(speeds):
                result.append({
                    "time": t,
                    "speed_mph": r1(speeds[i]) if i < len(speeds) else None,
                    "direction_deg": dirs[i] if i < len(dirs) else None,
                    "direction_label": degrees_to_cardinal(dirs[i] if i < len(dirs) else None),
                    "temp_c": r1(temps[i]) if i < len(temps) else None,
                    "cloud_cover_pct": clouds[i] if i < len(clouds) else None,
                    "precipitation_mm": precip[i] if i < len(precip) else None,
                    "pressure_hpa": r1(pressures[i]) if i < len(pressures) else None,
                })
        return result[-6:] if result else []
    except:
        return []

def calc_pressure_trend(om_data, current_hour):
    try:
        hourly = om_data.get("hourly", {})
        times = hourly.get("time", [])
        pressures = hourly.get("pressure_msl", [])
        past = [(t, p) for t, p in zip(times, pressures) if t < current_hour and p is not None]
        if len(past) < 3: return None, None
        recent = past[-1][1]
        older = past[-3][1]
        delta = recent - older
        if delta > 1: trend = "rising"
        elif delta < -1: trend = "falling"
        else: trend = "steady"
        return r1(delta), trend
    except:
        return None, None

@app.get("/conditions")
async def get_conditions(lat: float, lng: float):
    cache_key = f"{round(lat, 2)}_{round(lng, 2)}"
    if cache_key in env_cache:
        return env_cache[cache_key]

    lake_id, station_id = determine_lake(lat, lng)
    now = datetime.utcnow()
    current_hour = now.strftime("%Y-%m-%dT%H:00")

    async with httpx.AsyncClient() as client:
        om_data, ndbc_data, nom_data, owm_data, uv_data = await asyncio.gather(
            fetch_open_meteo(client, lat, lng),
            fetch_ndbc(client, station_id),
            fetch_nominatim(client, lat, lng),
            fetch_owm(client, lat, lng),
            fetch_uv(client, lat, lng),
            return_exceptions=True,
        )

    def safe(d): return d if isinstance(d, dict) else {}
    om = safe(om_data)
    ndbc = safe(ndbc_data)
    owm = safe(owm_data)
    uv = safe(uv_data)
    nom = safe(nom_data)

    c = om.get("current", {})
    pressure_tendency, pressure_trend = calc_pressure_trend(om, current_hour)
    prev_wind = build_previous_wind(om, current_hour)
    moon_phase = calc_moon_phase(now)

    dew_point = None
    temp = c.get("temperature_2m")
    humidity = c.get("relative_humidity_2m")
    if temp is not None and humidity is not None:
        try:
            dew_point = r1(temp - ((100 - humidity) / 5))
        except:
            pass

    weather_code = c.get("weather_code")
    precip_type = None
    if weather_code is not None:
        if weather_code in range(51, 68): precip_type = "Rain"
        elif weather_code in range(71, 78): precip_type = "Snow"
        elif weather_code in range(80, 83): precip_type = "Showers"
        elif weather_code in range(95, 100): precip_type = "Thunderstorm"

    response = {
        "fetched_at": now.isoformat(),
        "lake_id": lake_id,
        "ndbc_station_id": station_id,
        "query_lat": lat,
        "query_lng": lng,
        "barometric_pressure_hpa": ndbc.get("barometric_pressure_hpa") or r1(c.get("pressure_msl")),
        "pressure_tendency_hpa": pressure_tendency,
        "pressure_trend": pressure_trend,
        "wind_speed_mph": r1(c.get("wind_speed_10m")),
        "wind_direction_deg": c.get("wind_direction_10m"),
        "wind_direction_label": degrees_to_cardinal(c.get("wind_direction_10m")),
        "wind_gust_mph": r1(c.get("wind_gusts_10m")),
        "air_temp_c": r1(temp),
        "cloud_cover_pct": c.get("cloud_cover"),
        "precipitation_type": precip_type,
        "precipitation_mm": r1(c.get("precipitation")),
        "visibility_km": owm.get("visibility_km"),
        "wave_height_ft": ndbc.get("wave_height_ft"),
        "wave_period_dominant_s": ndbc.get("wave_period_dominant_s"),
        "wave_direction_deg": ndbc.get("wave_direction_deg"),
        "current_speed_knots": None,
        "current_direction_deg": None,
        "current_direction_label": None,
        "sst_buoy_c": ndbc.get("sst_buoy_c"),
        "sst_satellite_c": None,
        "chlorophyll_ug_l": None,
        "turbidity_mg_l": None,
        "moon_phase_value": moon_phase,
        "moon_phase_label": moon_phase_label(moon_phase),
        "moonrise_time": None,
        "moonset_time": None,
        "sunrise_time": None,
        "sunset_time": None,
        "solunar_major_1_start": None,
        "solunar_major_1_stop": None,
        "solunar_major_2_start": None,
        "solunar_major_2_stop": None,
        "solunar_minor_1_start": None,
        "solunar_minor_1_stop": None,
        "solunar_minor_2_start": None,
        "solunar_minor_2_stop": None,
        "solunar_day_rating": None,
        "humidity_pct": humidity,
        "feels_like_c": r1(c.get("apparent_temperature")),
        "dew_point_c": dew_point,
        "conditions_text": owm.get("conditions_text"),
        "uv_index": uv.get("uv_index"),
        "uv_index_label": uv.get("uv_index_label"),
        "previous_wind": prev_wind,
        "marine_warning_active": False,
        "marine_warning_text": None,
        "atmospheric_source": "owm" if OWM_KEY else "ndbc",
    }

    env_cache[cache_key] = response
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
