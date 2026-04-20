/**
 * NMEA 0183 sentence parser
 * Supports: $GPRMC, $GPGGA, $IIVHW, $IIDPT, $IIMTW
 * Also provides SignalK WebSocket connector
 */

export interface GprmcData {
  valid: boolean;
  timestamp: string;   // ISO8601
  lat: number;
  lng: number;
  speedKnots: number;
  headingDeg: number;
}

export interface GpggaData {
  valid: boolean;
  lat: number;
  lng: number;
  altitude: number;
  fixQuality: number;
  satellites: number;
}

export interface IivhwData {
  waterSpeedKnots: number;
  magneticHeading: number;
}

export interface IidptData {
  depthMeters: number;
  offsetMeters: number;
}

export interface IimtwData {
  waterTempCelsius: number;
}

// ─── Checksum ───────────────────────────────────────────────────────────────

function validateChecksum(sentence: string): boolean {
  const starIdx = sentence.lastIndexOf('*');
  if (starIdx === -1) return true; // no checksum, assume valid
  const payload = sentence.slice(1, starIdx);
  const expected = sentence.slice(starIdx + 1, starIdx + 3).toUpperCase();
  let checksum = 0;
  for (let i = 0; i < payload.length; i++) {
    checksum ^= payload.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0') === expected;
}

function stripChecksum(sentence: string): string {
  const starIdx = sentence.lastIndexOf('*');
  return starIdx !== -1 ? sentence.slice(0, starIdx) : sentence;
}

// ─── Coordinate Helpers ─────────────────────────────────────────────────────

/**
 * Parse NMEA lat/lng format: DDMM.MMMM N/S or DDDMM.MMMM E/W
 */
function parseCoord(value: string, dir: string): number {
  if (!value) return 0;
  const dotIdx = value.indexOf('.');
  const degreeDigits = dotIdx - 2;
  const degrees = parseFloat(value.slice(0, degreeDigits));
  const minutes = parseFloat(value.slice(degreeDigits));
  let decimal = degrees + minutes / 60;
  if (dir === 'S' || dir === 'W') decimal = -decimal;
  return decimal;
}

// ─── $GPRMC Parser ──────────────────────────────────────────────────────────

/**
 * Parse $GPRMC sentence
 * Format: $GPRMC,hhmmss.ss,A,llll.ll,a,yyyyy.yy,a,x.x,x.x,ddmmyy,x.x,a*hh
 */
export function parseGPRMC(sentence: string): GprmcData | null {
  try {
    if (!sentence.startsWith('$GPRMC')) return null;
    if (!validateChecksum(sentence)) return null;

    const clean = stripChecksum(sentence);
    const parts = clean.split(',');

    if (parts.length < 10) return null;

    const timeStr = parts[1];   // hhmmss.ss
    const status = parts[2];    // A=valid, V=invalid
    const latRaw = parts[3];
    const latDir = parts[4];
    const lngRaw = parts[5];
    const lngDir = parts[6];
    const speedKnots = parseFloat(parts[7]) || 0;
    const headingDeg = parseFloat(parts[8]) || 0;
    const dateStr = parts[9];   // ddmmyy

    const valid = status === 'A';
    const lat = parseCoord(latRaw, latDir);
    const lng = parseCoord(lngRaw, lngDir);

    // Build ISO timestamp
    let timestamp = new Date().toISOString();
    if (timeStr && dateStr && timeStr.length >= 6 && dateStr.length >= 6) {
      const day = dateStr.slice(0, 2);
      const month = dateStr.slice(2, 4);
      const year = '20' + dateStr.slice(4, 6);
      const hh = timeStr.slice(0, 2);
      const mm = timeStr.slice(2, 4);
      const ss = timeStr.slice(4, 6);
      timestamp = `${year}-${month}-${day}T${hh}:${mm}:${ss}Z`;
    }

    return { valid, timestamp, lat, lng, speedKnots, headingDeg };
  } catch (error) {
    console.error('[NMEA] parseGPRMC error:', error);
    return null;
  }
}

// ─── $GPGGA Parser ──────────────────────────────────────────────────────────

/**
 * Parse $GPGGA sentence
 * Format: $GPGGA,hhmmss.ss,llll.ll,a,yyyyy.yy,a,x,xx,x.x,x.x,M,x.x,M,x.x,xxxx*hh
 */
export function parseGPGGA(sentence: string): GpggaData | null {
  try {
    if (!sentence.startsWith('$GPGGA')) return null;
    if (!validateChecksum(sentence)) return null;

    const clean = stripChecksum(sentence);
    const parts = clean.split(',');

    if (parts.length < 10) return null;

    const latRaw = parts[2];
    const latDir = parts[3];
    const lngRaw = parts[4];
    const lngDir = parts[5];
    const fixQuality = parseInt(parts[6], 10) || 0;
    const satellites = parseInt(parts[7], 10) || 0;
    const altitude = parseFloat(parts[9]) || 0;

    const lat = parseCoord(latRaw, latDir);
    const lng = parseCoord(lngRaw, lngDir);

    return {
      valid: fixQuality > 0,
      lat,
      lng,
      altitude,
      fixQuality,
      satellites,
    };
  } catch (error) {
    console.error('[NMEA] parseGPGGA error:', error);
    return null;
  }
}

// ─── $IIVHW Parser ──────────────────────────────────────────────────────────

/**
 * Parse $IIVHW sentence (water speed through hull)
 * Format: $IIVHW,x.x,T,x.x,M,x.x,N,x.x,K*hh
 * T=true heading, M=magnetic heading, N=speed knots, K=speed km/h
 */
export function parseIIVHW(sentence: string): IivhwData | null {
  try {
    if (!sentence.startsWith('$IIVHW')) return null;
    if (!validateChecksum(sentence)) return null;

    const clean = stripChecksum(sentence);
    const parts = clean.split(',');

    if (parts.length < 6) return null;

    const magneticHeading = parseFloat(parts[3]) || 0;
    const waterSpeedKnots = parseFloat(parts[5]) || 0;

    return { waterSpeedKnots, magneticHeading };
  } catch (error) {
    console.error('[NMEA] parseIIVHW error:', error);
    return null;
  }
}

// ─── $IIDPT Parser ──────────────────────────────────────────────────────────

/**
 * Parse $IIDPT sentence (depth below transducer)
 * Format: $IIDPT,x.x,x.x,x.x*hh
 * fields: depth(m), offset(m), max_range(m)
 */
export function parseIIDPT(sentence: string): IidptData | null {
  try {
    if (!sentence.startsWith('$IIDPT')) return null;
    if (!validateChecksum(sentence)) return null;

    const clean = stripChecksum(sentence);
    const parts = clean.split(',');

    if (parts.length < 3) return null;

    const depthMeters = parseFloat(parts[1]) || 0;
    const offsetMeters = parseFloat(parts[2]) || 0;

    return { depthMeters, offsetMeters };
  } catch (error) {
    console.error('[NMEA] parseIIDPT error:', error);
    return null;
  }
}

// ─── $IIMTW Parser ──────────────────────────────────────────────────────────

/**
 * Parse $IIMTW sentence (water temperature)
 * Format: $IIMTW,x.x,C*hh
 */
export function parseIIMTW(sentence: string): IimtwData | null {
  try {
    if (!sentence.startsWith('$IIMTW')) return null;
    if (!validateChecksum(sentence)) return null;

    const clean = stripChecksum(sentence);
    const parts = clean.split(',');

    if (parts.length < 3) return null;

    const waterTempCelsius = parseFloat(parts[1]) || 0;

    return { waterTempCelsius };
  } catch (error) {
    console.error('[NMEA] parseIIMTW error:', error);
    return null;
  }
}

// ─── Generic Sentence Router ─────────────────────────────────────────────────

export interface ParsedNMEA {
  type: string;
  data: GprmcData | GpggaData | IivhwData | IidptData | IimtwData | null;
}

export function parseNMEASentence(sentence: string): ParsedNMEA | null {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith('$')) return null;

  if (trimmed.startsWith('$GPRMC')) {
    return { type: 'GPRMC', data: parseGPRMC(trimmed) };
  }
  if (trimmed.startsWith('$GPGGA')) {
    return { type: 'GPGGA', data: parseGPGGA(trimmed) };
  }
  if (trimmed.startsWith('$IIVHW')) {
    return { type: 'IIVHW', data: parseIIVHW(trimmed) };
  }
  if (trimmed.startsWith('$IIDPT')) {
    return { type: 'IIDPT', data: parseIIDPT(trimmed) };
  }
  if (trimmed.startsWith('$IIMTW')) {
    return { type: 'IIMTW', data: parseIIMTW(trimmed) };
  }

  return null;
}

// ─── SignalK WebSocket Connector ─────────────────────────────────────────────

export interface SignalKUpdate {
  path: string;
  value: unknown;
  timestamp: string;
}

export interface SignalKConnectorOptions {
  host: string;
  port: number;
  onUpdate: (update: SignalKUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class SignalKConnector {
  private ws: WebSocket | null = null;
  private options: SignalKConnectorOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(options: SignalKConnectorOptions) {
    this.options = options;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket(): void {
    const { host, port } = this.options;
    const url = `ws://${host}:${port}/signalk/v1/stream?subscribe=all`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.options.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          this.processSignalKMessage(msg);
        } catch (e) {
          // Ignore parse errors
        }
      };

      this.ws.onerror = (event) => {
        this.options.onError?.(new Error('SignalK WebSocket error'));
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.options.onDisconnect?.();
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.openSocket(), 5000);
        }
      };
    } catch (error) {
      this.options.onError?.(error as Error);
    }
  }

  private processSignalKMessage(msg: unknown): void {
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as Record<string, unknown>;

    if (!Array.isArray(m.updates)) return;

    for (const update of m.updates as unknown[]) {
      if (typeof update !== 'object' || update === null) continue;
      const u = update as Record<string, unknown>;
      const timestamp = (u.timestamp as string) || new Date().toISOString();

      if (!Array.isArray(u.values)) continue;

      for (const val of u.values as unknown[]) {
        if (typeof val !== 'object' || val === null) continue;
        const v = val as Record<string, unknown>;
        if (typeof v.path === 'string') {
          this.options.onUpdate({
            path: v.path,
            value: v.value,
            timestamp,
          });
        }
      }
    }
  }
}
