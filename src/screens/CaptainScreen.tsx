import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

import { CatchEvent, GpsData, WeatherData, HydroScore } from '../models/Event';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { insertEvent } from '../storage/localDB';
import { formatEventCode, formatTimestamp } from '../utils/formatters';
import WeatherWaterCard from '../components/WeatherWaterCard';
import { fetchTripConditions, fetchPreyData, TripConditions } from '../services/weatherWaterService';
import { saveTripConditions, getPendingBiteEvents } from '../storage/localDB';

const COUNTER_KEY = 'event_counter';

export default function CaptainScreen() {
  const [tripConditions, setTripConditions] = useState<TripConditions | null>(null);
  const [tripConditionsLoading, setTripConditionsLoading] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [pendingBites, setPendingBites] = useState<CatchEvent[]>([]);
  const [fishOnLoading, setFishOnLoading] = useState(false);
  const [fishOnMessage, setFishOnMessage] = useState<string | null>(null);
  const [showBiteList, setShowBiteList] = useState(false);

  useEffect(() => {
    loadTripConditions();
    loadPendingBites();
  }, []);

  useEffect(() => {
    if (!fishOnMessage) return;
    const t = setTimeout(() => setFishOnMessage(null), 4000);
    return () => clearTimeout(t);
  }, [fishOnMessage]);

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
    fetchedAt: new Date().toISOString(),
  });

  const loadPendingBites = useCallback(async () => {
    const bites = await getPendingBiteEvents();
    setPendingBites(bites);
  }, []);

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
        setup: { downriggerDepth: 0, lureType: '', lureColor: '', lineWeight: '', trollingSpeed: 0, rodReel: '' },
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
      await loadPendingBites();
      setShowBiteList(true);
      setFishOnMessage(`${eventCode} — conditions captured! Mate can now join to add photo.`);
    } catch (error) {
      console.error('[Captain] handleFishOn error:', error);
      setFishOnMessage('Failed to record bite. Try again.');
    } finally {
      setFishOnLoading(false);
    }
  }, [loadPendingBites]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
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

      {pendingBites.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.pendingBitesBar}
            onPress={() => setShowBiteList(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.pendingBitesText}>
              🐟 {pendingBites.length} fish pending photo {showBiteList ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
          {showBiteList && (
            <View style={styles.biteList}>
              {pendingBites.map((b, i) => (
                <Text key={b.id} style={styles.biteListItem}>
                  {i + 1}. {b.eventCode} — hooked {formatTimestamp(b.biteTimestamp || b.timestamp)}
                </Text>
              ))}
            </View>
          )}
        </>
      )}

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
            5. AI identifies species from the mate's photo
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
});
