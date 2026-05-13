import React, { useRef, useEffect, memo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { TripConditions, BuoyDetail, fetchBuoyDetail } from '../services/weatherWaterService';
import { celsiusToFahrenheit } from '../utils/formatters';

function cToF(c: number | null): string {
  if (c === null) return '—';
  return `${Math.round(celsiusToFahrenheit(c))}°F`;
}

interface Props {
  conditions: TripConditions | null;
  loading: boolean;
  onRetry?: () => void;
  nearestCity?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function moonEmoji(label: string | null): string {
  switch (label) {
    case 'new moon':       return '🌑';
    case 'waxing crescent': return '🌒';
    case 'first quarter':  return '🌓';
    case 'waxing gibbous': return '🌔';
    case 'full moon':      return '🌕';
    case 'waning gibbous': return '🌖';
    case 'last quarter':   return '🌗';
    case 'waning crescent': return '🌘';
    default:               return '🌙';
  }
}

// WMO cloud modification factor for UV: CMF = 1 - 0.75 * (cloud_fraction)^3.4
// Accounts for the fact that heavy overcast still transmits ~25-35% of UV.
function attenuatedUV(uv: number | null, cloudPct: number | null): number | null {
  if (uv === null) return null;
  if (cloudPct === null || cloudPct <= 0) return uv;
  const cmf = 1 - 0.75 * Math.pow(cloudPct / 100, 3.4);
  return Math.round(uv * cmf * 10) / 10;
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function chlLabel(chl: number): string {
  if (chl >= 2 && chl <= 8) return 'Productive';
  if (chl >= 0.5 && chl < 2) return 'Low';
  if (chl > 8) return 'High bloom';
  return 'Very low';
}

function turbLabel(sm: number): string {
  if (sm >= 0.01 && sm <= 0.08) return 'Slight (smelt habitat)';
  if (sm > 0.08 && sm <= 0.15) return 'Moderate';
  if (sm > 0.15) return 'High';
  return 'Very clear';
}

function foodChainSummary(chl: number | null, turb: number | null): string {
  if (chl === null && turb === null) return 'Satellite data unavailable for this area.';

  const parts: string[] = [];

  if (chl !== null) {
    if (chl >= 2 && chl <= 8) {
      parts.push(`Chlorophyll is at ${chl} µg/L — healthy phytoplankton levels. Good base for the food chain.`);
    } else if (chl > 8) {
      parts.push(`Chlorophyll is elevated at ${chl} µg/L — bloom conditions. Can concentrate baitfish in patches.`);
    } else if (chl >= 0.5) {
      parts.push(`Chlorophyll at ${chl} µg/L — lower than peak productivity, but the food chain is active.`);
    } else {
      parts.push(`Chlorophyll at ${chl} µg/L — very low. Sparse food chain conditions.`);
    }
  }

  if (turb !== null) {
    if (turb >= 0.01 && turb <= 0.08) {
      parts.push(`Slight turbidity (${turb} mg/L) — typical smelt and baitfish habitat. Fish are likely feeding.`);
    } else if (turb > 0.08 && turb <= 0.15) {
      parts.push(`Moderate turbidity (${turb} mg/L) — some suspended particles. Baitfish may be scattered.`);
    } else if (turb > 0.15) {
      parts.push(`High turbidity (${turb} mg/L) — murky conditions. Baitfish feeding activity may be reduced.`);
    } else {
      parts.push(`Very clear water (${turb} mg/L) — low turbidity. Open water, baitfish may be deeper.`);
    }
  }

  return parts.join(' ');
}

function trendArrow(trend: TripConditions['pressure_trend']): string {
  if (trend === 'rising')  return ' ↑';
  if (trend === 'falling') return ' ↓';
  if (trend === 'steady')  return ' →';
  return '';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkeletonLine({ width = '100%' }: { width?: string | number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);
  return (
    <Animated.View style={[styles.skeletonLine, { width: width as number, opacity }]} />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

const WeatherWaterCard = memo(function WeatherWaterCard({
  conditions,
  loading,
  onRetry,
  nearestCity,
}: Props) {
  const coordsLabel = conditions
    ? (() => {
        const lat = conditions.query_lat;
        const lng = conditions.query_lng;
        const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${Math.abs(lng).toFixed(3)}°${lng >= 0 ? 'E' : 'W'}`;
        const coords = `${latStr} ${lngStr}`;
        return nearestCity ? `${coords}, ${nearestCity}` : coords;
      })()
    : null;
  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Conditions</Text>
        <View style={styles.skeletonBlock}>
          <SkeletonLine width="55%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="70%" />
          <SkeletonLine width="75%" />
          <SkeletonLine width="65%" />
          <SkeletonLine width="80%" />
        </View>
      </View>
    );
  }

  if (!conditions) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Conditions</Text>
        <Text style={styles.errorText}>Unable to load conditions</Text>
        {onRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const [expandedBuoys, setExpandedBuoys] = useState<string[]>([]);
  const [buoyData, setBuoyData] = useState<Record<string, BuoyDetail>>({});
  const [buoyLoading, setBuoyLoading] = useState<Record<string, boolean>>({});

  async function handleBuoyPress(stationId: string) {
    if (expandedBuoys.includes(stationId)) {
      setExpandedBuoys(prev => prev.filter(id => id !== stationId));
      return;
    }
    setExpandedBuoys(prev => [...prev, stationId]);
    if (!buoyData[stationId]) {
      setBuoyLoading(prev => ({ ...prev, [stationId]: true }));
      try {
        const data = await fetchBuoyDetail(stationId);
        setBuoyData(prev => ({ ...prev, [stationId]: data }));
      } finally {
        setBuoyLoading(prev => ({ ...prev, [stationId]: false }));
      }
    }
  }

  const ratingBars =
    conditions.solunar_day_rating !== null
      ? Math.round(Math.min(conditions.solunar_day_rating / 6, 1) * 5)
      : 0;

  return (
    <View style={styles.card}>
      {/* Marine Alert Banner — only shown when active */}
      {conditions.marine_warning_active && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>
            ⚠  {conditions.marine_warning_text ?? 'Marine Warning Active'}
          </Text>
        </View>
      )}

      {/* 1. Weather History */}
      {conditions.previous_wind && conditions.previous_wind.length > 0 && (
        <Section title={coordsLabel ? `Weather History (last 24h, ${coordsLabel})` : 'Weather History (last 24h)'}>
          <View style={styles.windHistoryHeader}>
            <Text style={[styles.windHistoryCol, styles.windHistoryColTime]}>Time</Text>
            <Text style={styles.windHistoryCol}>km/h</Text>
            <Text style={styles.windHistoryCol}>Hdg</Text>
            <Text style={styles.windHistoryCol}>Temp</Text>
            <Text style={styles.windHistoryCol}>Cloud</Text>
            <Text style={styles.windHistoryCol}>Precip</Text>
          </View>
          {[...conditions.previous_wind].reverse().map((w, i) => (
            <View key={i} style={styles.windHistoryRow}>
              <Text style={[styles.windHistoryCol, styles.windHistoryColTime, styles.windHistoryVal]}>{w.time}</Text>
              <Text style={[styles.windHistoryCol, styles.windHistoryVal]}>{Math.round(w.speed_mph * 1.60934)}</Text>
              <Text style={[styles.windHistoryCol, styles.windHistoryVal]}>{w.direction_deg}°{'\n'}{w.direction_label}</Text>
              <Text style={[styles.windHistoryCol, styles.windHistoryVal]}>{w.temp_c != null ? cToF(w.temp_c) : '—'}</Text>
              <Text style={[styles.windHistoryCol, styles.windHistoryVal]}>{w.cloud_cover_pct != null ? `${w.cloud_cover_pct}%` : '—'}</Text>
              <Text style={[styles.windHistoryCol, styles.windHistoryVal]}>{w.precipitation_mm != null && w.precipitation_mm > 0 ? `${Math.round(w.precipitation_mm)}mm` : '—'}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* 2. Water — Southern Georgian Bay Buoys */}
      <Section title="Water">
        <View style={styles.buoyTableHeader}>
          <Text style={[styles.buoyCol, styles.buoyColId, styles.buoyHeaderText]}>ID</Text>
          <Text style={[styles.buoyCol, styles.buoyColName, styles.buoyHeaderText]}>Name</Text>
          <Text style={[styles.buoyCol, styles.buoyColLocation, styles.buoyHeaderText]}>Location</Text>
        </View>
        {[
          { id: '45137', name: 'Georgian Bay',       location: '45.540°N 81.020°W · Western Islands' },
          { id: '45143', name: 'South Georgian Bay', location: '44.940°N 80.627°W · Near Collingwood' },
        ].map((buoy) => (
          <View key={buoy.id}>
            <View style={styles.buoyRow}>
              <TouchableOpacity style={[styles.buoyCol, styles.buoyColId]} onPress={() => handleBuoyPress(buoy.id)}>
                <Text style={styles.buoyIdLink}>{buoy.id}</Text>
              </TouchableOpacity>
              <Text style={[styles.buoyCol, styles.buoyColName, styles.buoyText]}>{buoy.name}</Text>
              <Text style={[styles.buoyCol, styles.buoyColLocation, styles.buoyText]}>{buoy.location}</Text>
            </View>
            {expandedBuoys.includes(buoy.id) && (
              <View style={styles.buoyDetail}>
                {buoyLoading[buoy.id] ? (
                  <Text style={styles.buoyDetailLoading}>Loading…</Text>
                ) : buoyData[buoy.id] ? (
                  <>
                    <Row label="Wind Direction" value={buoyData[buoy.id].wind_direction_deg !== null ? `${buoyData[buoy.id].wind_direction_deg}° (${buoyData[buoy.id].wind_direction_label ?? '—'})` : '—'} />
                    <Row label="Wind Speed"     value={buoyData[buoy.id].wind_speed_ms !== null ? `${Math.round(buoyData[buoy.id].wind_speed_ms! * 3.6)} km/h` : '—'} />
                    <Row label="Wind Gust"      value={buoyData[buoy.id].wind_gust_ms !== null ? `${Math.round(buoyData[buoy.id].wind_gust_ms! * 3.6)} km/h` : '—'} />
                    <Row label="Wave Height"    value={buoyData[buoy.id].wave_height_m !== null ? `${buoyData[buoy.id].wave_height_m} m` : '—'} />
                    <Row label="Wave Period"    value={buoyData[buoy.id].wave_period_s !== null ? `${buoyData[buoy.id].wave_period_s} s` : '—'} />
                    <Row label="Pressure"       value={buoyData[buoy.id].pressure_hpa !== null ? `${buoyData[buoy.id].pressure_hpa} hPa${buoyData[buoy.id].pressure_tendency_hpa !== null ? (buoyData[buoy.id].pressure_tendency_hpa! > 0 ? ' ↑' : ' ↓') : ''}` : '—'} />
                    <Row label="Air Temp"       value={buoyData[buoy.id].air_temp_c !== null ? `${Math.round(buoyData[buoy.id].air_temp_c! * 9 / 5 + 32)}°F` : '—'} />
                    <Row label="Water Temp"     value={buoyData[buoy.id].water_temp_c !== null ? `${Math.round(buoyData[buoy.id].water_temp_c! * 9 / 5 + 32)}°F` : '—'} />
                  </>
                ) : null}
              </View>
            )}
          </View>
        ))}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://www.glerl.noaa.gov/res/glcfs/ncast.php?lake=mih')}
          style={styles.glerlLink}
        >
          <Text style={styles.glerlLinkText}>View Georgian Bay Currents → GLERL</Text>
        </TouchableOpacity>
      </Section>

      {/* 4. Food Chain */}
      <Section title="Food Chain (Satellite)">
        <Text style={styles.foodChainText}>
          {foodChainSummary(conditions.chlorophyll_ug_l, conditions.turbidity_mg_l)}
        </Text>
      </Section>

      {/* 5. Lunar */}
      <Section title="Lunar">
        <Row
          label="Moon Phase"
          value={
            conditions.moon_phase_label
              ? `${moonEmoji(conditions.moon_phase_label)}  ${conditions.moon_phase_label}`
              : '—'
          }
        />
        <Row label="Moonrise" value={dash(conditions.moonrise_time)} />
        <Row label="Moonset"  value={dash(conditions.moonset_time)} />
        <Row label="Sunrise"  value={dash(conditions.sunrise_time)} />
        <Row label="Sunset"   value={dash(conditions.sunset_time)} />
      </Section>

      {/* 6. Feeding Windows */}
      <Section title="Feeding Windows">
        <View style={styles.ratingRow}>
          <Text style={styles.rowLabel}>Day Rating</Text>
          <View style={styles.ratingBars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[styles.ratingBar, i <= ratingBars && styles.ratingBarFilled]}
              />
            ))}
          </View>
        </View>
        <Row
          label="Major 1"
          value={
            conditions.solunar_major_1_start && conditions.solunar_major_1_stop
              ? `${conditions.solunar_major_1_start} – ${conditions.solunar_major_1_stop}`
              : '—'
          }
          bold
        />
        <Row
          label="Major 2"
          value={
            conditions.solunar_major_2_start && conditions.solunar_major_2_stop
              ? `${conditions.solunar_major_2_start} – ${conditions.solunar_major_2_stop}`
              : '—'
          }
          bold
        />
        <Row
          label="Minor 1"
          value={
            conditions.solunar_minor_1_start && conditions.solunar_minor_1_stop
              ? `${conditions.solunar_minor_1_start} – ${conditions.solunar_minor_1_stop}`
              : '—'
          }
        />
        <Row
          label="Minor 2"
          value={
            conditions.solunar_minor_2_start && conditions.solunar_minor_2_stop
              ? `${conditions.solunar_minor_2_start} – ${conditions.solunar_minor_2_stop}`
              : '—'
          }
        />
      </Section>
    </View>
  );
});

export default WeatherWaterCard;

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#122040',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    overflow: 'hidden',
    marginBottom: 12,
  },
  alertBanner: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ff4444',
  },
  alertText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardSubtitle: {
    color: '#8899aa',
    fontSize: 11,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: '#1a2d4a',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionTitle: {
    color: '#1e90ff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowLabel: {
    color: '#8899aa',
    fontSize: 12,
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 8,
  },
  rowValueBold: {
    fontWeight: '700',
    color: '#7dd3fc',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    marginBottom: 4,
  },
  ratingBars: {
    flexDirection: 'row',
    gap: 3,
  },
  ratingBar: {
    width: 14,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#1a2d4a',
    borderWidth: 1,
    borderColor: '#334d6e',
  },
  ratingBarFilled: {
    backgroundColor: '#1e90ff',
    borderColor: '#1e90ff',
  },
  windHistoryHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
    marginBottom: 2,
  },
  windHistoryRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  windHistoryCol: {
    flex: 1,
    color: '#8899aa',
    fontSize: 10,
  },
  windHistoryColTime: {
    flex: 1.2,
  },
  windHistoryVal: {
    color: '#ffffff',
  },
  skeletonBlock: {
    padding: 14,
    gap: 10,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#1a2d4a',
    borderRadius: 4,
  },
  errorText: {
    color: '#8899aa',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  foodChainText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 4,
  },
  buoyTableHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
    marginBottom: 2,
  },
  buoyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  buoyCol: {
    flex: 1,
  },
  buoyColId: {
    flex: 0.7,
  },
  buoyColName: {
    flex: 1.4,
  },
  buoyColLocation: {
    flex: 2,
  },
  buoyHeaderText: {
    color: '#8899aa',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  buoyText: {
    color: '#ffffff',
    fontSize: 11,
  },
  buoyIdLink: {
    color: '#1e90ff',
    fontSize: 11,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  buoyDetail: {
    backgroundColor: '#0d1a2e',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
  },
  buoyDetailLoading: {
    color: '#8899aa',
    fontSize: 12,
    paddingVertical: 6,
    textAlign: 'center',
  },
  glerlLink: {
    marginTop: 8,
    paddingVertical: 4,
  },
  glerlLinkText: {
    color: '#1e90ff',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  retryButton: {
    alignSelf: 'center',
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 14,
  },
  retryText: {
    color: '#1e90ff',
    fontSize: 13,
    fontWeight: '600',
  },
});
