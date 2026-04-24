import { GpsData } from '../models/Event';

export async function requestLocationPermission(): Promise<boolean> {
  return 'geolocation' in navigator;
}

export async function getCurrentPosition(): Promise<GpsData | null> {
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        heading: pos.coords.heading ?? 0,
        speed: pos.coords.speed != null ? pos.coords.speed * 1.94384 : 0,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

let watchId: number | null = null;

export async function watchPosition(
  onUpdate: (data: GpsData) => void,
  onError?: (error: Error) => void,
): Promise<() => void> {
  if (!('geolocation' in navigator)) {
    onError?.(new Error('Geolocation not supported'));
    return () => {};
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => onUpdate({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? 0,
      heading: pos.coords.heading ?? 0,
      speed: pos.coords.speed != null ? pos.coords.speed * 1.94384 : 0,
    }),
    (err) => onError?.(new Error(err.message)),
    { enableHighAccuracy: true },
  );
  return () => stopWatching();
}

export function stopWatching(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function haversineNM(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 3440.065;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
