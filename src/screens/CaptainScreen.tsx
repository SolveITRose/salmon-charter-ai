import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

import { CatchEvent, GpsData, WeatherData, HydroScore } from '../models/Event';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { computeHydroScore, defaultHydroScore } from '../agents/hydrodynamicAgent';
import { classifyCatch } from '../agents/catchClassifier';
import { insertEvent } from '../storage/localDB';
import { saveEventPhoto, saveEventSnapshot } from '../storage/eventStore';
import { syncAllPending } from '../services/syncService';
import { formatEventCode, formatTimestamp, formatGPS } from '../utils/formatters';
import { getScoreColor, getScoreLabel } from '../utils/scoring';
import WeatherWidget from '../components/WeatherWidget';
import HydroScoreCard from '../components/HydroScoreCard';
import { fetchTripConditions, fetchPreyData, TripConditions } from '../services/weatherWaterService';
import { saveTripConditions, updateEvent, getPendingBiteEvents } from '../storage/localDB';
import WeatherWaterCard from '../components/WeatherWaterCard';

const COUNTER_KEY = 'event_counter';

type ScreenState = 'home' | 'preview' | 'processing' | 'result';

export default function CaptainScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('home');
  const [currentEvent, setCurrentEvent] = useState<CatchEvent | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState('');
  const [tripConditions, setTripConditions] = useState<TripConditions | null>(null);
  const [tripConditionsLoading, setTripConditionsLoading] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [pendingBites, setPendingBites] = useState<CatchEvent[]>([]);
  const [fishOnLoading, setFishOnLoading] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    loadTripConditions();
    loadPendingBites();
  }, []);

  const loadTripConditions = async () => {
    setTripConditionsLoading(true);
    try {
      // Default to southern Georgian Bay — GPS not needed for conditions display
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

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setPendingPhotoUri(null);
    setScreenState('home');
    setProcessingStep('');
  }, []);

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
      Alert.alert('Fish On! 🎣', 'Bite marked! Add photo when ready.');
    } catch (error) {
      console.error('[Captain] handleFishOn error:', error);
      Alert.alert('Error', 'Failed to record bite. Try again.');
    } finally {
      setFishOnLoading(false);
    }
  }, [loadPendingBites]);

  const handleLogCatch = useCallback(async () => {
    try {
      const launch = Platform.OS === 'web'
        ? ImagePicker.launchImageLibraryAsync
        : ImagePicker.launchCameraAsync;
      const pickerResult = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        return;
      }

      setPendingPhotoUri(pickerResult.assets[0].uri);
      setScreenState('preview');
    } catch (error) {
      console.error('[Captain] handleLogCatch error:', error);
    }
  }, []);

  const handleRetake = useCallback(async () => {
    setPendingPhotoUri(null);
    setScreenState('home');
    // Re-launch camera immediately
    try {
      const launch = Platform.OS === 'web'
        ? ImagePicker.launchImageLibraryAsync
        : ImagePicker.launchCameraAsync;
      const pickerResult = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        return;
      }

      setPendingPhotoUri(pickerResult.assets[0].uri);
      setScreenState('preview');
    } catch (error) {
      console.error('[Captain] handleRetake error:', error);
    }
  }, []);

  const processLinkedCatch = useCallback(async (photoUri: string, biteEvent: CatchEvent) => {
    cancelledRef.current = false;
    setScreenState('processing');
    setProcessingStep('Identifying species...');
    try {
      const savedPhotoPath = await saveEventPhoto(biteEvent.eventCode, photoUri);

      const classifyWithTimeout = Promise.race([
        classifyCatch(savedPhotoPath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 30000)
        ),
      ]);

      let classification;
      try {
        classification = await classifyWithTimeout;
      } catch {
        classification = {
          species: 'Unknown',
          confidence: 0,
          sizeEstimate: 'Unknown',
          notes: 'AI identification timed out — please identify manually.',
          lengthCm: null,
          girthCm: null,
          weightLbsEstimate: null,
        };
      }

      if (cancelledRef.current) return;
      setProcessingStep('Saving event...');

      const updatedEvent: CatchEvent = {
        ...biteEvent,
        photo: savedPhotoPath,
        status: 'landed',
        species: classification.species,
        confidence: classification.confidence,
        sizeEstimate: classification.sizeEstimate,
        notes: classification.notes,
        weightLbsEstimate: classification.weightLbsEstimate,
      };

      await updateEvent(updatedEvent);
      await saveEventSnapshot(updatedEvent);
      setCurrentEvent(updatedEvent);
      setScreenState('result');
      await loadPendingBites();
      syncAllPending().catch(console.error);
    } catch (error) {
      console.error('[Captain] processLinkedCatch error:', error);
      setScreenState('home');
      Alert.alert('Error', 'Failed to log catch. Please try again.', [{ text: 'OK' }]);
    }
  }, [loadPendingBites]);

  const processNewCatch = useCallback(async (photoUri: string) => {
    cancelledRef.current = false;
    setScreenState('processing');
    setProcessingStep('Capturing location...');
    try {
      const [gps, counter] = await Promise.all([
        getCurrentPosition(),
        getNextCounter(),
      ]);

      if (cancelledRef.current) return;
      const gpsData = gps || defaultGps();
      const eventCode = formatEventCode(counter);

      setProcessingStep('Fetching weather data...');

      const catchLat = gpsData.lat || 44.88702;
      const catchLng = gpsData.lng || -80.066101;
      const [weather, windHistory, pressureHistory, prey] = await Promise.all([
        fetchWeatherData(catchLat, catchLng),
        fetchWindHistory(catchLat, catchLng),
        fetchPressureHistory(catchLat, catchLng),
        fetchPreyData(catchLat, catchLng),
      ]);

      if (cancelledRef.current) return;
      const weatherData = weather || defaultWeather();

      setProcessingStep('Computing HydroScore...');

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

      setProcessingStep('Identifying species...');

      const savedPhotoPath = await saveEventPhoto(eventCode, photoUri);

      const classifyWithTimeout = Promise.race([
        classifyCatch(savedPhotoPath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 30000)
        ),
      ]);

      let classification;
      try {
        classification = await classifyWithTimeout;
      } catch {
        classification = {
          species: 'Unknown',
          confidence: 0,
          sizeEstimate: 'Unknown',
          notes: 'AI identification timed out — please identify manually.',
          lengthCm: null,
          girthCm: null,
          weightLbsEstimate: null,
        };
      }

      if (cancelledRef.current) return;
      setProcessingStep('Saving event...');

      const event: CatchEvent = {
        id: uuid.v4() as string,
        eventCode,
        timestamp: new Date().toISOString(),
        status: 'landed',
        photo: savedPhotoPath,
        gps: gpsData,
        weather: weatherData,
        setup: { downriggerDepth: 0, lureType: '', lureColor: '', lineWeight: '', trollingSpeed: 0, rodReel: '' },
        voiceNote: { audioPath: '', transcript: '', duration: 0 },
        hydroScore,
        species: classification.species,
        confidence: classification.confidence,
        sizeEstimate: classification.sizeEstimate,
        notes: classification.notes,
        weightLbsEstimate: classification.weightLbsEstimate,
        synced: false,
      };

      await insertEvent(event);
      await saveEventSnapshot(event);
      setCurrentEvent(event);
      setScreenState('result');
      syncAllPending().catch(console.error);
    } catch (error) {
      console.error('[Captain] processNewCatch error:', error);
      setScreenState('home');
      Alert.alert('Error', 'Failed to log catch. Please try again.', [{ text: 'OK' }]);
    }
  }, []);

  const handleUsePhoto = useCallback(async () => {
    if (!pendingPhotoUri) return;
    const photoUri = pendingPhotoUri;

    if (pendingBites.length > 0) {
      const bite = pendingBites[0];
      const biteTime = formatTimestamp(bite.biteTimestamp || bite.timestamp);
      Alert.alert(
        'Link to Fish On event?',
        `Hooked: ${biteTime}\nCode: ${bite.eventCode}`,
        [
          { text: 'Link to this bite', onPress: () => processLinkedCatch(photoUri, bite) },
          { text: 'New event', style: 'cancel', onPress: () => processNewCatch(photoUri) },
        ]
      );
      return;
    }

    processNewCatch(photoUri);
  }, [pendingPhotoUri, pendingBites, processLinkedCatch, processNewCatch]);

  const handleShareCode = useCallback(async () => {
    if (!currentEvent) return;
    try {
      await Share.share({
        message: `Join my Georgian Bay salmon catch event!\nCode: ${currentEvent.eventCode}\nSpecies: ${currentEvent.species}\nTime: ${formatTimestamp(currentEvent.timestamp)}`,
        title: 'Fishing Reports AI — Catch Event',
      });
    } catch (error) {
      console.error('[Captain] handleShareCode error:', error);
    }
  }, [currentEvent]);

  const handleCopyCode = useCallback(async () => {
    if (!currentEvent) return;
    try {
      // Use Share as universal copy mechanism (Clipboard API varies by RN version)
      await Share.share({ message: currentEvent.eventCode });
    } catch {
      // Fallback: show code in alert for manual copy
      Alert.alert(
        'Event Code',
        currentEvent.eventCode,
        [{ text: 'OK' }]
      );
    }
  }, [currentEvent]);

  const handleNewCatch = useCallback(() => {
    setCurrentEvent(null);
    setScreenState('home');
    setProcessingStep('');
    loadPendingBites();
  }, [loadPendingBites]);

  // ─── Render: Home ──────────────────────────────────────────────────────────
  if (screenState === 'home') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Conditions Card */}
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

        {pendingBites.length > 0 && (
          <TouchableOpacity
            style={styles.pendingBitesBar}
            onPress={() => {
              const lines = pendingBites
                .map((b, i) => `${i + 1}. ${b.eventCode} — hooked ${formatTimestamp(b.biteTimestamp || b.timestamp)}`)
                .join('\n');
              Alert.alert(`${pendingBites.length} fish pending photo`, lines);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.pendingBitesText}>
              🐟 {pendingBites.length} fish pending photo — tap for details
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.logCatchButton}
          onPress={handleLogCatch}
          activeOpacity={0.8}
        >
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.logCatchText}>Log Catch</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoBox} onPress={() => setHowItWorksOpen((v) => !v)} activeOpacity={0.7}>
          <View style={styles.infoTitleRow}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoChevron}>{howItWorksOpen ? '▲' : '▼'}</Text>
          </View>
          {howItWorksOpen && (
            <Text style={styles.infoText}>
              1. Tap "Log Catch" and photograph the fish{'\n'}
              2. AI identifies species automatically{'\n'}
              3. GPS, weather, and HydroScore captured{'\n'}
              4. Share event code with your mate{'\n'}
              5. Mate enters setup details from their device
            </Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    );
  }

  // ─── Render: Preview ──────────────────────────────────────────────────────
  if (screenState === 'preview' && pendingPhotoUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: pendingPhotoUri }} style={styles.previewImage} resizeMode="contain" />
        <View style={styles.previewActions}>
          <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.usePhotoButton} onPress={handleUsePhoto}>
            <Text style={styles.usePhotoButtonText}>Use Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Render: Processing ────────────────────────────────────────────────────
  if (screenState === 'processing') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.processingText}>{processingStep}</Text>
        <Text style={styles.processingSubText}>
          Logging catch with full environmental data...
        </Text>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render: Result ────────────────────────────────────────────────────────
  if (screenState === 'result' && currentEvent) {
    const scoreColor = getScoreColor(currentEvent.hydroScore.total);
    const scoreLabel = getScoreLabel(currentEvent.hydroScore.total);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Code Banner */}
        <View style={styles.codeBanner}>
          <Text style={styles.codeLabel}>Event Code</Text>
          <TouchableOpacity onPress={handleCopyCode} activeOpacity={0.7}>
            <Text style={styles.codeValue}>{currentEvent.eventCode}</Text>
            <Text style={styles.codeTapHint}>Tap to copy</Text>
          </TouchableOpacity>
        </View>

        {/* Species Result */}
        <View style={styles.speciesCard}>
          <View style={styles.speciesRow}>
            <Text style={styles.speciesName}>
              {currentEvent.species || 'Unknown Species'}
            </Text>
            <View
              style={[
                styles.confBadge,
                {
                  backgroundColor:
                    currentEvent.confidence >= 0.8
                      ? '#00c85322'
                      : '#ffab0022',
                  borderColor:
                    currentEvent.confidence >= 0.8 ? '#00c853' : '#ffab00',
                },
              ]}
            >
              <Text
                style={[
                  styles.confText,
                  {
                    color:
                      currentEvent.confidence >= 0.8 ? '#00c853' : '#ffab00',
                  },
                ]}
              >
                {Math.round(currentEvent.confidence * 100)}% confidence
              </Text>
            </View>
          </View>
          {currentEvent.sizeEstimate &&
            currentEvent.sizeEstimate !== 'Unknown' && (
              <Text style={styles.sizeText}>{currentEvent.sizeEstimate}</Text>
            )}
          {currentEvent.weightLbsEstimate !== null && currentEvent.weightLbsEstimate !== undefined && (
            <View style={styles.weightBadge}>
              <Text style={styles.weightLabel}>AI-Gen Weight</Text>
              <Text style={styles.weightValue}>{currentEvent.weightLbsEstimate} lbs (est.)</Text>
            </View>
          )}
          {currentEvent.notes ? (
            <Text style={styles.notesText}>{currentEvent.notes}</Text>
          ) : null}
          <Text style={styles.timestampText}>
            {formatTimestamp(currentEvent.timestamp)}
          </Text>
          {currentEvent.gps.lat !== 0 && (
            <Text style={styles.gpsText}>
              {formatGPS(currentEvent.gps.lat, currentEvent.gps.lng)}
            </Text>
          )}
        </View>

        {/* Weather Summary */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Conditions</Text>
          <WeatherWidget weather={currentEvent.weather} />
        </View>

        {/* HydroScore */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>HydroScore</Text>
          <HydroScoreCard hydroScore={currentEvent.hydroScore} />
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShareCode}
          >
            <Text style={styles.shareButtonText}>Share Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newCatchButton}
            onPress={handleNewCatch}
          >
            <Text style={styles.newCatchButtonText}>New Catch</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#8899aa',
    fontSize: 16,
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
  pendingBitesBar: {
    backgroundColor: '#1a2a10',
    marginHorizontal: 24,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  pendingBitesText: {
    color: '#69f0ae',
    fontSize: 13,
    textAlign: 'center',
  },
  logCatchButton: {
    backgroundColor: '#1e90ff',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#1e90ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cameraIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  logCatchText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  logCatchSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  infoBox: {
    backgroundColor: '#122040',
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a2d4a',
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
  conditionsCard: {
    backgroundColor: '#0a1628',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  conditionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conditionsTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  conditionsRefresh: {
    color: '#1e90ff',
    fontSize: 20,
    fontWeight: '400',
  },
  conditionsStation: {
    color: '#8899aa',
    fontSize: 11,
    marginBottom: 12,
  },
  conditionsTable: {
    gap: 0,
  },
  conditionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  conditionsLabel: {
    color: '#8899aa',
    fontSize: 13,
  },
  conditionsValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  conditionsError: {
    color: '#8899aa',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  forecastLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1e3a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a3a5a',
  },
  forecastLinkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  forecastLinkText: {
    flex: 1,
  },
  forecastLinkTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  forecastLinkSub: {
    color: '#8899aa',
    fontSize: 12,
    marginTop: 2,
  },
  forecastLinkArrow: {
    color: '#1e90ff',
    fontSize: 22,
    fontWeight: '300',
  },
  processingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  processingSubText: {
    color: '#8899aa',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000000',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#0a1628',
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8899aa',
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#8899aa',
    fontSize: 16,
    fontWeight: '600',
  },
  usePhotoButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1e90ff',
    alignItems: 'center',
  },
  usePhotoButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8899aa',
  },
  cancelButtonText: {
    color: '#8899aa',
    fontSize: 15,
    fontWeight: '600',
  },
  codeBanner: {
    backgroundColor: '#1a3a6a',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#1e90ff',
  },
  codeLabel: {
    color: '#8899aa',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeValue: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  codeTapHint: {
    color: '#1e90ff',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  speciesCard: {
    backgroundColor: '#122040',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  speciesName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  confBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sizeText: {
    color: '#8899aa',
    fontSize: 14,
    marginBottom: 4,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a2a1a',
    borderWidth: 1,
    borderColor: '#00c853',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  weightLabel: {
    color: '#00c853',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weightValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notesText: {
    color: '#c0d0e0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  timestampText: {
    color: '#8899aa',
    fontSize: 12,
    marginTop: 4,
  },
  gpsText: {
    color: '#8899aa',
    fontSize: 12,
    marginTop: 2,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#8899aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#122040',
    borderWidth: 1,
    borderColor: '#1e90ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#1e90ff',
    fontSize: 16,
    fontWeight: '600',
  },
  newCatchButton: {
    flex: 1,
    backgroundColor: '#1e90ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  newCatchButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
