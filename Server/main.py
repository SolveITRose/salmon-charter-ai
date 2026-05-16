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

GB_BUOYS = [
    {"id": "45143", "lat": 44.940, "lng": -80.627, "name": "South Georgian Bay"},
    {"id": "45137", "lat": 45.540, "lng": -81.020, "name": "Central Georgian Bay"},
]

def degrees_to_cardinal(deg):
    if deg is None: return None
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[round(deg / 45) % 8]

def r1(n):
    if n is None: return None
    try: return round(float(n), 1)
    except: return None

def calc_moon_phase(date):
    known_new = datetime(2000, 1, 6, 18, 14, 0)
    cycle = 29.53058867
    days_since = (date - known_new).total_seconds() / 86400
    phase = ((days_since % cycle) + cycle) % cycle / cycle
    return round(phase, 2)

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
    if uv <= 2: return "Low"
    if uv <= 5: return "Moderate"
    if uv <= 7: return "High"
    if uv <= 10: return "Very High"
    return "Extreme"

def add_minutes_to_hhmm(hhmm, minutes):
    try:
        h, m = map(int, hhmm.split(":"))
        total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
        return f"{total // 60:02d}:{total % 60:02d}"
    except:
        return None

def compute_solunar(astro, moon_phase):
    upper_transit = astro.get("moonUpperTransit")
    moonrise = astro.get("moonrise")
    moonset = astro.get("moonset")

    day_rating = None
    if moon_phase is not None:
        dist_new = min(moon_phase, 1 - moon_phase)
        dist_full = abs(moon_phase - 0.5)
        dist_nearest = min(dist_new, dist_full)
        day_rating = round(6 - (dist_nearest / 0.25) * 4)

    return {
        "solunar_major_1_start": add_minutes_to_hhmm(upper_transit, -60) if upper_transit else None,
        "solunar_major_1_stop":  add_minutes_to_hhmm(upper_transit,  60) if upper_transit else None,
        "solunar_major_2_start": add_minutes_to_hhmm(upper_transit, 12 * 60 + 25 - 60) if upper_transit else None,
        "solunar_major_2_stop":  add_minutes_to_hhmm(upper_transit, 12 * 60 + 25 + 60) if upper_transit else None,
        "solunar_minor_1_start": add_minutes_to_hhmm(moonrise, -30) if moonrise else None,
        "solunar_minor_1_stop":  add_minutes_to_hhmm(moonrise,  30) if moonrise else None,
        "solunar_minor_2_start": add_minutes_to_hhmm(moonset,  -30) if moonset else None,
        "solunar_minor_2_stop":  add_minutes_to_hhmm(moonset,   30) if moonset else None,
        "solunar_day_rating": day_rating,
    }

def format_hour_12(iso_str):
    try:
        dt = datetime.fromisoformat(iso_str)
        h = dt.hour
        ampm = "AM" if h < 12 else "PM"
        h12 = h % 12 or 12
        day = dt.strftime("%a")
        return f"{day} {h12}{ampm}"
    except:
        return iso_str

def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def bearing_deg(lat1, lng1, lat2, lng2):
    """Bearing FROM (lat1,lng1) TO (lat2,lng2), degrees 0-360."""
    dLng = math.radians(lng2 - lng1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dLng) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dLng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360

def abs_angle_diff(a, b):
    diff = abs(a - b) % 360
    return diff if diff <= 180 else 360 - diff

def calc_consistent_wind_hours(om_data, wind_dir, now_utc):
    """Count consecutive past hours where wind direction was within ±45° of current."""
    if wind_dir is None:
        return 0
    hourly = om_data.get("hourly", {})
    times = hourly.get("time", [])
    dirs = hourly.get("wind_direction_10m", [])
    now_local = local_now_str(om_data, now_utc)
    hours = 0
    for t, d in reversed(list(zip(times, dirs))):
        if t > now_local:
            continue
        if d is None:
            break
        if abs_angle_diff(d, wind_dir) <= 45:
            hours += 1
        else:
            break
    return hours

def determine_buoy(lat, lng, wind_dir=None, wind_hours=0):
    """
    Select the most hydrodynamically relevant Georgian Bay buoy.
    Nearest by distance is the baseline. If wind has been blowing consistently
    from a buoy's direction, that buoy's water is being transported to the angler
    and gets a boost proportional to wind duration (capped at 12h).
    Transport direction = (wind_dir + 180) % 360 — water moves opposite to wind origin.
    """
    best, best_score = None, -1
    transport_dir = ((wind_dir + 180) % 360) if wind_dir is not None else None

    for buoy in GB_BUOYS:
        dist_km = haversine_km(lat, lng, buoy["lat"], buoy["lng"])
        dist_score = 100.0 / max(dist_km, 1.0)

        transport_boost = 0.0
        if transport_dir is not None and wind_hours > 0:
            brng = bearing_deg(buoy["lat"], buoy["lng"], lat, lng)
            diff = abs_angle_diff(transport_dir, brng)
            duration_factor = min(wind_hours, 12) / 12.0
            if diff <= 45:
                transport_boost = duration_factor * 2.0
            elif diff <= 90:
                transport_boost = ((90 - diff) / 90.0) * duration_factor

        score = dist_score + transport_boost
        if score > best_score:
            best_score = score
            best = buoy

    return best


# --- Async Fetchers ---

async def fetch_open_meteo(client, lat, lng):
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
            f"cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"
            f"&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,pressure_msl"
            f"&wind_speed_unit=mph&forecast_days=1&past_days=3&timezone=auto"
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
            "wave_height_ft": r1(wvht * 3.28084) if wvht is not None else None,
            "wave_period_dominant_s": mm("DPD"),
            "wave_direction_deg": mm("MWD"),
            "sst_buoy_c": mm("WTMP"),
            "barometric_pressure_hpa": mm("PRES"),
        }
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
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}&daily=uv_index_max&forecast_days=1&timezone=auto"
        )
        resp = await client.get(url, timeout=8.0)
        data = resp.json()
        uv = data.get("daily", {}).get("uv_index_max", [None])[0]
        return {"uv_index": r1(uv), "uv_index_label": uv_label(uv)}
    except:
        return {}

async def fetch_astro_openmeteo(client, lat, lng):
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&daily=sunrise,sunset&timezone=auto&forecast_days=1"
        )
        resp = await client.get(url, timeout=10.0)
        data = resp.json()
        daily = data.get("daily", {})
        def first_hhmm(key):
            vals = daily.get(key, [None])
            v = vals[0] if vals else None
            if not v: return None
            try: return v.split("T")[1][:5]
            except: return None
        return {"sunrise": first_hhmm("sunrise"), "sunset": first_hhmm("sunset")}
    except:
        return {}

def calc_moon_times(moon_phase):
    def to_hhmm(total_minutes):
        m = int(total_minutes) % (24 * 60)
        return f"{m // 60:02d}:{m % 60:02d}"
    transit_min = (12 * 60 + moon_phase * 24 * 60) % (24 * 60)
    return {
        "moonUpperTransit": to_hhmm(transit_min),
        "moonrise":         to_hhmm(transit_min - 6 * 60),
        "moonset":          to_hhmm(transit_min + 6 * 60),
    }

async def fetch_glerl_sst(client, lat, lng):
    try:
        lat0 = round(lat - 0.3, 4)
        lat1 = round(lat + 0.3, 4)
        lng0 = round(lng - 0.3, 4)
        lng1 = round(lng + 0.3, 4)
        url = (
            f"https://apps.glerl.noaa.gov/erddap/griddap/GLSEA_ACSPO_GCS.json"
            f"?sst[(last)][({lat0}):({lat1})][({lng0}):({lng1})]"
        )
        resp = await client.get(url, timeout=12.0, headers=USER_AGENT)
        if not resp.is_success: return None
        data = resp.json()
        table = data.get("table", {})
        col_names = table.get("columnNames", [])
        sst_idx = col_names.index("sst") if "sst" in col_names else -1
        if sst_idx == -1: return None
        values = [r[sst_idx] for r in table.get("rows", []) if isinstance(r[sst_idx], (int, float)) and r[sst_idx] > -9]
        if not values: return None
        return r1(sum(values) / len(values))
    except:
        return None

async def fetch_erddap_value(client, url, column_name):
    try:
        resp = await client.get(url, timeout=15.0, headers=USER_AGENT)
        if not resp.is_success: return None
        data = resp.json()
        table = data.get("table", {})
        col_names = table.get("columnNames", [])
        idx = col_names.index(column_name) if column_name in col_names else -1
        time_idx = col_names.index("time") if "time" in col_names else -1
        if idx == -1: return None
        rows = table.get("rows", [])
        if time_idx >= 0:
            rows = sorted(rows, key=lambda r: str(r[time_idx] or ""))
        for row in reversed(rows):
            v = row[idx]
            if isinstance(v, (int, float)) and not math.isnan(v):
                return r1(v)
        return None
    except:
        return None

async def fetch_chlorophyll_turbidity(client, lat, lng, lake_id):
    prefix = lake_id  # caller passes "LH" directly
    lat0 = round(lat - 0.3, 4)
    lat1 = round(lat + 0.3, 4)
    lng0 = round(lng - 0.3, 4)
    lng1 = round(lng + 0.3, 4)
    since = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00Z")
    base = "https://apps.glerl.noaa.gov/erddap/griddap"

    chl_url = f"{base}/{prefix}_CHL_NRT.json?Chlorophyll[({since}):(last)][({lat0}):({lat1})][({lng0}):({lng1})]"
    turb_url = f"{base}/{prefix}_SM_VIIRS_Monthly_Avg.json?Suspended_Minerals[(last)][({lat0}):({lat1})][({lng0}):({lng1})]"

    chl, turb = await asyncio.gather(
        fetch_erddap_value(client, chl_url, "Chlorophyll"),
        fetch_erddap_value(client, turb_url, "Suspended_Minerals"),
        return_exceptions=True,
    )
    return {
        "chlorophyll_ug_l": chl if isinstance(chl, (float, int, type(None))) else None,
        "turbidity_mg_l": turb if isinstance(turb, (float, int, type(None))) else None,
    }

async def fetch_marine_currents(client, lat, lng):
    try:
        url = (
            f"https://marine-api.open-meteo.com/v1/marine"
            f"?latitude={lat}&longitude={lng}"
            f"&hourly=ocean_current_velocity,ocean_current_direction&forecast_days=1"
        )
        resp = await client.get(url, timeout=10.0)
        data = resp.json()
        times = data.get("hourly", {}).get("time", [])
        speeds = data.get("hourly", {}).get("ocean_current_velocity", [])
        dirs = data.get("hourly", {}).get("ocean_current_direction", [])
        now_hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        idx = next((i for i, t in enumerate(times) if t >= now_hour.strftime("%Y-%m-%dT%H:00")), len(times) - 1)
        speed_ms = speeds[idx] if idx < len(speeds) else None
        direction = dirs[idx] if idx < len(dirs) else None
        return {
            "current_speed_knots": r1(speed_ms * 1.944) if speed_ms is not None else None,
            "current_direction_deg": round(direction) if direction is not None else None,
            "current_direction_label": degrees_to_cardinal(direction),
        }
    except:
        return {"current_speed_knots": None, "current_direction_deg": None, "current_direction_label": None}

async def fetch_nws_alerts(client, lat, lng):
    try:
        url = f"https://api.weather.gov/alerts/active?point={lat},{lng}&status=actual&message_type=alert"
        resp = await client.get(url, timeout=8.0, headers=USER_AGENT)
        if not resp.is_success:
            return {"marine_warning_active": False, "marine_warning_text": None}
        data = resp.json()
        events = ["Small Craft Advisory", "Gale Warning", "Storm Warning", "Special Marine Warning", "Hurricane Force Wind Warning"]
        match = next((f for f in data.get("features", []) if any(e in f.get("properties", {}).get("event", "") for e in events)), None)
        return {
            "marine_warning_active": bool(match),
            "marine_warning_text": match["properties"]["headline"] if match else None,
        }
    except:
        return {"marine_warning_active": False, "marine_warning_text": None}

def local_now_str(om_data, now_utc):
    utc_offset = om_data.get("utc_offset_seconds", 0)
    local_now = now_utc + timedelta(seconds=utc_offset)
    return local_now.strftime("%Y-%m-%dT%H:00")

def build_previous_wind(om_data, now_utc):
    try:
        hourly = om_data.get("hourly", {})
        times = hourly.get("time", [])
        speeds = hourly.get("wind_speed_10m", [])
        dirs = hourly.get("wind_direction_10m", [])
        temps = hourly.get("temperature_2m", [])
        clouds = hourly.get("cloud_cover", [])
        precip = hourly.get("precipitation", [])
        pressures = hourly.get("pressure_msl", [])

        now_local = local_now_str(om_data, now_utc)
        result = []
        for i, t in enumerate(times):
            if t <= now_local and i < len(speeds):
                result.append({
                    "time": format_hour_12(t),
                    "speed_mph": r1(speeds[i]) if i < len(speeds) else None,
                    "direction_deg": round(dirs[i]) if i < len(dirs) and dirs[i] is not None else 0,
                    "direction_label": degrees_to_cardinal(dirs[i] if i < len(dirs) else None),
                    "temp_c": r1(temps[i]) if i < len(temps) else None,
                    "cloud_cover_pct": round(clouds[i]) if i < len(clouds) and clouds[i] is not None else None,
                    "precipitation_mm": r1(precip[i]) if i < len(precip) else None,
                    "pressure_hpa": round(pressures[i]) if i < len(pressures) and pressures[i] is not None else None,
                })
        return result[-72:]
    except:
        return []

def calc_pressure_trend(om_data, now_utc):
    try:
        hourly = om_data.get("hourly", {})
        times = hourly.get("time", [])
        pressures = hourly.get("pressure_msl", [])
        now_local = local_now_str(om_data, now_utc)
        past = [(t, p) for t, p in zip(times, pressures) if p is not None and t <= now_local]
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

    now = datetime.utcnow()

    async with httpx.AsyncClient() as client:
        (om_data, ndbc_south, ndbc_central,
         owm_data, uv_data, astro_data, glerl_sst,
         chl_turb, currents, alerts) = await asyncio.gather(
            fetch_open_meteo(client, lat, lng),
            fetch_ndbc(client, "45143"),
            fetch_ndbc(client, "45137"),
            fetch_owm(client, lat, lng),
            fetch_uv(client, lat, lng),
            fetch_astro_openmeteo(client, lat, lng),
            fetch_glerl_sst(client, lat, lng),
            fetch_chlorophyll_turbidity(client, lat, lng, "LH"),
            fetch_marine_currents(client, lat, lng),
            fetch_nws_alerts(client, lat, lng),
            return_exceptions=True,
        )

    def safe(d, fallback=None): return d if isinstance(d, (dict, list)) else (fallback or {})
    om = safe(om_data)

    wind_dir = om.get("current", {}).get("wind_direction_10m")
    wind_hours = calc_consistent_wind_hours(om, wind_dir, now)
    selected = determine_buoy(lat, lng, wind_dir, wind_hours)
    ndbc = safe({
        "45143": ndbc_south,
        "45137": ndbc_central,
    }.get(selected["id"]))
    owm = safe(owm_data)
    uv = safe(uv_data)
    solar = safe(astro_data)
    moon_phase = calc_moon_phase(now)
    moon_times = calc_moon_times(moon_phase)
    astro = {
        "sunrise": solar.get("sunrise"),
        "sunset": solar.get("sunset"),
        "moonrise": moon_times["moonrise"],
        "moonset": moon_times["moonset"],
        "moonUpperTransit": moon_times["moonUpperTransit"],
    }
    sst_sat = glerl_sst if isinstance(glerl_sst, (float, int, type(None))) else None
    chl = safe(chl_turb)
    cur = safe(currents)
    warn = safe(alerts)

    c = om.get("current", {})
    pressure_tendency, pressure_trend = calc_pressure_trend(om, now)
    prev_wind = build_previous_wind(om, now)
    solunar = compute_solunar(astro, moon_phase)

    dew_point = None
    temp = c.get("temperature_2m")
    humidity = c.get("relative_humidity_2m")
    if temp is not None and humidity is not None:
        try: dew_point = r1(temp - ((100 - humidity) / 5))
        except: pass

    weather_code = c.get("weather_code")
    precip_type = None
    if weather_code is not None:
        if weather_code in range(51, 68): precip_type = "Rain"
        elif weather_code in range(71, 78): precip_type = "Snow"
        elif weather_code in range(80, 83): precip_type = "Showers"
        elif weather_code in range(95, 100): precip_type = "Thunderstorm"

    response = {
        "fetched_at": now.isoformat(),
        "lake_id": "georgian_bay",
        "ndbc_station_id": selected["id"],
        "selected_buoy_id": selected["id"],
        "selected_buoy_name": selected["name"],
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
        "current_speed_knots": cur.get("current_speed_knots"),
        "current_direction_deg": cur.get("current_direction_deg"),
        "current_direction_label": cur.get("current_direction_label"),
        "sst_buoy_c": ndbc.get("sst_buoy_c"),
        "sst_satellite_c": sst_sat,
        "chlorophyll_ug_l": chl.get("chlorophyll_ug_l"),
        "turbidity_mg_l": chl.get("turbidity_mg_l"),
        "moon_phase_value": moon_phase,
        "moon_phase_label": moon_phase_label(moon_phase),
        "moonrise_time": astro.get("moonrise"),
        "moonset_time": astro.get("moonset"),
        "sunrise_time": astro.get("sunrise"),
        "sunset_time": astro.get("sunset"),
        **solunar,
        "humidity_pct": humidity,
        "feels_like_c": r1(c.get("apparent_temperature")),
        "dew_point_c": dew_point,
        "conditions_text": owm.get("conditions_text"),
        "uv_index": uv.get("uv_index"),
        "uv_index_label": uv.get("uv_index_label"),
        "previous_wind": prev_wind,
        "marine_warning_active": warn.get("marine_warning_active", False),
        "marine_warning_text": warn.get("marine_warning_text"),
        "atmospheric_source": "owm" if OWM_KEY else "ndbc",
    }

    env_cache[cache_key] = response
    return response

async def fetch_ndbc_full(client, station_id):
    try:
        url = f"https://www.ndbc.noaa.gov/data/realtime2/{station_id}.txt"
        resp = await client.get(url, timeout=10.0, headers=USER_AGENT)
        lines = resp.text.strip().split("\n")
        if len(lines) < 3: return {}
        headers = lines[0].lstrip("#").split()
        # find most recent row with real data (skip MM-only rows)
        row = None
        for line in lines[2:6]:
            values = line.split()
            if len(values) >= len(headers):
                row = dict(zip(headers, values))
                break
        if not row: return {}

        def mm(k):
            v = row.get(k, "MM")
            if v == "MM": return None
            try: return float(v)
            except: return None

        wvht = mm("WVHT")
        pres = mm("PRES")
        ptdy = mm("PTDY")
        wdir = mm("WDIR")
        return {
            "wind_direction_deg": round(wdir) if wdir is not None else None,
            "wind_direction_label": degrees_to_cardinal(wdir),
            "wind_speed_ms": mm("WSPD"),
            "wind_gust_ms": mm("GST"),
            "wave_height_m": r1(wvht) if wvht is not None else None,
            "wave_period_s": mm("DPD"),
            "pressure_hpa": r1(pres),
            "pressure_tendency_hpa": r1(ptdy),
            "air_temp_c": r1(mm("ATMP")),
            "water_temp_c": r1(mm("WTMP")),
        }
    except:
        return {}


@app.get("/buoy/{station_id}")
async def get_buoy(station_id: str):
    cache_key = f"buoy_{station_id}"
    if cache_key in env_cache:
        return env_cache[cache_key]
    async with httpx.AsyncClient() as client:
        data = await fetch_ndbc_full(client, station_id)
    env_cache[cache_key] = data
    return data


def is_canada(lat, lng):
    return 41.7 <= lat <= 83.0 and -141.0 <= lng <= -52.6

async def fetch_water_body_name(client, lat, lng):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=14"
        resp = await client.get(url, headers=USER_AGENT, timeout=10.0)
        data = resp.json()
        cls = data.get("class", "")
        typ = data.get("type", "")
        addr = data.get("address", {})
        display = data.get("name")
        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or addr.get("county")

        if cls == "waterway" or typ == "river":
            return display or addr.get("river"), "river", city
        if typ in ("stream", "creek"):
            return display or addr.get("stream"), "stream", city
        if typ == "bay":
            return display or addr.get("bay"), "bay", city
        if cls == "natural" and typ in ("water", "lake"):
            return display or addr.get("lake") or addr.get("water"), "lake", city
        if addr.get("river"):  return addr["river"], "river", city
        if addr.get("stream"): return addr["stream"], "stream", city
        if addr.get("bay"):    return addr["bay"], "bay", city
        if addr.get("lake"):   return addr["lake"], "lake", city
        return None, "unknown", city
    except:
        return None, "unknown", None

async def fetch_eccc_gauge(client, lat, lng):
    try:
        st_url = (
            f"https://api.weather.gc.ca/collections/hydrometric-stations/items"
            f"?near={lng},{lat}&near-distance=50000&status=Active&f=json&limit=1"
        )
        st_resp = await client.get(st_url, timeout=10.0)
        features = st_resp.json().get("features", [])
        if not features: return None, None, None
        props = features[0]["properties"]
        station_num = props.get("STATION_NUMBER")
        gauge_name = props.get("STATION_NAME")

        data_url = (
            f"https://api.weather.gc.ca/collections/hydrometric-realtime/items"
            f"?station_number={station_num}&f=json&limit=1&sortby=-DATETIME"
        )
        data_resp = await client.get(data_url, timeout=10.0)
        obs = (data_resp.json().get("features") or [{}])[0].get("properties", {})
        return obs.get("LEVEL"), obs.get("DISCHARGE"), gauge_name
    except:
        return None, None, None

async def fetch_usgs_gauge(client, lat, lng):
    try:
        url = (
            f"https://waterservices.usgs.gov/nwis/iv/?format=json"
            f"&latitude={lat}&longitude={lng}"
            f"&siteType=ST&siteStatus=active&radius=30&radiusUnits=km&parameterCd=00060,00065"
        )
        resp = await client.get(url, timeout=10.0)
        time_series = resp.json().get("value", {}).get("timeSeries", [])
        if not time_series: return None, None, None

        gauge_name = time_series[0].get("sourceInfo", {}).get("siteName")
        level_ft = flow_cfs = None
        for ts in time_series:
            p_code = (ts.get("variable", {}).get("variableCode") or [{}])[0].get("value", "")
            raw = ((ts.get("values") or [{}])[0].get("value") or [{}])[0].get("value", "")
            try:
                val = float(raw)
                if p_code == "00065": level_ft = val
                if p_code == "00060": flow_cfs = val
            except:
                pass

        level_m = round(level_ft * 0.3048, 2) if level_ft is not None else None
        flow_cms = round(flow_cfs * 0.0283168, 1) if flow_cfs is not None else None
        return level_m, flow_cms, gauge_name
    except:
        return None, None, None


@app.get("/water-body")
async def get_water_body(lat: float, lng: float):
    cache_key = f"wb_{round(lat, 2)}_{round(lng, 2)}"
    if cache_key in env_cache:
        return env_cache[cache_key]

    async with httpx.AsyncClient() as client:
        name, water_type, nearest_city = await fetch_water_body_name(client, lat, lng)
        is_river = water_type in ("river", "stream")

        level_m = flow_cms = gauge_name = None
        if is_river:
            if is_canada(lat, lng):
                level_m, flow_cms, gauge_name = await fetch_eccc_gauge(client, lat, lng)
            else:
                level_m, flow_cms, gauge_name = await fetch_usgs_gauge(client, lat, lng)

    response = {
        "name": name,
        "type": water_type,
        "nearestCity": nearest_city,
        "waterLevel_m": level_m,
        "flow_cms": flow_cms,
        "gaugeStation": gauge_name,
    }
    env_cache[cache_key] = response
    return response


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
