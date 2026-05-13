# AI Instructions — SalmonCharterAI

## Architecture: Proxy-Backend Model

This project uses a **Proxy-Backend architecture**. The mobile app never calls external APIs directly. All external data fetching is handled by a Python FastAPI server.

```
Mobile App (React Native/Expo)
    └── GET /conditions?lat=&lng=
            └── FastAPI Server (Server/main.py)
                    ├── Open-Meteo
                    ├── NDBC (NOAA buoys)
                    ├── Nominatim (reverse geocoding)
                    ├── OWM (OpenWeatherMap)
                    └── GLERL / other marine sources
```

This replaced an earlier "Direct-to-Client" model where the mobile app made 11+ parallel external API calls.

---

## Key Directories

| Path | Purpose |
|------|---------|
| `Server/main.py` | FastAPI proxy server — all external API calls live here |
| `src/services/weatherWaterService.ts` | Mobile-side data fetcher — makes ONE call to `/conditions` |
| `src/services/` | Other TypeScript services (GPS, NMEA, marine conditions, etc.) |

---

## Security Rules — Non-Negotiable

- **Never add `EXPO_PUBLIC_` prefixed keys to the mobile codebase.** API keys exposed in the mobile bundle are readable by anyone who unpacks the APK/IPA.
- All API keys (`OWM_API_KEY`, etc.) live in `Server/.env` locally and in Azure Environment Variables in production.
- The FastAPI server reads keys via `os.getenv()` — this is the only correct pattern.

---

## Backend (Server/main.py)

- **Framework:** FastAPI + uvicorn
- **Concurrency:** All external fetches run concurrently via `asyncio.gather()`
- **Caching:** `TTLCache` with a 5-minute TTL, keyed by rounded lat/lng
- **Resilience:** Every fetcher is wrapped in `try/except` — a downed buoy or API timeout returns `None`/`{}` and does not crash the app
- **CORS:** Open (`allow_origins=["*"]`) for dev; tighten for production if needed
- **Single endpoint:** `GET /conditions?lat={lat}&lng={lng}`

When adding a new data source, add an `async def fetch_xxx(client, ...)` function and include it in the `asyncio.gather()` task list inside `get_conditions`.

---

## Mobile (src/services/weatherWaterService.ts)

- Makes a single `GET /conditions` call to the FastAPI server
- Do not add direct external API calls here — route everything through the backend
- The backend URL is currently hardcoded to the local network IP for dev; update for Azure in production

---

## Deployment

- Backend deploys to Azure (separate from the mobile app)
- Mobile app deploys via EAS (Expo Application Services)
- GitHub Actions handles CI/CD — push triggers the pipeline
- Always test against the Azure-deployed backend, not localhost

---

## Data Sources (managed by backend)

| Source | Data |
|--------|------|
| Open-Meteo | Air temp, wind speed/direction/gusts, humidity, pressure, cloud cover |
| NDBC (NOAA) | Buoy readings — wave height, water temp, swell period |
| Nominatim | Reverse geocoding (nearest city/town name) |
| OWM | Additional weather data |
| GLERL | Great Lakes environmental data |

---

## What NOT to Do

- Do not revert to direct API calls from the mobile app
- Do not add API keys to `app.config.js`, `app.json`, or any file bundled into the mobile app
- Do not add `EXPO_PUBLIC_` environment variables for sensitive keys
- Do not split the single `/conditions` call back into multiple parallel mobile-side calls
