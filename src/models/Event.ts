export interface GpsData {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number;  // degrees
  speed: number;    // knots
}

export interface WeatherData {
  windSpeed: number;       // km/h
  windDirection: number;   // degrees
  waveHeight: number;      // meters
  airTemp: number;         // celsius
  waterTemp: number;       // celsius
  pressure: number;        // hPa
  conditions: string;
  cloudCover: number;      // percent 0-100
  fetchedAt: string;       // ISO8601
}

export interface SetupData {
  downriggerDepth: number;  // feet
  lureType: string;
  lureColor: string;
  lineWeight: string;
  trollingSpeed: number;    // knots
  rodReel: string;
}

export interface VoiceNote {
  audioPath: string;
  transcript: string;
  duration: number;  // seconds
}

export interface HydroScore {
  total: number;                  // 0-100
  windTransport: number;          // 0-25
  mixingStratification: number;   // 0-20
  residenceTime: number;          // 0-20
  stormPulse: number;             // 0-20
  shorelineWetland: number;       // 0-15
  preyAvailability: number;       // 0-15 (satellite chlorophyll + turbidity)
  confidence: 'low' | 'medium' | 'high';
  hotspotProbability: number;     // 0-1
  reasoning: string;
}

export interface CatchEvent {
  id: string;
  eventCode: string;
  timestamp: string;
  status?: 'bite' | 'landed'; // 'bite' = hooked, no photo yet; 'landed' = photo attached
  biteTimestamp?: string;      // ISO8601 — when Fish On was tapped
  photo: string;              // local file path
  gps: GpsData;
  weather: WeatherData;
  setup: SetupData;
  voiceNote: VoiceNote;
  hydroScore: HydroScore;
  species: string;
  confidence: number;
  sizeEstimate: string;
  notes: string;
  weightLbsEstimate: number | null;
  synced: boolean;
  syncedAt?: string;
}

export interface WindHistory {
  timestamp: string;
  windSpeed: number;   // km/h
  windDirection: number; // degrees
}

export interface PressureHistory {
  timestamp: string;
  pressure: number;    // hPa
}
