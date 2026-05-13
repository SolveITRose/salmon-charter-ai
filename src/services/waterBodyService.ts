const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL ?? "http://192.168.2.87:8000";

export interface WaterBodyInfo {
  name: string | null;
  type: 'river' | 'stream' | 'lake' | 'bay' | 'unknown';
  nearestCity: string | null;
  waterLevel_m: number | null;
  flow_cms: number | null;
  gaugeStation: string | null;
}

export async function fetchWaterBodyInfo(lat: number, lng: number): Promise<WaterBodyInfo> {
  try {
    const response = await fetch(`${PROXY_URL}/water-body?lat=${lat}&lng=${lng}`);
    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    return response.json();
  } catch (err) {
    console.warn('[WaterBody] fetch failed:', err);
    return { name: null, type: 'unknown', nearestCity: null, waterLevel_m: null, flow_cms: null, gaugeStation: null };
  }
}
