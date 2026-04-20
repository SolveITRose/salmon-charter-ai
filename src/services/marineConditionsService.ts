const OWM_API = 'https://api.openweathermap.org/data/2.5/weather';
const OWM_KEY = process.env.EXPO_PUBLIC_OWM_API_KEY || '';

const DEFAULT_LAT = 44.88702;
const DEFAULT_LNG = -80.066101;

export interface MarineConditions {
  stationName: string;
  issuedTime: string;
  wind: string;
  airTemp: string;
  conditions: string;
  humidity: string;
  visibility: string;
  dewPoint: string;
  pressure: string;
  pressureTendency: string;
  windChill: string;
  fetchedAt: string;
}

function degreesToCompass(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function mpsToKnots(mps: number): number {
  return Math.round(mps * 1.944);
}

function calcDewPoint(tempC: number, humidity: number): number {
  // Magnus formula approximation
  const a = 17.27, b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  return Math.round((b * alpha) / (a - alpha) * 10) / 10;
}

export async function fetchMarineConditions(
  lat = DEFAULT_LAT,
  lng = DEFAULT_LNG
): Promise<MarineConditions | null> {
  try {
    const url = `${OWM_API}?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log('[Marine] OWM not ready (status ' + res.status + '), retrying later');
      return null;
    }
    const d = await res.json();

    const tempC: number = d.main?.temp ?? 0;
    const humidity: number = d.main?.humidity ?? 0;
    const windMps: number = d.wind?.speed ?? 0;
    const windDeg: number = d.wind?.deg ?? 0;
    const pressureHpa: number = d.main?.pressure ?? 1013;
    const feelsLike: number = d.main?.feels_like ?? tempC;
    const visibilityM: number = d.visibility ?? 0;
    const description: string = d.weather?.[0]?.description ?? '';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-CA', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    return {
      stationName: d.name ?? 'Southern Georgian Bay',
      issuedTime: timeStr,
      wind: `${degreesToCompass(windDeg)} ${mpsToKnots(windMps)}`,
      airTemp: tempC.toFixed(1),
      conditions: description ? description.charAt(0).toUpperCase() + description.slice(1) : '--',
      humidity: `${humidity}`,
      visibility: visibilityM > 0 ? (visibilityM / 1000).toFixed(1) : 'N/A',
      dewPoint: calcDewPoint(tempC, humidity).toFixed(1),
      pressure: (pressureHpa / 10).toFixed(1),   // hPa → kPa
      pressureTendency: '',
      windChill: feelsLike.toFixed(1),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Marine] fetchMarineConditions failed:', error);
    return null;
  }
}
