import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

import { CatchEvent, SetupData, GpsData, WeatherData } from '../models/Event';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { insertEvent, updateEvent } from '../storage/localDB';
import { saveEventSnapshot } from '../storage/eventStore';
import { formatEventCode } from '../utils/formatters';
import { fetchPreyData } from '../services/weatherWaterService';
import { syncAllPending } from '../services/syncService';
import VoiceInput from '../components/VoiceInput';

const LINE_TYPES = ['Mono', 'Braid', 'Fluorocarbon'];
const COUNTER_KEY = 'event_counter';

type ScreenState = 'home' | 'loading' | 'form' | 'saving' | 'confirmed';

function defaultGps(): GpsData {
  return { lat: 0, lng: 0, accuracy: 0, heading: 0, speed: 0 };
}

function defaultWeather(): WeatherData {
  return {
    windSpeed: 0, windDirection: 0, waveHeight: 0,
    airTemp: 15, waterTemp: 13, pressure: 1013,
    conditions: 'Unknown', cloudCover: 0,
    fetchedAt: new Date().toISOString(),
  };
}

async function getNextCounter(): Promise<number> {
  const raw = await AsyncStorage.getItem(COUNTER_KEY);
  const next = (raw ? parseInt(raw, 10) : 0) + 1;
  await AsyncStorage.setItem(COUNTER_KEY, String(next));
  return next;
}

export default function ShoreScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('home');
  const [currentEvent, setCurrentEvent] = useState<CatchEvent | null>(null);

  const [lureType, setLureType] = useState('');
  const [lureColor, setLureColor] = useState('');
  const [lineType, setLineType] = useState('');
  const [voiceAudioPath, setVoiceAudioPath] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [shorePhotoUri, setShorePhotoUri] = useState('');
  const [shorePin, setShorePin] = useState<{ x: number; y: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1, height: 1 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  const handleFishOnShore = useCallback(async () => {
    setScreenState('loading');
    try {
      const [gps, counter] = await Promise.all([
        getCurrentPosition(),
        getNextCounter(),
      ]);
      const gpsData = gps || defaultGps();
      const lat = gpsData.lat || 44.88702;
      const lng = gpsData.lng || -80.066101;

      const [weather, windHistory, pressureHistory, prey] = await Promise.all([
        fetchWeatherData(lat, lng),
        fetchWindHistory(lat, lng),
        fetchPressureHistory(lat, lng),
        fetchPreyData(lat, lng),
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

      const event: CatchEvent = {
        id: uuid.v4() as string,
        eventCode: formatEventCode(counter),
        timestamp: new Date().toISOString(),
        status: 'bite',
        biteTimestamp: new Date().toISOString(),
        photo: '',
        gps: gpsData,
        weather: weatherData,
        setup: { downriggerDepth: 0, lureType: '', lureColor: '', trollingSpeed: 0, boatSide: 'Shore' },
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
      setCurrentEvent(event);
      setScreenState('form');
    } catch (err) {
      console.error('[Shore] handleFishOnShore error:', err);
      setErrorMessage('Failed to capture conditions. Try again.');
      setScreenState('home');
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    try {
      const launch = Platform.OS === 'web'
        ? ImagePicker.launchImageLibraryAsync
        : ImagePicker.launchCameraAsync;
      const result = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        setShorePhotoUri(result.assets[0].uri);
        setShorePin(null);
      }
    } catch (err) {
      console.error('[Shore] handleTakePhoto error:', err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentEvent) return;
    setScreenState('saving');
    try {
      const setupData: SetupData = {
        downriggerDepth: 0,
        lureType: lureType.trim(),
        lureColor: lureColor.trim(),
        trollingSpeed: 0,
        boatSide: 'Shore',
        lineType: lineType || undefined,
      };

      const updatedEvent: CatchEvent = {
        ...currentEvent,
        setup: setupData,
        voiceNote: { audioPath: voiceAudioPath, transcript: voiceTranscript, duration: voiceDuration },
        shorePhoto: shorePhotoUri || undefined,
        shorePin: shorePin || undefined,
        status: shorePhotoUri ? 'landed' : 'bite',
      };

      await updateEvent(updatedEvent);
      await saveEventSnapshot(updatedEvent);
      setCurrentEvent(updatedEvent);
      syncAllPending().catch(console.error);
      setScreenState('confirmed');
    } catch (err) {
      console.error('[Shore] handleSave error:', err);
      setScreenState('form');
      setErrorMessage('Save failed. Please try again.');
    }
  }, [currentEvent, lureType, lureColor, lineType, voiceAudioPath, voiceTranscript, voiceDuration, shorePhotoUri, shorePin]);

  const handleReset = useCallback(() => {
    setCurrentEvent(null);
    setScreenState('home');
    setLureType('');
    setLureColor('');
    setLineType('');
    setShorePhotoUri('');
    setShorePin(null);
    setVoiceAudioPath('');
    setVoiceTranscript('');
    setVoiceDuration(0);
  }, []);

  // ─── Home ─────────────────────────────────────────────────────────────────
  if (screenState === 'home') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Shore Log</Text>
        </View>

        {errorMessage && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setErrorMessage(null)} activeOpacity={0.8}>
            <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.fishOnButton} onPress={handleFishOnShore} activeOpacity={0.8}>
          <Text style={styles.fishOnIcon}>🎣</Text>
          <Text style={styles.fishOnText}>Fish On Shore</Text>
          <Text style={styles.fishOnSub}>Captures GPS, weather & conditions</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (screenState === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.loadingText}>Capturing conditions...</Text>
      </View>
    );
  }

  // ─── Saving ───────────────────────────────────────────────────────────────
  if (screenState === 'saving') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.loadingText}>Saving...</Text>
      </View>
    );
  }

  // ─── Confirmed ────────────────────────────────────────────────────────────
  if (screenState === 'confirmed' && currentEvent) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.confirmedTitle}>Shore Catch Saved</Text>
        <Text style={styles.confirmedCode}>{currentEvent.eventCode}</Text>
        {currentEvent.setup.lureType ? (
          <Text style={styles.confirmedDetail}>
            {currentEvent.setup.lureType}
            {currentEvent.setup.lureColor ? ` · ${currentEvent.setup.lureColor}` : ''}
          </Text>
        ) : null}
        {currentEvent.shorePin && (
          <Text style={styles.confirmedDetail}>Pin marked on photo ✓</Text>
        )}
        <TouchableOpacity style={styles.doneButton} onPress={handleReset}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────
  if (screenState === 'form' && currentEvent) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.eventBanner}>
            <Text style={styles.bannerCode}>{currentEvent.eventCode}</Text>
            <Text style={styles.bannerTime}>{new Date(currentEvent.timestamp).toLocaleTimeString()}</Text>
          </View>

          {/* Shoreline Photo */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Shoreline Photo</Text>
            <Text style={styles.formHint}>
              Take a photo of the area, then tap on the photo to mark where the fish hit or a landmark.
            </Text>

            {shorePhotoUri ? (
              <View>
                <View
                  style={styles.photoContainer}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setImageDimensions({ width, height });
                  }}
                >
                  <Image source={{ uri: shorePhotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={(e) => {
                      const { locationX, locationY } = e.nativeEvent;
                      setShorePin({
                        x: locationX / imageDimensions.width,
                        y: locationY / imageDimensions.height,
                      });
                    }}
                    activeOpacity={1}
                  />
                  {shorePin && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.pinMarker,
                        {
                          left: shorePin.x * imageDimensions.width - 12,
                          top: shorePin.y * imageDimensions.height - 24,
                        },
                      ]}
                    >
                      <Text style={styles.pinEmoji}>📍</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.pinHint}>
                  {shorePin ? 'Tap photo to move the pin' : 'Tap photo to mark the spot'}
                </Text>
                <TouchableOpacity style={styles.retakeButton} onPress={handleTakePhoto}>
                  <Text style={styles.retakeButtonText}>Retake Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakePhoto} activeOpacity={0.8}>
                <Text style={styles.addPhotoIcon}>📷</Text>
                <Text style={styles.addPhotoText}>Take Shore Photo</Text>
                <Text style={styles.addPhotoSub}>Tap to mark where the fish hit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Lure Setup */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Lure Setup</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Lure Type</Text>
              <TextInput
                style={styles.input}
                value={lureType}
                onChangeText={setLureType}
                placeholder="e.g. Spoon, Jig, Swimbait"
                placeholderTextColor="#4a5f7a"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Lure Color</Text>
              <TextInput
                style={styles.input}
                value={lureColor}
                onChangeText={setLureColor}
                placeholder="e.g. Silver/Blue, Chartreuse"
                placeholderTextColor="#4a5f7a"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Line Type</Text>
              <View style={styles.chipRow}>
                {LINE_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, lineType === opt && styles.chipSelected]}
                    onPress={() => setLineType(lineType === opt ? '' : opt)}
                  >
                    <Text style={[styles.chipText, lineType === opt && styles.chipTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Voice Note */}
          <View style={styles.voiceCard}>
            <VoiceInput
              onTranscriptComplete={(path, transcript, duration) => {
                setVoiceAudioPath(path);
                setVoiceTranscript(transcript);
                setVoiceDuration(duration);
              }}
            />
          </View>

          {errorMessage && (
            <TouchableOpacity style={styles.errorBanner} onPress={() => setErrorMessage(null)} activeOpacity={0.8}>
              <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={handleReset}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  fishOnButton: {
    backgroundColor: '#00c853',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#00c853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fishOnIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  fishOnText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fishOnSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  checkmark: {
    fontSize: 72,
    color: '#00c853',
    marginBottom: 16,
  },
  confirmedTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  confirmedCode: {
    color: '#1e90ff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmedDetail: {
    color: '#8899aa',
    fontSize: 14,
    marginBottom: 4,
  },
  doneButton: {
    backgroundColor: '#1e90ff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 24,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  eventBanner: {
    backgroundColor: '#1a3a6a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e90ff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerCode: {
    color: '#1e90ff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bannerTime: {
    color: '#8899aa',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: '#122040',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  voiceCard: {
    backgroundColor: '#122040',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  formTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  formHint: {
    color: '#8899aa',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  photoContainer: {
    height: 240,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0a1628',
    marginBottom: 8,
  },
  pinMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  pinEmoji: {
    fontSize: 24,
  },
  pinHint: {
    color: '#8899aa',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  retakeButton: {
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '600',
  },
  addPhotoButton: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  addPhotoIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  addPhotoText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  addPhotoSub: {
    color: '#8899aa',
    fontSize: 12,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#8899aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 15,
    padding: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0a1628',
  },
  chipSelected: {
    borderColor: '#1e90ff',
    backgroundColor: '#1e90ff22',
  },
  chipText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#1e90ff',
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#3a1b1b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  errorBannerText: {
    color: '#ff5252',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#00c853',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#00c853',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8899aa',
  },
  cancelButtonText: {
    color: '#8899aa',
    fontSize: 16,
    fontWeight: '600',
  },
});
