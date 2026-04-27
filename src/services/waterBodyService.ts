export interface WaterBodyInfo {
  name: string | null;
  type: 'river' | 'stream' | 'lake' | 'bay' | 'unknown';
  nearestCity: string | null;
  waterLevel_m: number | null;
  flow_cms: number | null;
  gaugeStation: string | null;
}

type GaugeResult = Pick<WaterBodyInfo, 'waterLevel_m' | 'flow_cms' | 'gaugeStation'>;

const NO_GAUGE: GaugeResult = { waterLevel_m: null, flow_cms: null, gaugeStation: null };

function withTimeout(promise: Promise<Response>, ms = 8000): Promise<Response> {
  return Promise.race([
    promise,
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function getJSON(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await withTimeout(fetch(url, { headers }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Water body name + type via Nominatim reverse geocode ──────────────────

async function lookupWaterBody(
  lat: number,
  lng: number,
): Promise<{ name: string | null; type: WaterBodyInfo['type']; nearestCity: string | null }> {
  try {
    const data = (await getJSON(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
      { 'User-Agent': 'SalmonCharterAI/1.0 (brianrose75@gmail.com)' },
    )) as Record<string, unknown>;

    const cls = (data.class as string) ?? '';
    const typ = (data.type as string) ?? '';
    const addr = (data.address as Record<string, string>) ?? {};
    const displayName = (data.name as string) ?? null;

    const nearestCity =
      addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? null;

    if (cls === 'waterway' || typ === 'river')
      return { name: displayName ?? addr.river ?? null, type: 'river', nearestCity };
    if (typ === 'stream' || typ === 'creek')
      return { name: displayName ?? addr.stream ?? null, type: 'stream', nearestCity };
    if (typ === 'bay')
      return { name: displayName ?? addr.bay ?? null, type: 'bay', nearestCity };
    if (cls === 'natural' && (typ === 'water' || typ === 'lake'))
      return { name: displayName ?? addr.lake ?? addr.water ?? null, type: 'lake', nearestCity };

    // Check address object for water references
    if (addr.river)  return { name: addr.river,  type: 'river',   nearestCity };
    if (addr.stream) return { name: addr.stream, type: 'stream',  nearestCity };
    if (addr.bay)    return { name: addr.bay,    type: 'bay',     nearestCity };
    if (addr.lake)   return { name: addr.lake,   type: 'lake',    nearestCity };
    if (addr.water)  return { name: addr.water,  type: 'unknown', nearestCity };

    return { name: null, type: 'unknown', nearestCity };
  } catch (err) {
    console.warn('[WaterBody] Nominatim failed:', err);
    return { name: null, type: 'unknown', nearestCity: null };
  }
}

// ── Canada: ECCC MSC GeoMet hydrometric API ────────────────────────────────

async function fetchECCCGauge(lat: number, lng: number): Promise<GaugeResult> {
  try {
    // GeoJSON convention: longitude first
    const stData = (await getJSON(
      `https://api.weather.gc.ca/collections/hydrometric-stations/items` +
        `?near=${lng},${lat}&near-distance=50000&status=Active&f=json&limit=1`,
    )) as { features?: Array<{ properties: Record<string, unknown> }> };

    const station = stData.features?.[0]?.properties;
    if (!station) return NO_GAUGE;

    const stationNumber = station.STATION_NUMBER as string;
    const gaugeStation = station.STATION_NAME as string;

    const dataJson = (await getJSON(
      `https://api.weather.gc.ca/collections/hydrometric-realtime/items` +
        `?station_number=${stationNumber}&f=json&limit=1&sortby=-DATETIME`,
    )) as { features?: Array<{ properties: Record<string, unknown> }> };

    const obs = dataJson.features?.[0]?.properties ?? {};
    return {
      waterLevel_m: (obs.LEVEL as number) ?? null,
      flow_cms:     (obs.DISCHARGE as number) ?? null,
      gaugeStation,
    };
  } catch (err) {
    console.warn('[WaterBody] ECCC gauge failed:', err);
    return NO_GAUGE;
  }
}

// ── USA: USGS Water Services ───────────────────────────────────────────────

async function fetchUSGSGauge(lat: number, lng: number): Promise<GaugeResult> {
  try {
    const data = (await getJSON(
      `https://waterservices.usgs.gov/nwis/iv/?format=json` +
        `&latitude=${lat}&longitude=${lng}` +
        `&siteType=ST&siteStatus=active` +
        `&radius=30&radiusUnits=km&parameterCd=00060,00065`,
    )) as { value?: { timeSeries?: Array<Record<string, unknown>> } };

    const timeSeries = data.value?.timeSeries ?? [];
    if (!timeSeries.length) return NO_GAUGE;

    const gaugeStation =
      ((timeSeries[0] as Record<string, unknown>).sourceInfo as Record<string, unknown>)?.siteName as string ?? null;

    let waterLevel_ft: number | null = null;
    let flow_cfs: number | null = null;

    for (const ts of timeSeries) {
      const tsr = ts as Record<string, unknown>;
      const pCode =
        ((tsr.variable as Record<string, unknown>)?.variableCode as Array<Record<string, unknown>>)?.[0]?.value as string ?? '';
      const raw =
        ((tsr.values as Array<Record<string, unknown>>)?.[0]?.value as Array<Record<string, unknown>>)?.[0]
          ?.value as string ?? '';
      const val = parseFloat(raw);
      if (!isNaN(val)) {
        if (pCode === '00065') waterLevel_ft = val;
        if (pCode === '00060') flow_cfs = val;
      }
    }

    return {
      waterLevel_m: waterLevel_ft !== null ? Math.round(waterLevel_ft * 0.3048 * 100) / 100 : null,
      flow_cms:     flow_cfs     !== null ? Math.round(flow_cfs * 0.0283168 * 10) / 10 : null,
      gaugeStation,
    };
  } catch (err) {
    console.warn('[WaterBody] USGS gauge failed:', err);
    return NO_GAUGE;
  }
}

function isCanada(lat: number, lng: number): boolean {
  return lat >= 41.7 && lat <= 83.0 && lng >= -141.0 && lng <= -52.6;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function fetchWaterBodyInfo(lat: number, lng: number): Promise<WaterBodyInfo> {
  const { name, type, nearestCity } = await lookupWaterBody(lat, lng);

  const isRiver = type === 'river' || type === 'stream';
  if (!isRiver) return { name, type, nearestCity, ...NO_GAUGE };

  const gauge = isCanada(lat, lng)
    ? await fetchECCCGauge(lat, lng)
    : await fetchUSGSGauge(lat, lng);

  return { name, type, nearestCity, ...gauge };
}
