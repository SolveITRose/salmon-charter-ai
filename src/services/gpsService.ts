import * as Location from 'expo-location';
import { GpsData } from '../models/Event';

let watchSubscription: Location.LocationSubscription | null = null;

/**
 * Request foreground location permission.
 * Returns true if granted.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[GPS] Permission request failed:', error);
    return false;
  }
}

/**
 * Get the current GPS position once.
 */
export async function getCurrentPosition(): Promise<GpsData | null> {
  try {
    const granted = await requestLocationPermission();
    if (!granted) {
      console.warn('[GPS] Location permission denied');
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });

    return mapLocationToGpsData(location);
  } catch (error) {
    console.error('[GPS] getCurrentPosition failed:', error);
    return null;
  }
}

/**
 * Start watching position continuously.
 * Calls onUpdate with new GpsData each time.
 * Returns cleanup function.
 */
export async function watchPosition(
  onUpdate: (data: GpsData) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  try {
    const granted = await requestLocationPermission();
    if (!granted) {
      onError?.(new Error('Location permission denied'));
      return () => {};
    }

    // Stop existing watch if any
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }

    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,    // every 5 seconds
        distanceInterval: 10,  // or every 10 meters
      },
      (location) => {
        onUpdate(mapLocationToGpsData(location));
      }
    );

    return () => {
      if (watchSubscription) {
        watchSubscription.remove();
        watchSubscription = null;
      }
    };
  } catch (error) {
    console.error('[GPS] watchPosition failed:', error);
    onError?.(error as Error);
    return () => {};
  }
}

/**
 * Stop watching position if active.
 */
export function stopWatching(): void {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
}

/**
 * Map an expo-location result to our GpsData interface.
 * Speed from expo-location is in m/s; we convert to knots.
 */
function mapLocationToGpsData(location: Location.LocationObject): GpsData {
  const { latitude, longitude, accuracy, heading, speed } = location.coords;

  // m/s → knots (1 m/s = 1.94384 knots)
  const speedKnots = speed != null && speed >= 0 ? speed * 1.94384 : 0;
  const headingDeg = heading != null && heading >= 0 ? heading : 0;
  const accuracyM = accuracy != null ? accuracy : 0;

  return {
    lat: latitude,
    lng: longitude,
    accuracy: accuracyM,
    heading: headingDeg,
    speed: speedKnots,
  };
}

/**
 * Haversine distance between two lat/lng points in nautical miles.
 */
export function haversineNM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
