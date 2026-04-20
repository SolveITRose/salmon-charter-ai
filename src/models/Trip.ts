import { CatchEvent, GpsData } from './Event';

export interface TripWaypoint {
  timestamp: string;
  gps: GpsData;
}

export interface Trip {
  id: string;
  date: string;               // ISO8601 date string
  captainName: string;
  vesselName: string;
  departureTime: string;      // ISO8601
  returnTime?: string;        // ISO8601
  catchEvents: CatchEvent[];
  waypoints: TripWaypoint[];
  totalDistance: number;      // nautical miles
  notes: string;
  synced: boolean;
}

export interface TripSummary {
  id: string;
  date: string;
  catchCount: number;
  topSpecies: string;
  avgHydroScore: number;
  duration: number;           // minutes
}

export function createTripSummary(trip: Trip): TripSummary {
  const catchCount = trip.catchEvents.length;
  const topSpecies =
    catchCount > 0
      ? getMostCommonSpecies(trip.catchEvents.map((e) => e.species))
      : 'None';
  const avgHydroScore =
    catchCount > 0
      ? trip.catchEvents.reduce((sum, e) => sum + e.hydroScore.total, 0) /
        catchCount
      : 0;

  let duration = 0;
  if (trip.returnTime) {
    const dep = new Date(trip.departureTime).getTime();
    const ret = new Date(trip.returnTime).getTime();
    duration = Math.round((ret - dep) / 60000);
  }

  return {
    id: trip.id,
    date: trip.date,
    catchCount,
    topSpecies,
    avgHydroScore: Math.round(avgHydroScore),
    duration,
  };
}

function getMostCommonSpecies(species: string[]): string {
  const counts: Record<string, number> = {};
  for (const s of species) {
    counts[s] = (counts[s] || 0) + 1;
  }
  let max = 0;
  let top = 'Unknown';
  for (const [name, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      top = name;
    }
  }
  return top;
}
