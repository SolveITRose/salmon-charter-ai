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
  precipitation_mm: number | null;
  visibility_km: number | null;
  wave_height_ft: number | null;
  wave_period_dominant_s: number | null;
  wave_direction_deg: number | null;
  current_speed_knots: number | null;
  current_direction_deg: number | null;
  current_direction_label: string | null;
  sst_buoy_c: number | null;
  sst_satellite_c: number | null;
  chlorophyll_ug_l: number | null;  // Satellite chlorophyll-a (µg/L), proxy for phytoplankton
  turbidity_mg_l: number | null;    // Suspended minerals (mg/L), proxy for baitfish habitat
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
  previous_wind: Array<{ time: string; speed_mph: number; direction_deg: number; direction_label: string; temp_c: number | null; cloud_cover_pct: number | null; precipitation_mm: number | null; pressure_hpa: number | null }> | null;
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

function determineLake(lat: number, lng: number): { lakeId: string; stationId: string; nearestBuoyKm: number } {
  const match = LAKE_BOXES.find(
    (b) => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax,
  );
  if (match) {
    const s = STATIONS[match.id];
    return { lakeId: match.id, stationId: s.id, nearestBuoyKm: haversineKm(lat, lng, s.lat, s.lng) };
  }

  let nearestId = 'georgian_bay';
  let minDist = Infinity;
  for (const [id, s] of Object.entries(STATIONS)) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < minDist) { minDist = d; nearestId = id; }
  }
  return { lakeId: nearestId, stationId: STATIONS[nearestId].id, nearestBuoyKm: minDist };
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

// ── A2. Open-Meteo current conditions (primary atmospheric source) ────────
// Same model as fetchPreviousWind so current and history are internally consistent.

function calcDewPointC(tempC: number, humidity: number): number | null {
  if (!tempC || !humidity) return null;
  const a = 17.27, b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  return r1(b * alpha / (a - alpha));
}

async function fetchOpenMeteoAtmospheric(
  lat: number,
  lng: number,
): Promise<Partial<TripConditions>> {
  try {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
        `precipitation,cloud_cover,pressure_msl,` +
        `wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
        `&wind_speed_unit=mph`,
      {},
      10000,
    );
    if (!res.ok) return {};
    const data = await res.json();
    const c = data.current ?? {};

    const wdir: number | null = c.wind_direction_10m ?? null;
    const tempC: number | null = c.temperature_2m ?? null;
    const humidity: number | null = c.relative_humidity_2m ?? null;

    return {
      barometric_pressure_hpa: r1(c.pressure_msl ?? null),
      pressure_tendency_hpa:   null,
      pressure_trend:          null,
      wind_speed_mph:          r1(c.wind_speed_10m ?? null),
      wind_direction_deg:      wdir !== null ? Math.round(wdir) : null,
      wind_direction_label:    wdir !== null ? degreesToCardinal(wdir) : null,
      wind_gust_mph:           r1(c.wind_gusts_10m ?? null),
      air_temp_c:              r1(tempC),
      feels_like_c:            r1(c.apparent_temperature ?? null),
      humidity_pct:            humidity !== null ? Math.round(humidity) : null,
      dew_point_c:             tempC !== null && humidity !== null
                                 ? calcDewPointC(tempC, humidity) : null,
      cloud_cover_pct:         c.cloud_cover ?? null,
      precipitation_mm:        r1(c.precipitation ?? null),
    };
  } catch (err) {
    console.warn('[OpenMeteo] Current atmospheric fetch failed:', err);
    return {};
  }
}

// ── A3. OWM fallback (used only if Open-Meteo current also fails) ─────────

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
      precipitation_mm:         r1(owm.rain?.['1h'] ?? owm.rain?.['3h'] ?? null),
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
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,cloud_cover,precipitation,pressure_msl` +
      `&wind_speed_unit=mph` +
      `&past_days=1&forecast_days=1`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    const speeds: number[] = data.hourly?.wind_speed_10m ?? [];
    const dirs: number[] = data.hourly?.wind_direction_10m ?? [];
    const temps: number[] = data.hourly?.temperature_2m ?? [];
    const clouds: number[] = data.hourly?.cloud_cover ?? [];
    const precips: number[] = data.hourly?.precipitation ?? [];
    const pressures: number[] = data.hourly?.pressure_msl ?? [];

    const nowHour = now.getTime();
    return times
      .map((t, i) => ({ t, speed: speeds[i], dir: dirs[i], temp: temps[i], cloud: clouds[i], precip: precips[i], pres: pressures[i] }))
      .filter(({ t }) => new Date(t).getTime() <= nowHour)
      .slice(-24)
      .map(({ t, speed, dir, temp, cloud, precip, pres }) => ({
        time: new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        speed_mph: r1(speed) ?? 0,
        direction_deg: Math.round(dir ?? 0),
        direction_label: degreesToCardinal(dir ?? 0),
        temp_c: temp != null ? r1(temp) : null,
        cloud_cover_pct: cloud != null ? Math.round(cloud) : null,
        precipitation_mm: precip != null ? r1(precip) : null,
        pressure_hpa: pres != null ? Math.round(pres) : null,
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
      precipitation_mm:   daily.rain != null ? r1(daily.rain) : null,
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

// ── D2. GLERL Chlorophyll + Turbidity (food chain data) ──────────────────

const LAKE_ERDDAP_PREFIX: Record<string, string> = {
  georgian_bay: 'LH',
  huron:        'LH',
  superior:     'LS',
  michigan:     'LM',
  erie:         'LE',
  ontario:      'LO',
};

async function extractErddapValue(url: string, columnName: string): Promise<number | null> {
  try {
    // ERDDAP uses square brackets in URLs — encode them for strict browser compliance
    const encodedUrl = url.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
    const res = await fetchWithTimeout(encodedUrl, { mode: 'cors' }, 15000);
    if (!res.ok) {
      console.warn(`[GLERL] HTTP ${res.status} for ${columnName}`);
      return null;
    }
    const data = await res.json();
    const table = data?.table;
    if (!table) return null;
    const colNames: string[] = table.columnNames ?? [];
    const idx = colNames.indexOf(columnName);
    if (idx === -1) return null;
    const rows: Array<Array<unknown>> = table.rows ?? [];
    const values = rows
      .map((r) => r[idx])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
    if (!values.length) return null;
    return r1(values.reduce((a, b) => a + b, 0) / values.length);
  } catch (err) {
    console.warn(`[GLERL] fetch failed for ${columnName}:`, err);
    return null;
  }
}

async function fetchChlorophyllTurbidity(
  lat: number,
  lng: number,
  lakeId: string,
): Promise<{ chlorophyll_ug_l: number | null; turbidity_mg_l: number | null }> {
  const prefix = LAKE_ERDDAP_PREFIX[lakeId] ?? 'LH';
  const lat0 = (lat - 0.1).toFixed(4);
  const lat1 = (lat + 0.1).toFixed(4);
  const lng0 = (lng - 0.1).toFixed(4);
  const lng1 = (lng + 0.1).toFixed(4);
  const base = 'https://apps.glerl.noaa.gov/erddap/griddap';

  const [chlorophyll_ug_l, turbidity_mg_l] = await Promise.all([
    extractErddapValue(
      `${base}/${prefix}_CHL_NRT.json?Chlorophyll[(last)][(${lat0}):(${lat1})][(${lng0}):(${lng1})]`,
      'Chlorophyll',
    ),
    extractErddapValue(
      `${base}/${prefix}_SM_VIIRS_Monthly_Avg.json?Suspended_Minerals[(last)][(${lat0}):(${lat1})][(${lng0}):(${lng1})]`,
      'Suspended_Minerals',
    ),
  ]);

  return { chlorophyll_ug_l, turbidity_mg_l };
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

// ── Pressure trend fallback (Open-Meteo, used when NDBC is offline) ──────────

async function fetchPressureTrend(
  lat: number,
  lng: number,
): Promise<TripConditions['pressure_trend']> {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=pressure_msl` +
      `&start_date=${past.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();

    const times: string[] = data.hourly?.time ?? [];
    const pressures: number[] = data.hourly?.pressure_msl ?? [];

    const nowMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
    const agoMs  = nowMs - 3 * 60 * 60 * 1000;

    const nowIdx = times.reduce((best, t, i) =>
      Math.abs(new Date(t).getTime() - nowMs) < Math.abs(new Date(times[best]).getTime() - nowMs) ? i : best, 0);
    const agoIdx = times.reduce((best, t, i) =>
      Math.abs(new Date(t).getTime() - agoMs) < Math.abs(new Date(times[best]).getTime() - agoMs) ? i : best, 0);

    const cur = pressures[nowIdx] ?? null;
    const ago = pressures[agoIdx] ?? null;
    if (cur === null || ago === null) return null;

    const delta = cur - ago;
    if (delta > 0.1)  return 'rising';
    if (delta < -0.1) return 'falling';
    return 'steady';
  } catch {
    return null;
  }
}

// ── Main Export ────────────────────────────────────────────────────────────

export async function fetchTripConditions(
  lat: number,
  lng: number,
  date: string,
): Promise<TripConditions> {
  const { lakeId, stationId, nearestBuoyKm } = determineLake(lat, lng);

  // Skip NDBC if the nearest buoy is more than 200 km away — buoy data that
  // far from the user's location is meaningless. OWM atmospheric is GPS-based
  // and works anywhere in the world.
  const skipNDBC = nearestBuoyKm > 200;

  const [ndbcRaw, owm, omAtmo, solunar, glerl, prey, nws, uv, prevWind, astro, currents, pressureTrend] = await Promise.all([
    skipNDBC ? Promise.resolve(null) : fetchNDBC(stationId),
    fetchOWM(lat, lng),
    fetchOpenMeteoAtmospheric(lat, lng),   // primary: same model as history
    fetchSolunar(lat, lng, date),
    fetchGLERL(lat, lng),
    fetchChlorophyllTurbidity(lat, lng, lakeId),
    fetchNWSAlerts(lat, lng),
    fetchUVIndex(lat, lng),
    fetchPreviousWind(lat, lng),
    fetchAstroTimes(lat, lng, new Date()),
    lakeId === 'georgian_bay' ? fetchMarineCurrents(lat, lng) : Promise.resolve({ current_speed_knots: null, current_direction_deg: null, current_direction_label: null }),
    fetchPressureTrend(lat, lng),
  ]);

  // Atmospheric data: Open-Meteo (same model as history) is primary.
  // NDBC supplements with marine-specific data (waves, SST) when available.
  return {
    fetched_at:               new Date().toISOString(),
    lake_id:                  lakeId,
    ndbc_station_id:          stationId,
    query_lat:                lat,
    query_lng:                lng,
    barometric_pressure_hpa:  omAtmo.barometric_pressure_hpa  ?? ndbcRaw?.barometric_pressure_hpa ?? null,
    pressure_tendency_hpa:    ndbcRaw?.pressure_tendency_hpa  ?? null,
    pressure_trend:           pressureTrend                   ?? ndbcRaw?.pressure_trend ?? null,
    wind_speed_mph:           omAtmo.wind_speed_mph           ?? ndbcRaw?.wind_speed_mph ?? null,
    wind_direction_deg:       omAtmo.wind_direction_deg       ?? ndbcRaw?.wind_direction_deg ?? null,
    wind_direction_label:     omAtmo.wind_direction_label     ?? ndbcRaw?.wind_direction_label ?? null,
    wind_gust_mph:            omAtmo.wind_gust_mph            ?? ndbcRaw?.wind_gust_mph ?? null,
    air_temp_c:               omAtmo.air_temp_c               ?? ndbcRaw?.air_temp_c ?? null,
    cloud_cover_pct:          omAtmo.cloud_cover_pct          ?? owm.cloud_cover_pct ?? null,
    precipitation_type:       owm.precipitation_type          ?? null,
    precipitation_mm:         omAtmo.precipitation_mm         ?? owm.precipitation_mm ?? null,
    visibility_km:            ndbcRaw?.visibility_km          ?? null,
    wave_height_ft:           ndbcRaw?.wave_height_ft         ?? null,
    wave_period_dominant_s:   ndbcRaw?.wave_period_dominant_s ?? null,
    wave_direction_deg:       ndbcRaw?.wave_direction_deg     ?? null,
    current_speed_knots:      currents.current_speed_knots    ?? null,
    current_direction_deg:    currents.current_direction_deg  ?? null,
    current_direction_label:  currents.current_direction_label ?? null,
    sst_buoy_c:               ndbcRaw?.sst_buoy_c             ?? null,
    sst_satellite_c:          glerl.sst_satellite_c           ?? null,
    chlorophyll_ug_l:         prey.chlorophyll_ug_l           ?? null,
    turbidity_mg_l:           prey.turbidity_mg_l             ?? null,
    moon_phase_value:         owm.moon_phase_value            ?? calcMoonPhase(new Date()),
    moon_phase_label:         owm.moon_phase_label            ?? moonPhaseLabelFrom(owm.moon_phase_value ?? calcMoonPhase(new Date())),
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
    humidity_pct:             omAtmo.humidity_pct           ?? null,
    feels_like_c:             omAtmo.feels_like_c           ?? null,
    dew_point_c:              omAtmo.dew_point_c            ?? null,
    conditions_text:          owm.precipitation_type        ?? null,
    uv_index:                 uv.uv_index,
    uv_index_label:           uv.uv_index_label,
    previous_wind:            prevWind ?? null,
    marine_warning_active:    nws.marine_warning_active     ?? false,
    marine_warning_text:      nws.marine_warning_text       ?? null,
    atmospheric_source:       'ndbc',  // field kept for schema compat; now always Open-Meteo primary
  };
}

// ── Lightweight prey data fetch (for MapScreen) ────────────────────────────

export async function fetchPreyData(
  lat: number,
  lng: number,
): Promise<{ chlorophyll: number | null; turbidity: number | null }> {
  const { lakeId } = determineLake(lat, lng);
  const { chlorophyll_ug_l, turbidity_mg_l } = await fetchChlorophyllTurbidity(lat, lng, lakeId);
  return { chlorophyll: chlorophyll_ug_l, turbidity: turbidity_mg_l };
}
