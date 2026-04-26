import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

import { CatchEvent, FishFinderData, GpsData, GpsMark, MarkType, WeatherData } from '../models/Event';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { insertEvent, updateEvent, insertMark, updateMark } from '../storage/localDB';
import { formatEventCode } from '../utils/formatters';
import WeatherWaterCard from '../components/WeatherWaterCard';
import FishFinderModal from '../components/FishFinderModal';
import { fetchTripConditions, fetchPreyData, TripConditions } from '../services/weatherWaterService';
import { saveTripConditions } from '../storage/localDB';

const COUNTER_KEY = 'event_counter';

export default function CaptainScreen() {
  const [tripConditions, setTripConditions] = useState<TripConditions | null>(null);
  const [tripConditionsLoading, setTripConditionsLoading] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
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
      const lat = 44.88702;
      const lng = -80.066101;
      const date = new Date().toISOString().split('T')[0];
      const conditions = await fetchTripConditions(lat, lng, date);
      setTripConditions(conditions);
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

  const handleFishOn = useCallback(async () => {
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
        setup: { downriggerDepth: 0, lureType: '', lureColor: '', trollingSpeed: 0 },
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
      <WeatherWaterCard
        conditions={tripConditions}
        loading={tripConditionsLoading}
        onRetry={loadTripConditions}
      />

      <TouchableOpacity
        style={[styles.fishOnButton, fishOnLoading && styles.fishOnButtonDisabled]}
        onPress={handleFishOn}
        activeOpacity={0.8}
        disabled={fishOnLoading}
      >
        <Text style={styles.fishOnIcon}>🎣</Text>
        <Text style={styles.fishOnText}>
          {fishOnLoading ? 'Capturing...' : 'FISH ON!'}
        </Text>
        <Text style={styles.fishOnSub}>Tap the moment a fish strikes</Text>
      </TouchableOpacity>

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
            { type: 'bait',      icon: '🦐', label: 'Bait'         },
            { type: 'fish',      icon: '🐟', label: 'Fish'         },
            { type: 'fish_bait', icon: '🎯', label: 'Fish + Bait'  },
            { type: 'structure', icon: '⛰️', label: 'Structure'    },
            { type: 'other',     icon: '📍', label: 'Other'        },
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

      <TouchableOpacity style={styles.infoBox} onPress={() => setHowItWorksOpen((v) => !v)} activeOpacity={0.7}>
        <View style={styles.infoTitleRow}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoChevron}>{howItWorksOpen ? '▲' : '▼'}</Text>
        </View>
        {howItWorksOpen && (
          <Text style={styles.infoText}>
            1. Tap "Fish On!" the moment a fish strikes{'\n'}
            2. GPS, weather, and HydroScore captured instantly{'\n'}
            3. Share the event code with your mate{'\n'}
            4. Mate joins the event, adds photo and rig setup{'\n'}
            5. AI identifies species from the mate's photo{'\n\n'}
            Mark Types:{'\n'}
            🦐 Bait — baitfish activity on sonar or sighted{'\n'}
            🐟 Fish — fish at this position, no bait{'\n'}
            🎯 Fish + Bait — fish and bait on the same mark{'\n'}
            ⛰️ Structure — notable bottom feature (ledge, reef, drop-off){'\n'}
            📍 Other — custom note, e.g. strong current, colour change
          </Text>
        )}
      </TouchableOpacity>
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
  fishOnButton: {
    backgroundColor: '#e65100',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff6d00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
  infoBox: {
    backgroundColor: '#122040',
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    marginTop: 8,
  },
  infoTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoTitle: {
    color: '#1e90ff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoChevron: {
    color: '#1e90ff',
    fontSize: 11,
  },
  infoText: {
    color: '#8899aa',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
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
});
