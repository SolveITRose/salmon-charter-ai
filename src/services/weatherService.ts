import { WeatherData, WindHistory, PressureHistory } from '../models/Event';

const OWM_API = 'https://api.openweathermap.org/data/2.5/weather';
const OWM_KEY = process.env.EXPO_PUBLIC_OWM_API_KEY || '';
const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

interface MarineCurrentResponse {
  current?: {
    wave_height?: number;
    wind_wave_height?: number;
    wind_direction_10m?: number;
    wind_speed_10m?: number;
    temperature_2m?: number;
  };
  hourly?: {
    time?: string[];
    wave_height?: number[];
    wind_wave_height?: number[];
    ocean_current_velocity?: number[];
    ocean_current_direction?: number[];
  };
}

interface ForecastCurrentResponse {
  current?: {
    temperature_2m?: number;
    surface_pressure?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    weather_code?: number;
    cloud_cover?: number;
  };
  hourly?: {
    time?: string[];
    surface_pressure?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
}

/**
 * Fetch current weather from OpenWeatherMap (station observations) + wave height from Open-Meteo marine.
 */
export async function fetchWeatherData(
  lat: number,
  lng: number
): Promise<WeatherData | null> {
  try {
    const owmUrl = `${OWM_API}?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
    const marineUrl =
      `${MARINE_API}?latitude=${lat}&longitude=${lng}` +
      `&current=wave_height,wind_wave_height` +
      `&forecast_days=1`;

    const [owmRes, marineRes] = await Promise.all([
      fetch(owmUrl),
      fetch(marineUrl),
    ]);

    // Fall back to Open-Meteo if OWM key not yet active (401) or unavailable
    if (!owmRes.ok) {
      console.log('[Weather] OWM unavailable, falling back to Open-Meteo');
      return fetchWeatherDataFallback(lat, lng);
    }

    const owm = owmRes.ok ? await owmRes.json() : {};
    const marineData: MarineCurrentResponse = marineRes.ok ? await marineRes.json() : {};
    const marine = marineData.current || {};

    const windSpeed = owm.wind?.speed ?? 0;          // m/s
    const windDirection = owm.wind?.deg ?? 0;
    const waveHeight = marine.wave_height ?? 0;
    const airTemp = owm.main?.temp ?? 0;
    const waterTemp = airTemp - 2;
    const pressure = owm.main?.pressure ?? 1013;     // hPa sea-level
    const conditions = owm.weather?.[0]?.description
      ? capitalize(owm.weather[0].description)
      : decodeWeatherCode(0);
    const cloudCover = owm.clouds?.all ?? 0;

    return {
      windSpeed,
      windDirection,
      waveHeight,
      airTemp,
      waterTemp,
      pressure,
      conditions,
      cloudCover,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Weather] fetchWeatherData failed:', error);
    return null;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchWeatherDataFallback(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const [marineRes, forecastRes] = await Promise.all([
      fetch(`${MARINE_API}?latitude=${lat}&longitude=${lng}&current=wave_height,wind_wave_height,wind_direction_10m,wind_speed_10m,temperature_2m&forecast_days=1`),
      fetch(`${FORECAST_API}?latitude=${lat}&longitude=${lng}&current=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover&forecast_days=1`),
    ]);
    const marineData = marineRes.ok ? await marineRes.json() : {};
    const forecastData = forecastRes.ok ? await forecastRes.json() : {};
    const marine = marineData.current || {};
    const forecast = forecastData.current || {};
    const airTemp = forecast.temperature_2m ?? marine.temperature_2m ?? 0;
    return {
      windSpeed: forecast.wind_speed_10m ?? marine.wind_speed_10m ?? 0,
      windDirection: forecast.wind_direction_10m ?? marine.wind_direction_10m ?? 0,
      waveHeight: marine.wave_height ?? 0,
      airTemp,
      waterTemp: airTemp - 2,
      pressure: forecast.surface_pressure ?? 1013,
      conditions: decodeWeatherCode(forecast.weather_code ?? 0),
      cloudCover: forecast.cloud_cover ?? 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch last 48 hours of wind history for hydro scoring.
 */
export async function fetchWindHistory(
  lat: number,
  lng: number
): Promise<WindHistory[]> {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const startDate = formatDate(past);
    const endDate = formatDate(now);

    const url =
      `${FORECAST_API}?latitude=${lat}&longitude=${lng}` +
      `&hourly=wind_speed_10m,wind_direction_10m` +
      `&start_date=${startDate}&end_date=${endDate}`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const data: ForecastCurrentResponse = await res.json();
    const hourly = data.hourly || {};
    const times = hourly.time || [];
    const speeds = hourly.wind_speed_10m || [];
    const dirs = hourly.wind_direction_10m || [];

    return times.map((t, i) => ({
      timestamp: t,
      windSpeed: speeds[i] ?? 0,
      windDirection: dirs[i] ?? 0,
    }));
  } catch (error) {
    console.error('[Weather] fetchWindHistory failed:', error);
    return [];
  }
}

/**
 * Fetch last 48 hours of pressure history for hydro scoring.
 */
export async function fetchPressureHistory(
  lat: number,
  lng: number
): Promise<PressureHistory[]> {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const startDate = formatDate(past);
    const endDate = formatDate(now);

    const url =
      `${FORECAST_API}?latitude=${lat}&longitude=${lng}` +
      `&hourly=surface_pressure` +
      `&start_date=${startDate}&end_date=${endDate}`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const data: { hourly?: { time?: string[]; surface_pressure?: number[] } } =
      await res.json();
    const hourly = data.hourly || {};
    const times = hourly.time || [];
    const pressures = hourly.surface_pressure || [];

    return times.map((t, i) => ({
      timestamp: t,
      pressure: pressures[i] ?? 1013,
    }));
  } catch (error) {
    console.error('[Weather] fetchPressureHistory failed:', error);
    return [];
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function decodeWeatherCode(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 9) return 'Foggy';
  if (code <= 19) return 'Drizzle';
  if (code <= 29) return 'Rain';
  if (code <= 39) return 'Snow';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain Showers';
  if (code <= 94) return 'Thunderstorm';
  return 'Severe Thunderstorm';
}
