/**
 * Scoring utilities for HydroScore visualization
 */

/**
 * Get color hex for a given HydroScore total (0-100)
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#00c853'; // Excellent - green
  if (score >= 60) return '#69f0ae'; // Good - light green
  if (score >= 40) return '#ffab00'; // Fair - amber
  if (score >= 20) return '#ff6d00'; // Poor - orange
  return '#ff5252';                  // Very poor - red
}

/**
 * Get label for a given HydroScore total
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Very Poor';
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence: 'low' | 'medium' | 'high' | string): string {
  switch (confidence) {
    case 'high':
      return '#00c853';
    case 'medium':
      return '#ffab00';
    case 'low':
      return '#ff5252';
    default:
      return '#8899aa';
  }
}

/**
 * Get color for species identification confidence (0-1)
 */
export function getSpeciesConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return '#00c853';
  if (confidence >= 0.65) return '#ffab00';
  return '#ff5252';
}

/**
 * Get sub-score bar color (lighter variant of main score color)
 */
export function getSubScoreColor(value: number, max: number): string {
  const pct = max > 0 ? value / max : 0;
  if (pct >= 0.8) return '#00c853';
  if (pct >= 0.6) return '#69f0ae';
  if (pct >= 0.4) return '#ffab00';
  if (pct >= 0.2) return '#ff6d00';
  return '#ff5252';
}

/**
 * Normalize a score to a 0-1 fraction
 */
export function normalizeScore(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/**
 * Calculate a simple moving average from an array of numbers
 */
export function movingAverage(values: number[], window: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculate angular difference between two directions (degrees), 0-180
 */
export function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}
