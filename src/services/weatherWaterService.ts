const OWM_KEY = process.env.EXPO_PUBLIC_OWM_API_KEY || '';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TripConditions {
  fetched_at: string;
  lake_id: string;
  ndbc_station_id: string;
  query_lat: number;
  query_lng: number;
  barometric_pressure_hpa: number | null;
  pressure_tendency_hpa: number | null;
  pressure_trend: 'rising' | 'falling' | 'steady' | null;
  wind_speed_mph: number | null;
  wind_direction_deg: number | null;
  wind_direction_label: string | null;
  wind_gust_mph: number | null;
  air_temp_c: number | null;
  cloud_cover_pct: number | null;
  precipitation_type: string | null;
  visibility_km: number | null;
  wave_height_ft: number | null;
  wave_period_dominant_s: number | null;
  wave_direction_deg: number | null;
  current_speed_knots: number | null;
  current_direction_deg: number | null;
  current_direction_label: string | null;
  sst_buoy_c: number | null;
  sst_satellite_c: number | null;
  moon_phase_value: number | null;
  moon_phase_label: string | null;
  moonrise_time: string | null;
  moonset_time: string | null;
  sunrise_time: string | null;
  sunset_time: string | null;
  solunar_major_1_start: string | null;
  solunar_major_1_stop: string | null;
  solunar_major_2_start: string | null;
  solunar_major_2_stop: string | null;
  solunar_minor_1_start: string | null;
  solunar_minor_1_stop: string | null;
  solunar_minor_2_start: string | null;
  solunar_minor_2_stop: string | null;
  solunar_day_rating: number | null;
  humidity_pct: number | null;
  feels_like_c: number | null;
  dew_point_c: number | null;
  conditions_text: string | null;
  uv_index: number | null;
  uv_index_label: string | null;
  previous_wind: Array<{ time: string; speed_mph: number; direction_deg: number; direction_label: string; temp_c: number | null; cloud_cover_pct: number | null }> | null;
  marine_warning_active: boolean;
  marine_warning_text: string | null;
  atmospheric_source: 'ndbc' | 'owm';
}

// ── Lake bounding boxes & buoy stations ───────────────────────────────────

const STATIONS: Record<string, { id: string; lat: number; lng: number }> = {
  superior:     { id: '45001', lat: 48.068, lng: -86.603 },
  michigan:     { id: '45007', lat: 45.022, lng: -87.105 },
  huron:        { id: '45003', lat: 45.349, lng: -82.836 },
  georgian_bay: { id: '45143', lat: 44.792, lng: -80.277 },
  erie:         { id: '45005', lat: 41.680, lng: -82.390 },
  ontario:      { id: '45012', lat: 43.618, lng: -77.394 },
};

// Georgian Bay must be checked before Huron (GB bbox is inside Huron's)
const LAKE_BOXES = [
  { id: 'georgian_bay', latMin: 44.5, latMax: 46.0, lngMin: -81.3, lngMax: -79.5 },
  { id: 'superior',     latMin: 46.2, latMax: 49.1, lngMin: -92.2, lngMax: -84.3 },
  { id: 'michigan',     latMin: 41.6, latMax: 46.1, lngMin: -87.6, lngMax: -84.7 },
  { id: 'huron',        latMin: 43.0, latMax: 46.4, lngMin: -84.8, lngMax: -79.4 },
  { id: 'erie',         latMin: 41.3, latMax: 43.0, lngMin: -83.5, lngMax: -78.8 },
  { id: 'ontario',      latMin: 43.1, latMax: 44.4, lngMin: -79.9, lngMax: -76.0 },
];

function determineLake(lat: number, lng: number): { lakeId: string; stationId: string } {
  const match = LAKE_BOXES.find(
    (b) => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax,
  );
  if (match) return { lakeId: match.id, stationId: STATIONS[match.id].id };

  let nearestId = 'georgian_bay';
  let minDist = Infinity;
  for (const [id, s] of Object.entries(STATIONS)) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < minDist) { minDist = d; nearestId = id; }
  }
  return { lakeId: nearestId, stationId: STATIONS[nearestId].id };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function r1(n: number | null | undefined): number | null {
  if (n == null || isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function parseMM(v: string | undefined): number | null {
  if (!v || v.toUpperCase() === 'MM') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function moonPhaseLabelFrom(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return 'new moon';
  if (phase < 0.23) return 'waxing crescent';
  if (phase < 0.27) return 'first quarter';
  if (phase < 0.48) return 'waxing gibbous';
  if (phase < 0.52) return 'full moon';
  if (phase < 0.73) return 'waning gibbous';
  if (phase < 0.77) return 'last quarter';
  return 'waning crescent';
}

function unixToLocalHHMM(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ── A. NDBC Buoy ───────────────────────────────────────────────────────────

function parseNDBCText(text: string): Record<string, string> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let headerLine = '';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (!headerLine) headerLine = line.replace(/^#+\s*/, '');
    } else {
      dataLines.push(line);
    }
  }

  if (!headerLine || !dataLines.length) return {};
  const headers = headerLine.split(/\s+/);
  const lastLine = dataLines[dataLines.length - 1];
  const values = lastLine.split(/\s+/);

  const result: Record<string, string> = {};
  headers.forEach((h, i) => { result[h] = values[i] ?? 'MM'; });
  return result;
}

async function fetchNDBC(stationId: string): Promise<Partial<TripConditions> | null> {
  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) {
      console.warn(`[NDBC] Station ${stationId} returned HTTP ${res.status} — will use fallback`);
      return null;
    }
    const d = parseNDBCText(await res.text());

    const pres = parseMM(d['PRES'] ?? d['BAR']);
    const ptdy = parseMM(d['PTDY']);
    const wspd = parseMM(d['WSPD']);
    const gst  = parseMM(d['GST']);
    const atmp = parseMM(d['ATMP']);
    const wtmp = parseMM(d['WTMP']);
    const wvht = parseMM(d['WVHT']);
    const dpd  = parseMM(d['DPD']);
    const mwd  = parseMM(d['MWD']);
    const wdir = parseMM(d['WDIR']);
    const vis  = parseMM(d['VIS']);

    return {
      barometric_pressure_hpa: r1(pres),
      pressure_tendency_hpa:   r1(ptdy),
      pressure_trend:
        ptdy === null ? null : ptdy > 0 ? 'rising' : ptdy < 0 ? 'falling' : 'steady',
      wind_speed_mph:      r1(wspd !== null ? wspd * 2.237 : null),
      wind_direction_deg:  r1(wdir),
      wind_direction_label: wdir !== null ? degreesToCardinal(wdir) : null,
      wind_gust_mph:       r1(gst !== null ? gst * 2.237 : null),
      air_temp_c:          r1(atmp),
      sst_buoy_c:          r1(wtmp),
      wave_height_ft:      r1(wvht !== null ? wvht * 3.281 : null),
      wave_period_dominant_s: r1(dpd),
      wave_direction_deg:  r1(mwd),
      // NDBC VIS is in nautical miles — convert to km
      visibility_km:       r1(vis !== null ? vis * 1.852 : null),
    };
  } catch (err) {
    console.warn(`[NDBC] Failed for station ${stationId}:`, err);
    return null;
  }
}

// ── A2. OWM fallback (used when NDBC has no realtime data) ────────────────

function calcDewPointC(tempC: number, humidity: number): number | null {
  if (!tempC || !humidity) return null;
  const a = 17.27, b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  return r1(b * alpha / (a - alpha));
}

async function fetchOWMAtmospheric(
  lat: number,
  lng: number,
): Promise<Partial<TripConditions>> {
  try {
    const [owmRes, marineRes] = await Promise.all([
      fetchWithTimeout(
        `https://api.openweathermap.org/data/2.5/weather` +
          `?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`,
        {},
        10000,
      ),
      fetchWithTimeout(
        `https://marine-api.open-meteo.com/v1/marine` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=wave_height,wave_period,wave_direction`,
        {},
        10000,
      ),
    ]);

    const owm = owmRes.ok ? await owmRes.json() : {};
    const marine = marineRes.ok ? (await marineRes.json()).current ?? {} : {};

    const wdir: number | null = owm.wind?.deg ?? null;
    const tempC: number | null = owm.main?.temp ?? null;
    const humidity: number | null = owm.main?.humidity ?? null;

    return {
      barometric_pressure_hpa:  r1(owm.main?.pressure ?? null),
      pressure_tendency_hpa:    null,
      pressure_trend:           null,
      wind_speed_mph:           r1(owm.wind?.speed != null ? owm.wind.speed * 2.237 : null),
      wind_direction_deg:       r1(wdir),
      wind_direction_label:     wdir !== null ? degreesToCardinal(wdir) : null,
      wind_gust_mph:            r1(owm.wind?.gust != null ? owm.wind.gust * 2.237 : null),
      air_temp_c:               r1(tempC),
      feels_like_c:             r1(owm.main?.feels_like ?? null),
      humidity_pct:             humidity,
      dew_point_c:              tempC !== null && humidity !== null
                                  ? calcDewPointC(tempC, humidity) : null,
      conditions_text:          owm.weather?.[0]?.description
                                  ? capitalize(owm.weather[0].description) : null,
      cloud_cover_pct:          owm.clouds?.all ?? null,
      visibility_km:            owm.visibility != null ? r1(owm.visibility / 1000) : null,
      wave_height_ft:           r1(marine.wave_height != null ? marine.wave_height * 3.281 : null),
      wave_period_dominant_s:   r1(marine.wave_period ?? null),
      wave_direction_deg:       r1(marine.wave_direction ?? null),
      sst_buoy_c:               null,
    };
  } catch (err) {
    console.warn('[OWM] Atmospheric fallback failed:', err);
    return {};
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Previous Wind History (Open-Meteo hourly, last 12h) ───────────────────

async function fetchPreviousWind(
  lat: number,
  lng: number,
): Promise<TripConditions['previous_wind']> {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startDate = past.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,cloud_cover` +
      `&wind_speed_unit=mph` +
      `&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    const speeds: number[] = data.hourly?.wind_speed_10m ?? [];
    const dirs: number[] = data.hourly?.wind_direction_10m ?? [];
    const temps: number[] = data.hourly?.temperature_2m ?? [];
    const clouds: number[] = data.hourly?.cloud_cover ?? [];

    const nowHour = now.getTime();
    return times
      .map((t, i) => ({ t, speed: speeds[i], dir: dirs[i], temp: temps[i], cloud: clouds[i] }))
      .filter(({ t }) => new Date(t).getTime() <= nowHour)
      .slice(-24)
      .map(({ t, speed, dir, temp, cloud }) => ({
        time: new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        speed_mph: r1(speed) ?? 0,
        direction_deg: Math.round(dir ?? 0),
        direction_label: degreesToCardinal(dir ?? 0),
        temp_c: temp != null ? r1(temp) : null,
        cloud_cover_pct: cloud != null ? Math.round(cloud) : null,
      }));
  } catch {
    return null;
  }
}

// ── UV Index (Open-Meteo daily, free) ─────────────────────────────────────

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

async function fetchUVIndex(lat: number, lng: number): Promise<{ uv_index: number | null; uv_index_label: string | null }> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}&daily=uv_index_max&forecast_days=1&timezone=auto`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return { uv_index: null, uv_index_label: null };
    const data = await res.json();
    const uv: number | null = data.daily?.uv_index_max?.[0] ?? null;
    return {
      uv_index:       uv !== null ? r1(uv) : null,
      uv_index_label: uv !== null ? uvLabel(uv) : null,
    };
  } catch {
    return { uv_index: null, uv_index_label: null };
  }
}

// ── Moon phase math fallback ────────────────────────────────────────────────

function calcMoonPhase(date: Date): number {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const daysSince = (date.getTime() - knownNewMoon.getTime()) / 86400000;
  return Math.round(((daysSince % lunarCycle + lunarCycle) % lunarCycle / lunarCycle) * 100) / 100;
}

// ── B. USNO Astronomical Rise/Set Times ───────────────────────────────────

async function fetchAstroTimes(
  lat: number,
  lng: number,
  date: Date,
): Promise<{ sunrise: string | null; sunset: string | null; moonrise: string | null; moonset: string | null }> {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const tzOffset = -Math.round(date.getTimezoneOffset() / 60);
    const url = `https://aa.usno.navy.mil/api/rstt/oneday?date=${dateStr}&coords=${lat},${lng}&tz=${tzOffset}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return { sunrise: null, sunset: null, moonrise: null, moonset: null };
    const json = await res.json();

    const sun: Array<{ phen: string; time: string }> = json?.properties?.data?.sundata  ?? [];
    const moon: Array<{ phen: string; time: string }> = json?.properties?.data?.moondata ?? [];
    const pick = (arr: Array<{ phen: string; time: string }>, phen: string) =>
      arr.find((e) => e.phen === phen)?.time ?? null;

    return {
      sunrise:  pick(sun,  'Rise'),
      sunset:   pick(sun,  'Set'),
      moonrise: pick(moon, 'Rise'),
      moonset:  pick(moon, 'Set'),
    };
  } catch (err) {
    console.warn('[USNO] Astro times fetch failed:', err);
    return { sunrise: null, sunset: null, moonrise: null, moonset: null };
  }
}

// ── C. OpenWeatherMap One Call 3.0 (moon phase only) ──────────────────────

async function fetchOWM(lat: number, lng: number): Promise<Partial<TripConditions>> {
  try {
    const url =
      `https://api.openweathermap.org/data/3.0/onecall` +
      `?lat=${lat}&lon=${lng}&exclude=minutely,hourly,alerts&units=imperial&appid=${OWM_KEY}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) {
      console.warn('[OWM] One Call returned', res.status);
      return {};
    }
    const data = await res.json();
    const daily = data.daily?.[0];
    if (!daily) return {};

    const main: string = daily.weather?.[0]?.main ?? '';
    const precipType =
      main === 'Clear'        ? 'none'    :
      main === 'Rain'         ? 'rain'    :
      main === 'Drizzle'      ? 'drizzle' :
      main === 'Thunderstorm' ? 'storm'   : 'other';

    const moonPhase: number | null = daily.moon_phase ?? null;

    return {
      cloud_cover_pct:    daily.clouds ?? null,
      precipitation_type: precipType,
      moon_phase_value:   moonPhase !== null ? r1(moonPhase) : null,
      moon_phase_label:   moonPhase !== null ? moonPhaseLabelFrom(moonPhase) : null,
      moonrise_time:      daily.moonrise ? unixToLocalHHMM(daily.moonrise) : null,
      moonset_time:       daily.moonset  ? unixToLocalHHMM(daily.moonset)  : null,
      sunrise_time:       daily.sunrise  ? unixToLocalHHMM(daily.sunrise)  : null,
      sunset_time:        daily.sunset   ? unixToLocalHHMM(daily.sunset)   : null,
    };
  } catch (err) {
    console.warn('[OWM] One Call failed:', err);
    return {};
  }
}

// ── C. Solunar ─────────────────────────────────────────────────────────────

async function fetchSolunar(
  lat: number,
  lng: number,
  date: string,
): Promise<Partial<TripConditions>> {
  try {
    const yyyymmdd = date.replace(/-/g, '');
    const tz = -new Date().getTimezoneOffset() / 60;
    const url = `https://api.solunar.org/solunar/${lat},${lng},${yyyymmdd},${tz}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) {
      console.warn('[Solunar] API returned', res.status);
      return {};
    }
    const d = await res.json();
    return {
      solunar_major_1_start: d.major1Start ?? null,
      solunar_major_1_stop:  d.major1Stop  ?? null,
      solunar_major_2_start: d.major2Start ?? null,
      solunar_major_2_stop:  d.major2Stop  ?? null,
      solunar_minor_1_start: d.minor1Start ?? null,
      solunar_minor_1_stop:  d.minor1Stop  ?? null,
      solunar_minor_2_start: d.minor2Start ?? null,
      solunar_minor_2_stop:  d.minor2Stop  ?? null,
      solunar_day_rating:    d.dayRating !== undefined ? r1(d.dayRating) : null,
    };
  } catch (err) {
    console.warn('[Solunar] fetch failed:', err);
    return {};
  }
}

// ── D. GLERL CoastWatch Satellite SST ─────────────────────────────────────

async function fetchGLERL(lat: number, lng: number): Promise<Partial<TripConditions>> {
  try {
    const lat0 = (lat - 0.1).toFixed(4);
    const lat1 = (lat + 0.1).toFixed(4);
    const lng0 = (lng - 0.1).toFixed(4);
    const lng1 = (lng + 0.1).toFixed(4);
    const url =
      `https://coastwatch.glerl.noaa.gov/erddap/griddap/GLSEA_L3S_daily.json` +
      `?analysed_sst[(last)][(${lat0}):(${lat1})][(${lng0}):(${lng1})]`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) {
      console.warn('[GLERL] ERDDAP returned', res.status);
      return { sst_satellite_c: null };
    }
    const data = await res.json();
    const table = data?.table;
    if (!table) return { sst_satellite_c: null };

    const colNames: string[] = table.columnNames ?? [];
    const sstIdx = colNames.indexOf('analysed_sst');
    if (sstIdx === -1) return { sst_satellite_c: null };

    const rows: Array<Array<unknown>> = table.rows ?? [];
    const values = rows
      .map((r) => r[sstIdx])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (!values.length) return { sst_satellite_c: null };

    const avgC = values.reduce((a, b) => a + b, 0) / values.length;
    return { sst_satellite_c: r1(avgC) };
  } catch (err) {
    console.warn('[GLERL] fetch failed:', err);
    return { sst_satellite_c: null };
  }
}

// ── E. NWS Marine Alerts ───────────────────────────────────────────────────

const MARINE_WARNING_EVENTS = [
  'Small Craft Advisory',
  'Gale Warning',
  'Storm Warning',
  'Special Marine Warning',
  'Hurricane Force Wind Warning',
];

async function fetchNWSAlerts(lat: number, lng: number): Promise<Partial<TripConditions>> {
  try {
    const url =
      `https://api.weather.gov/alerts/active` +
      `?point=${lat},${lng}&status=actual&message_type=alert`;
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'FishingReportsAI/1.0 (brianrose75@gmail.com)' } },
      8000,
    );
    if (!res.ok) {
      // NWS only covers US territory — silently return no warning for Canadian waters
      return { marine_warning_active: false, marine_warning_text: null };
    }
    const data = await res.json();
    const features: Array<{ properties: { event: string; headline: string } }> =
      data.features ?? [];

    const match = features.find((f) =>
      MARINE_WARNING_EVENTS.some((w) => f.properties.event?.includes(w)),
    );
    return {
      marine_warning_active: !!match,
      marine_warning_text:   match?.properties.headline ?? null,
    };
  } catch (err) {
    console.warn('[NWS] Alerts fetch failed:', err);
    return { marine_warning_active: false, marine_warning_text: null };
  }
}

// ── Georgian Bay Ocean Currents (Open-Meteo marine hourly) ────────────────

async function fetchMarineCurrents(
  lat: number,
  lng: number,
): Promise<{ current_speed_knots: number | null; current_direction_deg: number | null; current_direction_label: string | null }> {
  try {
    const url =
      `https://marine-api.open-meteo.com/v1/marine` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=ocean_current_velocity,ocean_current_direction` +
      `&forecast_days=1`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return { current_speed_knots: null, current_direction_deg: null, current_direction_label: null };
    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    const speeds: number[] = data.hourly?.ocean_current_velocity ?? [];
    const dirs: number[] = data.hourly?.ocean_current_direction ?? [];

    // Find the index closest to current hour
    const now = new Date();
    const nowHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
    const idx = times.findIndex((t) => new Date(t).getTime() >= nowHour);
    const i = idx === -1 ? times.length - 1 : idx;

    const speedMs = speeds[i] ?? null;
    const dir = dirs[i] ?? null;
    return {
      current_speed_knots: speedMs !== null ? r1(speedMs * 1.944) : null,
      current_direction_deg: dir !== null ? Math.round(dir) : null,
      current_direction_label: dir !== null ? degreesToCardinal(dir) : null,
    };
  } catch {
    return { current_speed_knots: null, current_direction_deg: null, current_direction_label: null };
  }
}

// ── Main Export ────────────────────────────────────────────────────────────

export async function fetchTripConditions(
  lat: number,
  lng: number,
  date: string,
): Promise<TripConditions> {
  const { lakeId, stationId } = determineLake(lat, lng);

  const [ndbcRaw, owm, owmAtmo, solunar, glerl, nws, uv, prevWind, astro, currents] = await Promise.all([
    fetchNDBC(stationId),
    fetchOWM(lat, lng),
    fetchOWMAtmospheric(lat, lng),
    fetchSolunar(lat, lng, date),
    fetchGLERL(lat, lng),
    fetchNWSAlerts(lat, lng),
    fetchUVIndex(lat, lng),
    fetchPreviousWind(lat, lng),
    fetchAstroTimes(lat, lng, new Date()),
    lakeId === 'georgian_bay' ? fetchMarineCurrents(lat, lng) : Promise.resolve({ current_speed_knots: null, current_direction_deg: null, current_direction_label: null }),
  ]);

  // Fall back to OWM atmospheric if NDBC station has no realtime data (e.g. Canadian buoys)
  const usingFallback = ndbcRaw === null;
  const ndbc = ndbcRaw ?? owmAtmo;

  return {
    fetched_at:               new Date().toISOString(),
    lake_id:                  lakeId,
    ndbc_station_id:          stationId,
    query_lat:                lat,
    query_lng:                lng,
    barometric_pressure_hpa:  ndbc.barometric_pressure_hpa  ?? null,
    pressure_tendency_hpa:    ndbc.pressure_tendency_hpa    ?? null,
    pressure_trend:           ndbc.pressure_trend           ?? null,
    wind_speed_mph:           ndbc.wind_speed_mph           ?? null,
    wind_direction_deg:       ndbc.wind_direction_deg       ?? null,
    wind_direction_label:     ndbc.wind_direction_label     ?? null,
    wind_gust_mph:            ndbc.wind_gust_mph            ?? null,
    air_temp_c:               ndbc.air_temp_c               ?? null,
    cloud_cover_pct:          owm.cloud_cover_pct           ?? owmAtmo.cloud_cover_pct ?? null,
    precipitation_type:       owm.precipitation_type        ?? null,
    visibility_km:            ndbc.visibility_km            ?? null,
    wave_height_ft:           ndbc.wave_height_ft           ?? null,
    wave_period_dominant_s:   ndbc.wave_period_dominant_s   ?? null,
    wave_direction_deg:       ndbc.wave_direction_deg       ?? null,
    current_speed_knots:      currents.current_speed_knots  ?? null,
    current_direction_deg:    currents.current_direction_deg ?? null,
    current_direction_label:  currents.current_direction_label ?? null,
    sst_buoy_c:               ndbc.sst_buoy_c               ?? null,
    sst_satellite_c:          glerl.sst_satellite_c         ?? null,
    moon_phase_value:         owm.moon_phase_value          ?? calcMoonPhase(new Date()),
    moon_phase_label:         owm.moon_phase_label          ?? moonPhaseLabelFrom(owm.moon_phase_value ?? calcMoonPhase(new Date())),
    moonrise_time:            astro.moonrise ?? null,
    moonset_time:             astro.moonset  ?? null,
    sunrise_time:             astro.sunrise  ?? null,
    sunset_time:              astro.sunset   ?? null,
    solunar_major_1_start:    solunar.solunar_major_1_start ?? null,
    solunar_major_1_stop:     solunar.solunar_major_1_stop  ?? null,
    solunar_major_2_start:    solunar.solunar_major_2_start ?? null,
    solunar_major_2_stop:     solunar.solunar_major_2_stop  ?? null,
    solunar_minor_1_start:    solunar.solunar_minor_1_start ?? null,
    solunar_minor_1_stop:     solunar.solunar_minor_1_stop  ?? null,
    solunar_minor_2_start:    solunar.solunar_minor_2_start ?? null,
    solunar_minor_2_stop:     solunar.solunar_minor_2_stop  ?? null,
    solunar_day_rating:       solunar.solunar_day_rating    ?? null,
    humidity_pct:             ndbc.humidity_pct             ?? null,
    feels_like_c:             ndbc.feels_like_c             ?? null,
    dew_point_c:              ndbc.dew_point_c              ?? null,
    conditions_text:          ndbc.conditions_text          ?? owm.precipitation_type ?? null,
    uv_index:                 uv.uv_index,
    uv_index_label:           uv.uv_index_label,
    previous_wind:            prevWind ?? null,
    marine_warning_active:    nws.marine_warning_active     ?? false,
    marine_warning_text:      nws.marine_warning_text       ?? null,
    atmospheric_source:       usingFallback ? 'owm' : 'ndbc',
  };
}
