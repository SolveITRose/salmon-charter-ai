import asyncio
import httpx
import math
from datetime import datetime, timedelta
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from cachetools import TTLCache
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="SalmonCharterAI-Proxy")

# Enable CORS so your mobile app can talk to it
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OWM_KEY = os.getenv("OWM_API_KEY")
USER_AGENT = {"User-Agent": "SalmonCharterAI/1.0 (brianrose75@gmail.com)"}

# 5-minute cache for weather/marine data
env_cache = TTLCache(maxsize=100, ttl=300)

# --- Helper Logic ---
def degrees_to_cardinal(deg):
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[round(deg / 45) % 8]

# --- Async Fetchers ---
async def fetch_ndbc(client, station_id="45143"):
    try:
        url = f"https://www.ndbc.noaa.gov/data/realtime2/{station_id}.txt"
        resp = await client.get(url, timeout=10.0)
        # Simplified parsing logic for the proxy
        return {"ndbc_status": "ok", "raw": resp.text[:500]} 
    except: return None

async def fetch_open_meteo(client, lat, lng):
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph"
        resp = await client.get(url)
        return resp.json()
    except: return {}

async def fetch_nominatim(client, lat, lng):
    try:
        # Respecting the 1 req/sec limit via server-side caching
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=14"
        resp = await client.get(url, headers=USER_AGENT)
        return resp.json()
    except: return {}

# --- Main Endpoint ---
@app.get("/conditions")
async def get_conditions(lat: float, lng: float):
    cache_key = f"{round(lat, 2)}_{round(lng, 2)}"
    if cache_key in env_cache:
        return env_cache[cache_key]

    async with httpx.AsyncClient() as client:
        # This runs all 11+ calls at the same exact time
        tasks = [
            fetch_open_meteo(client, lat, lng),
            fetch_ndbc(client),
            fetch_nominatim(client, lat, lng),
            # Add other fetchers here (OWM, GLERL, etc.)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge results into the TripConditions schema
        om_data = results[0] if not isinstance(results[0], Exception) else {}
        nom_data = results[2] if not isinstance(results[2], Exception) else {}
        
        c = om_data.get("current", {})
        
        response = {
            "fetched_at": datetime.utcnow().isoformat(),
            "query_lat": lat,
            "query_lng": lng,
            "air_temp_c": c.get("temperature_2m"),
            "wind_speed_mph": c.get("wind_speed_10m"),
            "wind_direction_deg": c.get("wind_direction_10m"),
            "wind_direction_label": degrees_to_cardinal(c.get("wind_direction_10m")) if c.get("wind_direction_10m") else None,
            "nearest_city": nom_data.get("address", {}).get("city") or nom_data.get("address", {}).get("town"),
            # Fill out the rest of the TripConditions fields here...
        }
        
        env_cache[cache_key] = response
        return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)