# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # install dependencies
npx expo start --android     # run on Android device/emulator
npx expo prebuild            # generate native Android project (needed before first build)
npx tsc --noEmit             # type-check
```

## Architecture

### Navigation
expo-router file-based routing. `app/` IS the navigation tree — `(tabs)/_layout.tsx` defines the bottom tab bar (Captain → Mate → Trip Log → Map). Screens live in `src/screens/` and are rendered by thin route files in `app/(tabs)/`.

### Data flow
1. **Captain** takes a photo → GPS + weather fetched in parallel → `hydrodynamicAgent.ts` computes HydroScore → `catchClassifier.ts` calls Claude Vision → full `CatchEvent` written to SQLite and `/events/{eventCode}/` folder → event code displayed
2. **Mate** enters event code → loads event from SQLite → adds `SetupData` + `VoiceNote` → `updateEvent()` persists changes
3. **Sync** runs via `syncService.ts` whenever connectivity is detected; failed syncs are retried next time

### Central type: `CatchEvent` (`src/models/Event.ts`)
All nested objects (`GpsData`, `WeatherData`, `SetupData`, `VoiceNote`, `HydroScore`) serialize to a single JSON blob in the SQLite `data TEXT` column. There is no relational decomposition — always parse via `JSON.parse(row.data)`.

### Storage: two layers
- `src/storage/localDB.ts` — SQLite (`salmon_charter.db`). Module-level singleton `db`; call `initDB()` once at app start, then all exports auto-initialize. Uses `openDatabaseAsync` (expo-sqlite v14 async API).
- `src/storage/eventStore.ts` — `FileSystem.documentDirectory + 'events/{eventCode}/'`. Stores the raw photo file and a `.json` snapshot alongside it.

### HydroScore engine (`src/agents/hydrodynamicAgent.ts`)
Pure function `computeHydroScore(input: HydroInput): HydroScore`. Five sub-scores (max weights: windTransport 25, mixing 20, residence 20, stormPulse 20, shoreline 15). Georgian Bay embayments and wetland zones are hard-coded coordinate arrays at the top of the file — add new locations there.

### AI calls (`src/agents/catchClassifier.ts`)
Uses `@anthropic-ai/sdk`. Model is `claude-sonnet-4-5`. Two entry points: `classifyCatch(base64Image)` for species ID and `generateTripInsight(events[])` for pattern analysis (requires 5+ events). Both require `EXPO_PUBLIC_ANTHROPIC_API_KEY`.

### Sync (`src/services/syncService.ts`)
Supabase client is lazy-initialized; throws if env vars are missing. `syncAllPending()` fetches unsynced events from SQLite then upserts to `catch_events` table. Connectivity check uses `expo-network`.

## Environment variables
All `EXPO_PUBLIC_` prefixed (bundled client-side by Expo). See `.env.example`.

| Variable | Used by |
|---|---|
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | `catchClassifier.ts` |
| `EXPO_PUBLIC_SUPABASE_URL` | `syncService.ts` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `syncService.ts` |
| `EXPO_PUBLIC_SIGNALK_HOST/PORT` | `nmea.ts` SignalKConnector |

## Supabase table
```sql
create table catch_events (
  id          text primary key,
  event_code  text unique not null,
  data        jsonb not null,
  created_at  timestamptz default now(),
  synced_at   timestamptz default now()
);
```

## Key API versioning constraints
- **expo-sqlite v14**: `openDatabaseAsync` only — no synchronous API
- **expo-camera v15**: `CameraView` component — not the old `Camera`
- **expo-av v14**: `Audio.Recording` class for voice capture
- **expo-location v17**: `requestForegroundPermissionsAsync` → `getCurrentPositionAsync`

## Event code format
`CATCH-YYYY-MMDD-NNN` — counter stored in AsyncStorage under key `event_counter` (see `CaptainScreen.tsx`).

## Theme constants
`background: #0a1628`, `surface: #122040`, `accent: #1e90ff`. Defined locally per file (no shared theme module).

# Salmon Charter AI – Claude Code Memory

## Project
React Native (Expo) Android app for AI-powered fishing catch logging.
Target: Georgian Bay charter captains.

## Stack
- React Native + Expo
- TypeScript (strict mode)
- SQLite (expo-sqlite) for local storage
- Supabase for cloud sync
- Claude API (claude-sonnet-4-20250514) for AI features
- Open-Meteo Marine API for weather

## Commands
- Start dev: `npx expo start`
- Android: `npx expo run:android`
- Install deps: `npm install`
- Type check: `npx tsc --noEmit`

## Rules
- TypeScript everywhere, no JS files
- Functional components + hooks only
- Local-first: always write to SQLite before any network call
- All API keys in .env, never hardcoded
- Handle offline state gracefully on every screen

## Autonomy
- Work autonomously without stopping to ask for confirmation
- Make all architectural and implementation decisions independently  
- Only stop for hard blockers you cannot resolve on your own
- Do not ask "should I proceed?" — always proceed