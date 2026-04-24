/**
 * Hydrodynamic Scoring Agent
 * Computes a HydroScore (0-100) from weather, GPS, and historical data.
 * Specialized for Georgian Bay salmon fishing conditions.
 */

import { HydroScore } from '../models/Event';
import { clamp, angleDiff } from '../utils/scoring';

export interface HydroInput {
  // Current conditions
  windSpeed: number;        // km/h
  windDirection: number;    // degrees (meteorological: direction wind comes FROM)
  waveHeight: number;       // meters
  airTemp: number;          // celsius
  waterTemp: number;        // celsius
  pressure: number;         // hPa
  lat: number;
  lng: number;

  // Satellite food chain data (optional — null when cloud cover blocks sensor)
  chlorophyll?: number | null;  // µg/L — phytoplankton proxy
  turbidity?: number | null;    // mg/L suspended minerals — baitfish habitat proxy

  // Historical data (last 48h, ordered oldest-first)
  windHistory: Array<{
    windSpeed: number;
    windDirection: number;
    timestamp: string;
  }>;
  pressureHistory: Array<{
    pressure: number;
    timestamp: string;
  }>;
}

// ─── Known Georgian Bay Embayments ──────────────────────────────────────────
// [lat, lng, radiusKm, name]
const GEORGIAN_BAY_EMBAYMENTS: Array<[number, number, number, string]> = [
  [44.75, -79.88, 8, 'Severn Sound'],
  [44.83, -79.93, 6, 'Penetang Harbour'],
  [45.12, -79.98, 5, 'Parry Sound Harbour'],
  [45.35, -80.05, 7, 'Byng Inlet'],
  [44.93, -79.73, 6, 'Coldwater Bay'],
  [45.55, -80.25, 5, 'Key Harbour'],
  [45.68, -80.42, 6, 'Britt Area'],
  [45.02, -79.87, 4, 'Waubaushene'],
  [44.72, -79.79, 5, 'Midland Bay'],
  [44.68, -79.72, 4, 'Nottawasaga Bay'],
];

// ─── Known Georgian Bay Wetland Areas ───────────────────────────────────────
// [lat, lng, radiusKm]
const WETLAND_AREAS: Array<[number, number, number]> = [
  [44.80, -79.91, 3],  // Tay River wetlands
  [45.10, -80.02, 4],  // Parry Sound area wetlands
  [44.73, -79.82, 3],  // Midland wetlands
  [45.38, -80.12, 3],  // Magnetawan River mouth
  [44.92, -79.68, 2],  // Coldwater River mouth
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function hoursAgo(isoTimestamp: string): number {
  return (Date.now() - new Date(isoTimestamp).getTime()) / 3_600_000;
}

/**
 * Get entries from the last N hours of a history array.
 */
function lastNHours<T extends { timestamp: string }>(
  history: T[],
  hours: number
): T[] {
  return history.filter((h) => hoursAgo(h.timestamp) <= hours);
}

// ─── Sub-Score Calculators ───────────────────────────────────────────────────

/**
 * Wind Transport Score (max 25)
 * Measures Ekman transport efficiency — wind-driven upwelling of nutrients.
 */
function calcWindTransport(input: HydroInput): number {
  // Base score from current wind speed
  const base = clamp(input.windSpeed * 0.5, 0, 15);

  // Direction bonus: is wind blowing toward Georgian Bay's typical onshore angle?
  // Georgian Bay opens roughly to the NW (315°), so onshore winds come from NW (315°)
  // Wind blowing FROM NW pushes surface water TO shore = transport
  const onshoreDirection = 315; // degrees from
  const dirDiff = angleDiff(input.windDirection, onshoreDirection);
  const directionBonus = dirDiff <= 45 ? 5 : 0;

  // Duration bonus: consistent wind for 12+ hours
  const last12h = lastNHours(input.windHistory, 12);
  let durationBonus = 0;
  if (last12h.length >= 4) {
    // Need at least 4 data points in 12h
    const avgSpeed =
      last12h.reduce((s, h) => s + h.windSpeed, 0) / last12h.length;
    const avgDirSin =
      last12h.reduce((s, h) => s + Math.sin(toRad(h.windDirection)), 0) /
      last12h.length;
    const avgDirCos =
      last12h.reduce((s, h) => s + Math.cos(toRad(h.windDirection)), 0) /
      last12h.length;
    const avgDir =
      (Math.atan2(avgDirSin, avgDirCos) * 180) / Math.PI;

    // Check if wind was consistent (within 45° of current direction)
    const consistent = last12h.every(
      (h) => angleDiff(h.windDirection, avgDir) <= 45
    );
    if (consistent && avgSpeed > 10) {
      durationBonus = 5;
    }
  }

  return clamp(base + directionBonus + durationBonus, 0, 25);
}

/**
 * Mixing / Stratification Score (max 20)
 * Stable stratification = warm surface layer = salmon habitat boundary.
 */
function calcMixingStratification(input: HydroInput): number {
  const tempDiff = Math.abs(input.airTemp - input.waterTemp);

  let baseScore: number;
  if (tempDiff < 2) {
    baseScore = 18; // Very stable stratification — excellent
  } else if (tempDiff <= 5) {
    baseScore = 12; // Moderate mixing
  } else {
    baseScore = 5;  // Heavy mixing — poor conditions
  }

  // High waves reduce stratification (mixing effect)
  const wavePenalty = input.waveHeight > 1.0 ? baseScore * 0.2 : 0;

  return clamp(Math.round(baseScore - wavePenalty), 0, 20);
}

/**
 * Residence Time Score (max 20)
 * How long water remains in an area — longer = more nutrient accumulation.
 */
function calcResidenceTime(input: HydroInput): number {
  let base = 10; // Unknown embayment baseline

  // Check if we're inside a known Georgian Bay embayment
  for (const [eLat, eLng, radius] of GEORGIAN_BAY_EMBAYMENTS) {
    const dist = haversineKm(input.lat, input.lng, eLat, eLng);
    if (dist <= radius) {
      base = 20;
      break;
    }
  }

  // Wind reversal penalty: if wind changed >90° in last 6h
  let windReversalPenalty = 0;
  const last6h = lastNHours(input.windHistory, 6);
  if (last6h.length >= 2) {
    const oldest = last6h[0];
    const newest = last6h[last6h.length - 1];
    const reversalAngle = angleDiff(oldest.windDirection, newest.windDirection);
    if (reversalAngle > 90) {
      windReversalPenalty = 5;
    }
  }

  return clamp(base - windReversalPenalty, 0, 20);
}

/**
 * Storm Pulse Score (max 20)
 * Recent storm = nutrient flush from runoff and bottom disturbance.
 * Optimal: storm 12-48h ago, now calmed.
 */
function calcStormPulse(input: HydroInput): number {
  let pressureDropScore = 0;
  let waveSurgeScore = 0;

  // Pressure drop in last 6h
  const last6hPressure = lastNHours(input.pressureHistory, 6);
  if (last6hPressure.length >= 2) {
    const oldest6h = last6hPressure[0].pressure;
    const newest = last6hPressure[last6hPressure.length - 1].pressure;
    const drop = oldest6h - newest;
    if (drop > 3) {
      pressureDropScore = 15;
    } else if (drop > 1.5) {
      pressureDropScore = 8;
    }
  }

  // Wave surge: high waves in last 12h that have since calmed
  const last12h = lastNHours(input.windHistory, 12);
  if (last12h.length >= 2 && input.waveHeight < 0.5) {
    // Current conditions are calm...
    // Check if recent wind was strong (proxy for prior wave activity)
    const maxRecentWind = Math.max(...last12h.map((h) => h.windSpeed));
    if (maxRecentWind > 30) {
      // km/h — significant storm wind
      waveSurgeScore = 10;
    } else if (maxRecentWind > 20) {
      waveSurgeScore = 5;
    }
  }

  return clamp(pressureDropScore + waveSurgeScore, 0, 20);
}

/**
 * Shoreline / Wetland Score (max 15)
 * Proximity to nutrient-rich wetland areas and shoreline structure.
 */
function calcShorelineWetland(input: HydroInput): number {
  // Georgian Bay shore proximity estimate
  // The bay's eastern shore runs roughly 44.5-45.8°N, 79.6-80.5°W
  // Simple proximity heuristic: within 2km of estimated shore band
  const isNearShore = isWithinGeorgianBayShore(input.lat, input.lng, 2);
  const proximityScore = isNearShore ? 10 : 0;

  // Wetland bonus
  let wetlandBonus = 0;
  for (const [wLat, wLng, radius] of WETLAND_AREAS) {
    const dist = haversineKm(input.lat, input.lng, wLat, wLng);
    if (dist <= radius) {
      wetlandBonus = 5;
      break;
    }
  }

  return clamp(proximityScore + wetlandBonus, 0, 15);
}

/**
 * Rough check if a point is within distKm of Georgian Bay's eastern shore band.
 * Uses a simplified polygon approximation.
 */
function isWithinGeorgianBayShore(
  lat: number,
  lng: number,
  distKm: number
): boolean {
  // Simplified: check if position is within the general Georgian Bay region
  // and close to the eastern shore longitude band
  const inRegion =
    lat >= 44.5 && lat <= 46.0 && lng >= -81.5 && lng <= -79.0;
  if (!inRegion) return false;

  // Shore reference points along eastern shore
  const shorePoints: Array<[number, number]> = [
    [44.55, -79.65],
    [44.72, -79.80],
    [44.90, -79.92],
    [45.05, -79.98],
    [45.25, -80.05],
    [45.45, -80.18],
    [45.65, -80.35],
    [45.85, -80.55],
  ];

  for (const [sLat, sLng] of shorePoints) {
    if (haversineKm(lat, lng, sLat, sLng) <= distKm) {
      return true;
    }
  }
  return false;
}

/**
 * Prey Availability Score (max 15, bonus — capped at 100 in total)
 * Uses satellite chlorophyll-a and suspended minerals to estimate food chain productivity.
 * Chain: phytoplankton → zooplankton → smelt/shiners → salmon/trout.
 * Returns 0 when satellite data is unavailable (cloud cover).
 */
function calcPreyAvailability(input: HydroInput): number {
  // Chlorophyll score (0-10): Georgian Bay productive range is 2-8 µg/L
  let chlScore = 0;
  if (input.chlorophyll != null && input.chlorophyll > 0) {
    if (input.chlorophyll >= 2 && input.chlorophyll <= 8) {
      chlScore = 10; // Peak zooplankton zone — smelt/shiners actively feeding
    } else if (input.chlorophyll >= 0.5 && input.chlorophyll < 2) {
      chlScore = 5;  // Low productivity, some forage present
    } else if (input.chlorophyll > 8) {
      chlScore = clamp(10 - (input.chlorophyll - 8), 0, 10); // High bloom can disperse baitfish
    }
  }

  // Turbidity score (0-5): smelt prefer slightly turbid water (0.01-0.08 mg/L)
  // Very clear water = poor camouflage for prey; very murky = poor feeding light
  let smScore = 0;
  if (input.turbidity != null && input.turbidity > 0) {
    if (input.turbidity >= 0.01 && input.turbidity <= 0.08) {
      smScore = 5; // Ideal smelt habitat
    } else if (input.turbidity > 0.08 && input.turbidity <= 0.15) {
      smScore = 2; // Moderate — baitfish still present
    }
    // <0.01 (too clear) or >0.15 (too murky): 0 pts
  }

  return clamp(chlScore + smScore, 0, 15);
}

// ─── Confidence Calculation ──────────────────────────────────────────────────

function calcConfidence(
  input: HydroInput
): 'low' | 'medium' | 'high' {
  let points = 0;

  // GPS data present
  if (input.lat !== 0 && input.lng !== 0) points++;

  // Wind history available and recent
  if (input.windHistory.length >= 4) {
    const recent = lastNHours(input.windHistory, 2);
    if (recent.length > 0) points++;
  }

  // Pressure history available
  if (input.pressureHistory.length >= 2) points++;

  // Current weather data valid
  if (input.windSpeed > 0 || input.waveHeight > 0) points++;

  // Air/water temp data
  if (input.airTemp !== 0 && input.waterTemp !== 0) points++;

  if (points >= 5) return 'high';
  if (points >= 3) return 'medium';
  return 'low';
}

// ─── Reasoning Generator ────────────────────────────────────────────────────

function buildReasoning(
  input: HydroInput,
  scores: {
    windTransport: number;
    mixingStratification: number;
    residenceTime: number;
    stormPulse: number;
    shorelineWetland: number;
    preyAvailability: number;
    total: number;
  }
): string {
  const parts: string[] = [];

  if (scores.windTransport >= 15) {
    parts.push('Strong onshore wind transport creating favourable upwelling.');
  } else if (scores.windTransport >= 8) {
    parts.push('Moderate wind transport conditions.');
  } else {
    parts.push('Low wind-driven transport.');
  }

  const tempDiff = Math.abs(input.airTemp - input.waterTemp);
  if (scores.mixingStratification >= 15) {
    parts.push(
      `Excellent thermal stratification (ΔT=${tempDiff.toFixed(1)}°C) — stable thermocline.`
    );
  } else if (scores.mixingStratification >= 10) {
    parts.push(`Moderate stratification (ΔT=${tempDiff.toFixed(1)}°C).`);
  } else {
    parts.push(`Poor stratification (ΔT=${tempDiff.toFixed(1)}°C) — heavy mixing.`);
  }

  if (scores.stormPulse >= 10) {
    parts.push('Recent storm event detected — nutrient flush likely active.');
  }

  if (scores.shorelineWetland >= 10) {
    parts.push('Position near wetland/shoreline nutrient zone.');
  }

  if (scores.preyAvailability >= 10) {
    parts.push(`High food chain activity (chlorophyll ${input.chlorophyll?.toFixed(1) ?? '?'} µg/L) — smelt and shiners likely nearby.`);
  } else if (scores.preyAvailability >= 5) {
    parts.push('Moderate prey availability detected via satellite.');
  } else if (input.chlorophyll == null) {
    parts.push('Prey data unavailable (satellite blocked by cloud cover).');
  }

  if (scores.total >= 70) {
    parts.push('Overall: HIGH PROBABILITY HOTSPOT — excellent salmon conditions.');
  } else if (scores.total >= 50) {
    parts.push('Overall: GOOD conditions for Georgian Bay salmon.');
  } else if (scores.total >= 30) {
    parts.push('Overall: FAIR conditions — try adjusting depth and location.');
  } else {
    parts.push('Overall: POOR conditions — consider relocating.');
  }

  return parts.join(' ');
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

/**
 * Compute a full HydroScore from input data.
 */
export function computeHydroScore(input: HydroInput): HydroScore {
  const windTransport = calcWindTransport(input);
  const mixingStratification = calcMixingStratification(input);
  const residenceTime = calcResidenceTime(input);
  const stormPulse = calcStormPulse(input);
  const shorelineWetland = calcShorelineWetland(input);
  const preyAvailability = calcPreyAvailability(input);

  const total = clamp(
    windTransport +
      mixingStratification +
      residenceTime +
      stormPulse +
      shorelineWetland +
      preyAvailability,
    0,
    100
  );

  const confidence = calcConfidence(input);
  const hotspotProbability = total / 100;

  const reasoning = buildReasoning(input, {
    windTransport,
    mixingStratification,
    residenceTime,
    stormPulse,
    shorelineWetland,
    preyAvailability,
    total,
  });

  return {
    total,
    windTransport,
    mixingStratification,
    residenceTime,
    stormPulse,
    shorelineWetland,
    preyAvailability,
    confidence,
    hotspotProbability,
    reasoning,
  };
}

/**
 * Create a default/empty HydroScore for when computation isn't possible.
 */
export function defaultHydroScore(): HydroScore {
  return {
    total: 0,
    windTransport: 0,
    mixingStratification: 0,
    residenceTime: 0,
    stormPulse: 0,
    shorelineWetland: 0,
    preyAvailability: 0,
    confidence: 'low',
    hotspotProbability: 0,
    reasoning: 'Insufficient data to compute HydroScore.',
  };
}
