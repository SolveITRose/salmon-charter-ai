// Re-export HydroScore interface from Event.ts for convenience
export type { HydroScore } from './Event';

// Additional HydroScore-specific types and helpers

export interface HydroScoreInput {
  windSpeed: number;        // km/h
  windDirection: number;    // degrees
  waveHeight: number;       // meters
  airTemp: number;          // celsius
  waterTemp: number;        // celsius
  pressure: number;         // hPa
  lat: number;
  lng: number;
  windHistory: Array<{ windSpeed: number; windDirection: number; timestamp: string }>;
  pressureHistory: Array<{ pressure: number; timestamp: string }>;
}

export interface HydroScoreBreakdown {
  windTransport: {
    base: number;
    directionBonus: number;
    durationBonus: number;
    total: number;
  };
  mixingStratification: {
    tempDiff: number;
    baseScore: number;
    wavePenalty: number;
    total: number;
  };
  residenceTime: {
    base: number;
    embaymentBonus: number;
    windReversalPenalty: number;
    total: number;
  };
  stormPulse: {
    pressureDrop: number;
    waveSurge: number;
    total: number;
  };
  shorelineWetland: {
    proximity: number;
    wetlandBonus: number;
    total: number;
  };
}
