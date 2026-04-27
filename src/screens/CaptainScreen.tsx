import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

import { CatchEvent, FishFinderData, GpsData, GpsMark, MarkType, WeatherData } from '../models/Event';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { insertEvent, updateEvent, insertMark, updateMark } from '../storage/localDB';
import { formatEventCode, celsiusToFahrenheit } from '../utils/formatters';
import WeatherWaterCard from '../components/WeatherWaterCard';
import FishFinderModal from '../components/FishFinderModal';
import { fetchTripConditions, fetchPreyData, TripConditions } from '../services/weatherWaterService';
import { saveTripConditions } from '../storage/localDB';
import { fetchWaterBodyInfo, WaterBodyInfo } from '../services/waterBodyService';
import { getFMZInfo, FMZInfo } from '../data/ontarioFMZ';

function cToF(c: number | null): string {
  if (c === null) return '—';
  return `${Math.round(celsiusToFahrenheit(c))}°F`;
}

function trendArrow(trend: TripConditions['pressure_trend']): string {
  if (trend === 'rising')  return ' · Rising ↑';
  if (trend === 'falling') return ' · Falling ↓';
  if (trend === 'steady')  return ' · Steady';
  return '';
}

const COUNTER_KEY = 'event_counter';

export default function CaptainScreen() {
  const [tripConditions, setTripConditions] = useState<TripConditions | null>(null);
  const [tripConditionsLoading, setTripConditionsLoading] = useState(false);
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  const [waterBodyInfo, setWaterBodyInfo] = useState<WaterBodyInfo | null>(null);
  const [fmzInfo, setFmzInfo] = useState<FMZInfo | null>(null);
  const [speciesModalVisible, setSpeciesModalVisible] = useState(false);
  const [fishOnLoading, setFishOnLoading] = useState(false);
  const [fishOnMessage, setFishOnMessage] = useState<string | null>(null);
  const [fishFinderEvent, setFishFinderEvent] = useState<CatchEvent | null>(null);
  const [markLoading, setMarkLoading] = useState<MarkType | null>(null);
  const [markMessage, setMarkMessage] = useState<string | null>(null);
  const [otherModalVisible, setOtherModalVisible] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [pendingMarkForScan, setPendingMarkForScan] = useState<GpsMark | null>(null);

  useEffect(() => {
    loadTripConditions();
  }, []);

  useEffect(() => {
    if (!fishOnMessage) return;
    const t = setTimeout(() => setFishOnMessage(null), 4000);
    return () => clearTimeout(t);
  }, [fishOnMessage]);

  useEffect(() => {
    if (!markMessage) return;
    const t = setTimeout(() => setMarkMessage(null), 4000);
    return () => clearTimeout(t);
  }, [markMessage]);

  const loadTripConditions = async () => {
    setTripConditionsLoading(true);
    try {
      const gps = await getCurrentPosition();
      const lat = gps?.lat || 44.88702;
      const lng = gps?.lng || -80.066101;
      const date = new Date().toISOString().split('T')[0];
      const [conditions, waterBody] = await Promise.all([
        fetchTripConditions(lat, lng, date),
        fetchWaterBodyInfo(lat, lng),
      ]);
      setTripConditions(conditions);
      setWaterBodyInfo(waterBody);
      setFmzInfo(getFMZInfo(lat, lng));
      await saveTripConditions(new Date().toISOString(), conditions);
    } catch (err) {
      console.warn('[Captain] loadTripConditions failed:', err);
    } finally {
      setTripConditionsLoading(false);
    }
  };

  const getNextCounter = async (): Promise<number> => {
    const raw = await AsyncStorage.getItem(COUNTER_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = current + 1;
    await AsyncStorage.setItem(COUNTER_KEY, String(next));
    return next;
  };

  const defaultGps = (): GpsData => ({
    lat: 0,
    lng: 0,
    accuracy: 0,
    heading: 0,
    speed: 0,
  });

  const defaultWeather = (): WeatherData => ({
    windSpeed: 0,
    windDirection: 0,
    waveHeight: 0,
    airTemp: 15,
    waterTemp: 13,
    pressure: 1013,
    conditions: 'Unknown',
    cloudCover: 0,
    fetchedAt: new Date().toISOString(),
  });

  const [fishOnSide, setFishOnSide] = useState<'Port' | 'Starboard' | null>(null);

  const handleFishOn = useCallback(async (side: 'Port' | 'Starboard') => {
    setFishOnSide(side);
    setFishOnLoading(true);
    try {
      const [gps, counter] = await Promise.all([
        getCurrentPosition(),
        getNextCounter(),
      ]);
      const gpsData = gps || defaultGps();
      const catchLat = gpsData.lat || 44.88702;
      const catchLng = gpsData.lng || -80.066101;

      const [weather, windHistory, pressureHistory, prey] = await Promise.all([
        fetchWeatherData(catchLat, catchLng),
        fetchWindHistory(catchLat, catchLng),
        fetchPressureHistory(catchLat, catchLng),
        fetchPreyData(catchLat, catchLng),
      ]);

      const weatherData = weather || defaultWeather();
      const hydroScore = computeHydroScore({
        windSpeed: weatherData.windSpeed,
        windDirection: weatherData.windDirection,
        waveHeight: weatherData.waveHeight,
        airTemp: weatherData.airTemp,
        waterTemp: weatherData.waterTemp,
        pressure: weatherData.pressure,
        lat: gpsData.lat,
        lng: gpsData.lng,
        chlorophyll: prey.chlorophyll,
        turbidity: prey.turbidity,
        windHistory,
        pressureHistory,
      });

      const eventCode = formatEventCode(counter);
      const now = new Date().toISOString();

      const event: CatchEvent = {
        id: uuid.v4() as string,
        eventCode,
        timestamp: now,
        status: 'bite',
        biteTimestamp: now,
        photo: '',
        gps: gpsData,
        weather: weatherData,
        setup: { downriggerDepth: 0, lureType: '', lureColor: '', trollingSpeed: 0, boatSide: side },
        voiceNote: { audioPath: '', transcript: '', duration: 0 },
        hydroScore,
        species: '',
        confidence: 0,
        sizeEstimate: '',
        notes: '',
        weightLbsEstimate: null,
        synced: false,
      };

      await insertEvent(event);
      setFishFinderEvent(event);
    } catch (error) {
      console.error('[Captain] handleFishOn error:', error);
      setFishOnMessage('Failed to record bite. Try again.');
    } finally {
      setFishOnLoading(false);
      setFishOnSide(null);
    }
  }, []);

  const handleFishFinderSave = useCallback(async (data: FishFinderData) => {
    if (!fishFinderEvent) return;
    try {
      const updated: CatchEvent = { ...fishFinderEvent, fishFinder: data };
      await updateEvent(updated);
    } catch (err) {
      console.error('[Captain] handleFishFinderSave error:', err);
    } finally {
      setFishFinderEvent(null);
      setFishOnMessage(`${fishFinderEvent.eventCode} — conditions captured! Mate can now join to add photo.`);
    }
  }, [fishFinderEvent]);

  const handleFishFinderSkip = useCallback(() => {
    const code = fishFinderEvent?.eventCode ?? '';
    setFishFinderEvent(null);
    setFishOnMessage(`${code} — conditions captured! Mate can now join to add photo.`);
  }, [fishFinderEvent]);

  const handleMark = useCallback(async (type: MarkType, notes?: string) => {
    setMarkLoading(type);
    try {
      const gps = await getCurrentPosition();
      const gpsData = gps || defaultGps();
      const catchLat = gpsData.lat || 44.88702;
      const catchLng = gpsData.lng || -80.066101;

      // Weather + HydroScore are best-effort — a failed API call never blocks the mark
      let weatherData = defaultWeather();
      let hydroScore = computeHydroScore({
        windSpeed: 0, windDirection: 0, waveHeight: 0,
        airTemp: 15, waterTemp: 13, pressure: 1013,
        lat: catchLat, lng: catchLng,
        chlorophyll: null, turbidity: null,
        windHistory: [], pressureHistory: [],
      });

      try {
        const [weather, windHistory, pressureHistory, prey] = await Promise.all([
          fetchWeatherData(catchLat, catchLng),
          fetchWindHistory(catchLat, catchLng),
          fetchPressureHistory(catchLat, catchLng),
          fetchPreyData(catchLat, catchLng),
        ]);
        weatherData = weather || defaultWeather();
        hydroScore = computeHydroScore({
          windSpeed: weatherData.windSpeed,
          windDirection: weatherData.windDirection,
          waveHeight: weatherData.waveHeight,
          airTemp: weatherData.airTemp,
          waterTemp: weatherData.waterTemp,
          pressure: weatherData.pressure,
          lat: gpsData.lat,
          lng: gpsData.lng,
          chlorophyll: prey?.chlorophyll ?? null,
          turbidity: prey?.turbidity ?? null,
          windHistory: windHistory ?? [],
          pressureHistory: pressureHistory ?? [],
        });
      } catch (weatherErr) {
        console.warn('[Captain] handleMark weather fetch failed, using defaults:', weatherErr);
      }

      const mark: GpsMark = {
        id: uuid.v4() as string,
        markType: type,
        notes,
        timestamp: new Date().toISOString(),
        gps: gpsData,
        weather: weatherData,
        hydroScore,
        synced: false,
      };

      await insertMark(mark);
      setPendingMarkForScan(mark);
    } catch (err) {
      console.error('[Captain] handleMark error:', err);
      setMarkMessage('Mark failed. Try again.');
    } finally {
      setMarkLoading(null);
    }
  }, []);

  const handleOtherConfirm = useCallback(() => {
    setOtherModalVisible(false);
    handleMark('other', otherNote.trim() || undefined);
    setOtherNote('');
  }, [otherNote, handleMark]);

  const MARK_LABELS: Record<MarkType, string> = {
    bait: 'Bait marked',
    fish: 'Fish marked',
    fish_bait: 'Fish + Bait marked',
    structure: 'Structure marked',
    other: 'Location marked',
  };

  const handleMarkFinderSave = useCallback(async (data: FishFinderData) => {
    if (!pendingMarkForScan) return;
    try {
      await updateMark({ ...pendingMarkForScan, fishFinder: data });
    } catch (err) {
      console.warn('[Captain] handleMarkFinderSave error:', err);
    } finally {
      setMarkMessage(`${MARK_LABELS[pendingMarkForScan.markType]} — fish finder captured`);
      setPendingMarkForScan(null);
    }
  }, [pendingMarkForScan]);

  const handleMarkFinderSkip = useCallback(() => {
    if (!pendingMarkForScan) return;
    setMarkMessage(`${MARK_LABELS[pendingMarkForScan.markType]} — conditions captured`);
    setPendingMarkForScan(null);
  }, [pendingMarkForScan]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {fishFinderEvent && (
        <FishFinderModal
          visible={true}
          event={fishFinderEvent}
          onSave={handleFishFinderSave}
          onSkip={handleFishFinderSkip}
        />
      )}
      {pendingMarkForScan && (
        <FishFinderModal
          visible={true}
          event={pendingMarkForScan}
          onSave={handleMarkFinderSave}
          onSkip={handleMarkFinderSkip}
        />
      )}

      {/* ── Marine Warning — always visible when active ── */}
      {tripConditions?.marine_warning_active && (
        <View style={styles.marineAlert}>
          <Text style={styles.marineAlertText}>
            ⚠  {tripConditions.marine_warning_text ?? 'Marine Warning Active'}
          </Text>
        </View>
      )}

      {/* ── Fish On! ── */}
      <View style={styles.fishOnRow}>
        <TouchableOpacity
          style={[styles.fishOnButton, styles.fishOnPort, fishOnLoading && styles.fishOnButtonDisabled]}
          onPress={() => handleFishOn('Port')}
          activeOpacity={0.8}
          disabled={fishOnLoading}
        >
          <Text style={styles.fishOnIcon}>🎣</Text>
          <Text style={styles.fishOnText}>
            {fishOnLoading && fishOnSide === 'Port' ? 'Capturing...' : 'PORT'}
          </Text>
          <Text style={styles.fishOnSub}>Fish On!</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fishOnButton, styles.fishOnStarboard, fishOnLoading && styles.fishOnButtonDisabled]}
          onPress={() => handleFishOn('Starboard')}
          activeOpacity={0.8}
          disabled={fishOnLoading}
        >
          <Text style={styles.fishOnIcon}>🎣</Text>
          <Text style={styles.fishOnText}>
            {fishOnLoading && fishOnSide === 'Starboard' ? 'Capturing...' : 'STARBOARD'}
          </Text>
          <Text style={styles.fishOnSub}>Fish On!</Text>
        </TouchableOpacity>
      </View>

      {fishOnMessage && (
        <TouchableOpacity style={styles.fishOnBanner} onPress={() => setFishOnMessage(null)} activeOpacity={0.8}>
          <Text style={styles.fishOnBannerText}>🎣 {fishOnMessage}</Text>
        </TouchableOpacity>
      )}

      {/* ── Mark Location ── */}
      <View style={styles.markSection}>
        <Text style={styles.markSectionTitle}>Mark Location</Text>
        <View style={styles.markGrid}>
          {([
            { type: 'bait',      icon: '🦐', label: 'Bait'        },
            { type: 'fish',      icon: '🐟', label: 'Fish'        },
            { type: 'fish_bait', icon: '🎯', label: 'Fish + Bait' },
            { type: 'structure', icon: '⛰️', label: 'Structure'   },
            { type: 'other',     icon: '📍', label: 'Other'       },
          ] as { type: MarkType; icon: string; label: string }[]).map(({ type, icon, label }) => (
            <TouchableOpacity
              key={type}
              style={[styles.markButton, markLoading === type && styles.markButtonDisabled]}
              onPress={() => type === 'other' ? setOtherModalVisible(true) : handleMark(type)}
              disabled={markLoading !== null}
              activeOpacity={0.75}
            >
              <Text style={styles.markIcon}>{markLoading === type ? '⏳' : icon}</Text>
              <Text style={styles.markLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {markMessage && (
        <TouchableOpacity style={styles.markBanner} onPress={() => setMarkMessage(null)} activeOpacity={0.8}>
          <Text style={styles.markBannerText}>📍 {markMessage}</Text>
        </TouchableOpacity>
      )}

      {/* ── Conditions strip — collapsed by default ── */}
      <TouchableOpacity
        style={styles.conditionsStrip}
        onPress={() => setConditionsExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        <View style={styles.conditionsStripLeft}>
          <View style={styles.conditionsStripHeader}>
            <Text style={styles.conditionsStripLabel}>
              {'Conditions'}
              {waterBodyInfo?.name ? (
                <Text style={styles.conditionsWaterName}>{`  ·  ${waterBodyInfo.name}`}</Text>
              ) : null}
            </Text>
            <Text style={styles.conditionsChevron}>{conditionsExpanded ? '▲' : '▼'}</Text>
          </View>
          {tripConditionsLoading ? (
            <Text style={styles.conditionsStripData}>Loading...</Text>
          ) : tripConditions ? (
            <View style={styles.conditionsGrid}>
              <View style={styles.conditionsStat}>
                <Text style={styles.conditionsStatLabel}>Pressure</Text>
                <Text style={styles.conditionsStatValue}>
                  {tripConditions.barometric_pressure_hpa !== null
                    ? `${Math.round(tripConditions.barometric_pressure_hpa)} hPa${trendArrow(tripConditions.pressure_trend)}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.conditionsStat}>
                <Text style={styles.conditionsStatLabel}>Wind</Text>
                <Text style={styles.conditionsStatValue}>
                  {tripConditions.wind_speed_mph !== null
                    ? `${Math.round(tripConditions.wind_speed_mph * 1.60934)} km/h ${tripConditions.wind_direction_label ?? ''}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.conditionsStat}>
                <Text style={styles.conditionsStatLabel}>Cloud Cover</Text>
                <Text style={styles.conditionsStatValue}>
                  {tripConditions.cloud_cover_pct !== null ? `${tripConditions.cloud_cover_pct}%` : '—'}
                </Text>
              </View>
              <View style={styles.conditionsStat}>
                <Text style={styles.conditionsStatLabel}>Precipitation</Text>
                <Text style={styles.conditionsStatValue}>
                  {tripConditions.precipitation_mm !== null && tripConditions.precipitation_mm > 0
                    ? `${tripConditions.precipitation_mm} mm`
                    : 'None'}
                </Text>
              </View>
              {waterBodyInfo?.waterLevel_m !== null && waterBodyInfo?.waterLevel_m !== undefined && (
                <View style={styles.conditionsStat}>
                  <Text style={styles.conditionsStatLabel}>River Level</Text>
                  <Text style={styles.conditionsStatValue}>{`${waterBodyInfo.waterLevel_m} m`}</Text>
                </View>
              )}
              {waterBodyInfo?.flow_cms !== null && waterBodyInfo?.flow_cms !== undefined && (
                <View style={styles.conditionsStat}>
                  <Text style={styles.conditionsStatLabel}>Flow Rate</Text>
                  <Text style={styles.conditionsStatValue}>{`${waterBodyInfo.flow_cms} m³/s`}</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.conditionsStripData}>Tap to view full conditions</Text>
          )}
        </View>
      </TouchableOpacity>

      {conditionsExpanded && (
        <WeatherWaterCard
          conditions={tripConditions}
          loading={tripConditionsLoading}
          onRetry={loadTripConditions}
        />
      )}

      {/* ── Ontario Fishing Regulations ── */}
      {fmzInfo && (
        <View style={styles.regsCard}>
          <View style={styles.regsHeader}>
            <Text style={styles.regsTitle}>{`FMZ ${fmzInfo.zone}  ·  ${fmzInfo.name}`}</Text>
            <Text style={styles.regsSource}>2024–25</Text>
          </View>
          {fmzInfo.rules.length > 0 ? (
            <>
              <View style={styles.regsTableHeader}>
                <Text style={[styles.regsCol, styles.regsColSpecies]}>Species</Text>
                <Text style={styles.regsCol}>Season</Text>
                <Text style={styles.regsColRight}>Limit</Text>
              </View>
              {fmzInfo.rules.map((rule, i) => (
                <View key={i} style={[styles.regsRow, i % 2 === 1 && styles.regsRowAlt]}>
                  <Text style={[styles.regsCol, styles.regsColSpecies, styles.regsSpeciesText]}>
                    {rule.species}
                  </Text>
                  <Text style={[styles.regsCol, styles.regsValueText]}>
                    {rule.season}
                  </Text>
                  <Text style={[styles.regsColRight, styles.regsValueText]}>
                    {rule.minSize ? `${rule.limit}  ·  ${rule.minSize} min` : rule.limit}
                  </Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => Linking.openURL('https://www.lioapplications.lrc.gov.on.ca/fishonline/Index.html?viewer=FishONLine.FishONLine&locale=en-CA&extent=-8875090.797843656%252C5523795.476836009%252C-8871718.013970578%252C5528821.2114457525')}>
                <Text style={styles.regsDisclaimer}>Verify at Fish ON-Line before your trip →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => Linking.openURL('https://www.lioapplications.lrc.gov.on.ca/fishonline/Index.html?viewer=FishONLine.FishONLine&locale=en-CA&extent=-8875090.797843656%252C5523795.476836009%252C-8871718.013970578%252C5528821.2114457525')}>
              <Text style={styles.regsDisclaimer}>
                {`No inline data for FMZ ${fmzInfo.zone}. Check Fish ON-Line →`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Species in this area button ── */}
      {fmzInfo && fmzInfo.rules.length > 0 && (
        <TouchableOpacity
          style={styles.speciesButton}
          onPress={() => setSpeciesModalVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.speciesButtonText}>🐟  Species in this area</Text>
        </TouchableOpacity>
      )}

      {/* ── Species modal ── */}
      <Modal
        visible={speciesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSpeciesModalVisible(false)}
      >
        <View style={styles.speciesOverlay}>
          <View style={styles.speciesBox}>
            <Text style={styles.speciesTitle}>
              {fmzInfo ? `FMZ ${fmzInfo.zone} — ${fmzInfo.name}` : 'Species'}
            </Text>
            <Text style={styles.speciesSubtitle}>Species regulated in this zone</Text>
            {fmzInfo?.rules.map((rule, i) => (
              <View key={i} style={styles.speciesRow}>
                <Text style={styles.speciesBullet}>🐟</Text>
                <Text style={styles.speciesName}>{rule.species}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.speciesClose}
              onPress={() => setSpeciesModalVisible(false)}
            >
              <Text style={styles.speciesCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Other note modal ── */}
      <Modal visible={otherModalVisible} transparent animationType="fade" onRequestClose={() => setOtherModalVisible(false)}>
        <View style={styles.otherOverlay}>
          <View style={styles.otherBox}>
            <Text style={styles.otherTitle}>What are you marking?</Text>
            <TextInput
              style={styles.otherInput}
              value={otherNote}
              onChangeText={setOtherNote}
              placeholder="e.g. Tide rip, colour change..."
              placeholderTextColor="#4a5f7a"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleOtherConfirm}
            />
            <View style={styles.otherButtons}>
              <TouchableOpacity style={styles.otherCancel} onPress={() => setOtherModalVisible(false)}>
                <Text style={styles.otherCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.otherConfirm} onPress={handleOtherConfirm}>
                <Text style={styles.otherConfirmText}>Mark</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  fishOnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  fishOnButton: {
    flex: 1,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fishOnPort: {
    backgroundColor: '#c62828',
    shadowColor: '#ff1744',
  },
  fishOnStarboard: {
    backgroundColor: '#1b5e20',
    shadowColor: '#00e676',
  },
  fishOnButtonDisabled: {
    opacity: 0.6,
  },
  fishOnIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  fishOnText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  fishOnSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
  },
  fishOnBanner: {
    backgroundColor: '#1b3a1b',
    marginHorizontal: 24,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#00c853',
  },
  fishOnBannerText: {
    color: '#00e676',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  pendingBitesBar: {
    backgroundColor: '#1a2a10',
    marginHorizontal: 24,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  pendingBitesText: {
    color: '#69f0ae',
    fontSize: 13,
    textAlign: 'center',
  },
  biteList: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: '#111e10',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2e5a2e',
  },
  biteListItem: {
    color: '#a5d6a7',
    fontSize: 12,
    paddingVertical: 3,
  },
  marineAlert: {
    backgroundColor: '#7f1d1d',
    marginHorizontal: 0,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  marineAlertText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  conditionsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#122040',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  conditionsStripLeft: {
    flex: 1,
  },
  conditionsStripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  conditionsStripLabel: {
    color: '#1e90ff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flex: 1,
  },
  conditionsWaterName: {
    color: '#c0d0e0',
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0,
  },
  conditionsStripData: {
    color: '#8899aa',
    fontSize: 13,
  },
  conditionsChevron: {
    color: '#1e90ff',
    fontSize: 12,
  },
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  conditionsStat: {
    width: '47%',
  },
  conditionsStatLabel: {
    color: '#8899aa',
    fontSize: 11,
    marginBottom: 2,
  },
  conditionsStatValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  markSection: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 4,
  },
  markSectionTitle: {
    color: '#8899aa',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  markButton: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: '#122040',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  markButtonDisabled: {
    opacity: 0.5,
  },
  markIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  markLabel: {
    color: '#c0d0e0',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  markBanner: {
    backgroundColor: '#1a2a3a',
    marginHorizontal: 24,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e90ff',
  },
  markBannerText: {
    color: '#7ec8ff',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  regsCard: {
    backgroundColor: '#122040',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    marginTop: 8,
    overflow: 'hidden',
  },
  regsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  regsTitle: {
    color: '#1e90ff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  regsSource: {
    color: '#4a6080',
    fontSize: 11,
  },
  regsTableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  regsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  regsRowAlt: {
    backgroundColor: '#0f1c33',
  },
  regsCol: {
    flex: 1,
    color: '#8899aa',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  regsColSpecies: {
    flex: 1.2,
  },
  regsColRight: {
    flex: 1.4,
    textAlign: 'right',
    color: '#8899aa',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  regsSpeciesText: {
    color: '#c0d0e0',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
  },
  regsValueText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
  },
  regsDisclaimer: {
    color: '#1e90ff',
    fontSize: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
  otherOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  otherBox: {
    backgroundColor: '#122040',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  otherTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  otherInput: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 15,
    padding: 12,
    marginBottom: 16,
  },
  otherButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  otherCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  otherCancelText: {
    color: '#8899aa',
    fontSize: 15,
    fontWeight: '600',
  },
  otherConfirm: {
    flex: 1,
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  otherConfirmText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  speciesButton: {
    backgroundColor: '#0f2a1a',
    borderWidth: 1,
    borderColor: '#00c853',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  speciesButtonText: {
    color: '#00e676',
    fontSize: 15,
    fontWeight: '700',
  },
  speciesOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  speciesBox: {
    backgroundColor: '#122040',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  speciesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  speciesSubtitle: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  speciesBullet: {
    fontSize: 16,
    marginRight: 10,
  },
  speciesName: {
    color: '#c0d0e0',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  speciesClose: {
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  speciesCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
