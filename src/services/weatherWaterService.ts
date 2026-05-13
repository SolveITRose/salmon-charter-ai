const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL ?? "http://192.168.2.87:8000";

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
  chlorophyll_ug_l: number | null;
  turbidity_mg_l: number | null;
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

export async function fetchTripConditions(
  lat: number,
  lng: number,
  _date: string,
): Promise<TripConditions> {
  const response = await fetch(`${PROXY_URL}/conditions?lat=${lat}&lng=${lng}`);
  if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
  return response.json();
}

export async function fetchPreyData(
  lat: number,
  lng: number,
): Promise<{ chlorophyll: number | null; turbidity: number | null }> {
  const response = await fetch(`${PROXY_URL}/conditions?lat=${lat}&lng=${lng}`);
  if (!response.ok) return { chlorophyll: null, turbidity: null };
  const data: TripConditions = await response.json();
  return { chlorophyll: data.chlorophyll_ug_l, turbidity: data.turbidity_mg_l };
}
