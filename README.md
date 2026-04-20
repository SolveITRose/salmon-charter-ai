# Salmon Charter AI

An AI-powered React Native Expo application for Georgian Bay salmon charter captains and mates. Logs catch events with species identification, GPS data, weather conditions, and a proprietary Hydrodynamic Score (HydroScore) to identify optimal fishing hotspots.

---

## Features

- **Captain Console** — Photograph catch, auto-classify species with Claude Vision, capture GPS + weather simultaneously, generate shareable event codes
- **Mate Setup** — Join events by code, enter rig configuration, record voice notes with automatic transcription
- **HydroScore Engine** — Proprietary 0-100 scoring algorithm based on wind transport, thermal stratification, residence time, storm pulse, and shoreline/wetland proximity
- **Trip Log** — Full history with photo, GPS, weather, setup data, voice note playback, and AI trip analysis
- **Hotspot Map** — Georgian Bay satellite map with color-coded HydroScore overlays and trip replay animation
- **Offline-First** — SQLite local storage, background sync to Supabase when connectivity available
- **SignalK Integration** — WebSocket connector for onboard NMEA 0183 instrument data

---

## Prerequisites

- Node.js 18+ and npm 9+
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for Android emulator) **or** a physical Android/iOS device with Expo Go
- Anthropic API key (for species classification and trip insights)
- Supabase project (for cloud sync — optional for local use)

---

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd salmon-charter-ai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

---

## Environment Configuration

Edit `.env` with your credentials:

```env
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-api03-...
EXPO_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EXPO_PUBLIC_SIGNALK_HOST=192.168.1.100
EXPO_PUBLIC_SIGNALK_PORT=3000
```

- **ANTHROPIC_API_KEY** — Required for fish species identification and AI trip analysis. Get one at https://console.anthropic.com
- **SUPABASE_URL / SUPABASE_ANON_KEY** — Optional. Required only if you want cloud sync. Create a free project at https://supabase.com
- **SIGNALK_HOST / PORT** — Optional. IP of your boat's SignalK server for live NMEA instrument data

---

## Supabase Schema

If using cloud sync, run this SQL in your Supabase SQL editor:

```sql
-- Main catch events table
CREATE TABLE catch_events (
  id UUID PRIMARY KEY,
  event_code TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_catch_events_event_code ON catch_events(event_code);
CREATE INDEX idx_catch_events_created_at ON catch_events(created_at DESC);

-- Enable Row Level Security (recommended)
ALTER TABLE catch_events ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (adjust per your auth setup)
CREATE POLICY "Allow all" ON catch_events FOR ALL USING (true);
```

---

## Running the App

```bash
# Start Expo development server
npm start

# Android (with emulator running or device connected)
npm run android

# iOS (macOS only)
npm run ios

# Web (limited functionality — camera/GPS not supported)
npm run web
```

For physical devices, install **Expo Go** from the App Store or Google Play, then scan the QR code from the terminal.

---

## Architecture Overview

```
salmon-charter-ai/
├── app/                          # Expo Router file-based navigation
│   ├── _layout.tsx               # Root stack layout
│   ├── index.tsx                 # Redirects to captain tab
│   └── (tabs)/
│       ├── _layout.tsx           # Bottom tab navigator (4 tabs)
│       ├── captain.tsx           # Captain Console
│       ├── mate.tsx              # Mate Setup
│       ├── triplog.tsx           # Trip Log
│       └── map.tsx               # Hotspot Map
│
├── src/
│   ├── agents/
│   │   ├── hydrodynamicAgent.ts  # HydroScore computation engine
│   │   └── catchClassifier.ts    # Claude Vision species ID
│   │
│   ├── components/
│   │   ├── CatchCard.tsx         # Event list item
│   │   ├── EventJoinModal.tsx    # Event code entry modal
│   │   ├── HydroScoreCard.tsx    # Score visualization
│   │   ├── VoiceInput.tsx        # Audio recorder + transcription
│   │   └── WeatherWidget.tsx     # Compact weather strip
│   │
│   ├── models/
│   │   ├── Event.ts              # Core interfaces (CatchEvent, etc.)
│   │   ├── Trip.ts               # Trip aggregation model
│   │   ├── CatchLog.ts           # Catch log helpers
│   │   └── HydroScore.ts        # HydroScore type re-export
│   │
│   ├── screens/
│   │   ├── CaptainScreen.tsx     # Full captain flow
│   │   ├── MateScreen.tsx        # Mate data entry flow
│   │   ├── TripLogScreen.tsx     # History list + detail modal
│   │   └── MapScreen.tsx         # Georgian Bay map
│   │
│   ├── services/
│   │   ├── gpsService.ts         # expo-location wrapper
│   │   ├── weatherService.ts     # Open-Meteo API fetcher
│   │   ├── nmea.ts               # NMEA 0183 parser + SignalK WS
│   │   └── syncService.ts        # Supabase sync with offline queue
│   │
│   ├── storage/
│   │   ├── localDB.ts            # SQLite CRUD (expo-sqlite v14)
│   │   └── eventStore.ts         # File system photo + JSON storage
│   │
│   └── utils/
│       ├── formatters.ts         # Date, GPS, unit formatting
│       └── scoring.ts            # Score colors, labels, helpers
│
└── assets/                       # Icons, splash screen
```

---

## HydroScore Algorithm

The HydroScore (0-100) is composed of five sub-scores measuring conditions that concentrate baitfish and salmon in Georgian Bay:

| Component | Max | Description |
|---|---|---|
| Wind Transport | 25 | Ekman transport efficiency; onshore winds, duration bonus |
| Mixing/Stratification | 20 | Thermal stability; small air-water temp delta = good stratification |
| Residence Time | 20 | Embayment retention; known Georgian Bay bays score higher |
| Storm Pulse | 20 | Recent storm = nutrient flush; pressure drop + wave surge proxy |
| Shoreline/Wetland | 15 | Proximity to nutrient-rich wetland areas on eastern shore |

**Score interpretation:**
- 80-100: Excellent — very high hotspot probability
- 60-79: Good — favorable conditions
- 40-59: Fair — worth trying, adjust depth/location
- 20-39: Poor — consider relocating
- 0-19: Very poor — seek shelter or different area

---

## NMEA 0183 / SignalK Integration

To receive live instrument data from your vessel:

1. Install SignalK server on a Raspberry Pi or laptop aboard
2. Configure your NMEA 0183 instruments to feed SignalK
3. Set `EXPO_PUBLIC_SIGNALK_HOST` to the vessel's IP on your boat WiFi
4. The app connects automatically when on the boat's network

Supported sentences:
- `$GPRMC` — GPS position, speed, heading
- `$GPGGA` — GPS fix quality, altitude, satellites
- `$IIVHW` — Water speed through hull
- `$IIDPT` — Depth below transducer
- `$IIMTW` — Water temperature

---

## Captain Workflow

1. Fish strikes → tap **Log Catch** on Captain tab
2. Photograph the fish (camera opens automatically)
3. App captures GPS, fetches weather, computes HydroScore in parallel (~5-10s)
4. Claude Vision identifies species and estimates size
5. Event code generated (e.g. `CATCH-2026-0404-001`)
6. **Share event code** with mate(s) verbally or via Share button

## Mate Workflow

1. Hear event code from captain
2. Open **Mate** tab → tap **Join Event**
3. Enter the event code
4. Fill in rig setup: depth, lure type/color, line weight, trolling speed, rod/reel
5. Record optional voice note about bite conditions
6. Tap **Save Setup** — data links to captain's event record

---

## Permissions Required

| Permission | Purpose |
|---|---|
| Camera | Photograph catch for species identification |
| Microphone | Voice notes about setup and conditions |
| Location (Foreground) | GPS coordinates at time of catch |
| Network | Weather API, cloud sync |
| Storage (Android) | Save photos and event data |

---

## Offline Mode

The app is fully functional offline:
- SQLite stores all catch events locally
- Photos saved to device file system
- HydroScore computed from cached weather (last known) when offline
- Supabase sync queues automatically when connectivity returns
- Weather data shown from last successful fetch with timestamp

---

## Contributing

This is a proprietary application for Georgian Bay charter operations. Contact the repository owner for contribution guidelines.

---

## License

Proprietary — All rights reserved.
