import React, { useState, useCallback, useEffect } from 'react';
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
import { CatchEvent, SetupData } from '../models/Event';
import { updateEvent } from '../storage/localDB';
import { saveEventPhoto, saveEventSnapshot } from '../storage/eventStore';
import { classifyCatch } from '../agents/catchClassifier';
import { syncAllPending } from '../services/syncService';
import EventJoinModal from '../components/EventJoinModal';
import VoiceInput from '../components/VoiceInput';
import WeatherWidget from '../components/WeatherWidget';
import { formatTimestamp } from '../utils/formatters';

const RIG_TYPES = ['Downrigger', 'Flatline'];
const RIG_POSITIONS = ['Main', 'Slider'];
const BOAT_SIDES = ['Port', 'Starboard'];
const LINE_TYPES = ['Mono', 'Braid', 'Leadcore', 'Fluorocarbon'];

type ScreenState = 'home' | 'setup' | 'saving' | 'confirmed';

export default function MateScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('home');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<CatchEvent | null>(null);

  // Form state
  const [downriggerDepth, setDownriggerDepth] = useState('');
  const [backFromBall, setBackFromBall] = useState('');
  const [lureType, setLureType] = useState('');
  const [lureColor, setLureColor] = useState('');
  const [trollingSpeed, setTrollingSpeed] = useState('');
  const [rigType, setRigType] = useState('');
  const [rigPosition, setRigPosition] = useState('');
  const [boatSide, setBoatSide] = useState('');
  const [lineType, setLineType] = useState('');
  const [voiceAudioPath, setVoiceAudioPath] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [photoUri, setPhotoUri] = useState('');
  const [savingStep, setSavingStep] = useState('Saving setup data...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [yourRoleOpen, setYourRoleOpen] = useState(false);

  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  const handleJoined = useCallback((event: CatchEvent) => {
    setCurrentEvent(event);
    setShowJoinModal(false);

    // Pre-fill if event already has setup data
    if (event.setup.downriggerDepth > 0) setDownriggerDepth(String(event.setup.downriggerDepth));
    if (event.setup.backFromBall) setBackFromBall(String(event.setup.backFromBall));
    if (event.setup.lureType) setLureType(event.setup.lureType);
    if (event.setup.lureColor) setLureColor(event.setup.lureColor);
    if (event.setup.trollingSpeed > 0) setTrollingSpeed(String(event.setup.trollingSpeed));
    if (event.setup.rigType) setRigType(event.setup.rigType);
    if (event.setup.rigPosition) setRigPosition(event.setup.rigPosition);
    if (event.setup.boatSide) setBoatSide(event.setup.boatSide);
    if (event.setup.lineType) setLineType(event.setup.lineType);

    setScreenState('setup');
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
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[Mate] handleTakePhoto error:', error);
    }
  }, []);

  const handleSaveSetup = useCallback(async () => {
    if (!currentEvent) return;

    setSavingStep(photoUri ? 'Identifying species...' : 'Saving setup data...');
    setScreenState('saving');

    const classificationFallback: { species: string; confidence: number; sizeEstimate: string; notes: string; lengthCm: number | null; girthCm: number | null; weightLbsEstimate: number | null } = {
      species: 'Unknown',
      confidence: 0,
      sizeEstimate: 'Unknown',
      notes: 'AI identification not available.',
      lengthCm: null,
      girthCm: null,
      weightLbsEstimate: null,
    };

    try {
      const setupData: SetupData = {
        downriggerDepth: parseFloat(downriggerDepth) || 0,
        backFromBall: parseFloat(backFromBall) || undefined,
        lureType: lureType.trim(),
        lureColor: lureColor.trim(),
        trollingSpeed: parseFloat(trollingSpeed) || 0,
        rigType: rigType || undefined,
        rigPosition: rigPosition || undefined,
        boatSide: boatSide || undefined,
        lineType: lineType || undefined,
      };

      let updatedEvent: CatchEvent = {
        ...currentEvent,
        setup: setupData,
        voiceNote: {
          audioPath: voiceAudioPath,
          transcript: voiceTranscript,
          duration: voiceDuration,
        },
      };

      if (photoUri) {
        const savedPhotoPath = Platform.OS === 'web'
          ? photoUri
          : await saveEventPhoto(currentEvent.eventCode, photoUri);

        let classification = classificationFallback;
        if (Platform.OS !== 'web') {
          try {
            classification = await Promise.race([
              classifyCatch(savedPhotoPath),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 30000)
              ),
            ]);
          } catch {
            classification = {
              ...classificationFallback,
              notes: 'AI identification timed out — please identify manually.',
            };
          }
        }

        updatedEvent = {
          ...updatedEvent,
          photo: savedPhotoPath,
          status: 'landed',
          species: classification.species,
          confidence: classification.confidence,
          sizeEstimate: classification.sizeEstimate,
          notes: classification.notes || updatedEvent.notes,
          weightLbsEstimate: classification.weightLbsEstimate,
        };
      }

      await updateEvent(updatedEvent);
      await saveEventSnapshot(updatedEvent);
      setCurrentEvent(updatedEvent);
      syncAllPending().catch(console.error);
      setScreenState('confirmed');
    } catch (error) {
      console.error('[Mate] handleSaveSetup error:', error);
      setScreenState('setup');
      setErrorMessage('Save failed. Please try again.');
    }
  }, [
    currentEvent,
    photoUri,
    downriggerDepth,
    backFromBall,
    lureType,
    lureColor,
    trollingSpeed,
    rigType,
    rigPosition,
    boatSide,
    lineType,
    voiceAudioPath,
    voiceTranscript,
    voiceDuration,
  ]);

  const handleReset = useCallback(() => {
    setCurrentEvent(null);
    setScreenState('home');
    setPhotoUri('');
    setDownriggerDepth('');
    setBackFromBall('');
    setLureType('');
    setLureColor('');
    setTrollingSpeed('');
    setRigType('');
    setRigPosition('');
    setBoatSide('');
    setLineType('');
    setVoiceAudioPath('');
    setVoiceTranscript('');
    setVoiceDuration(0);
  }, []);

  // ─── Home Screen ──────────────────────────────────────────────────────────
  if (screenState === 'home') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <EventJoinModal
          visible={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          onJoined={handleJoined}
        />

        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>1st Mate Log</Text>
        </View>

        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => setShowJoinModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.joinIcon}>🎣</Text>
          <Text style={styles.joinText}>Join Event</Text>
          <Text style={styles.joinSub}>Enter the captain's event code</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoBox} onPress={() => setYourRoleOpen(v => !v)} activeOpacity={0.7}>
          <View style={styles.infoTitleRow}>
            <Text style={styles.infoTitle}>Your role</Text>
            <Text style={styles.infoChevron}>{yourRoleOpen ? '▲' : '▼'}</Text>
          </View>
          {yourRoleOpen && (
            <Text style={styles.infoText}>
              1. Get the event code from the captain{'\n'}
              2. Tap "Join Event" and select the event{'\n'}
              3. Add a photo — AI identifies the species{'\n'}
              4. Fill in rig setup details{'\n'}
              5. Save — data syncs to captain's log
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Saving ───────────────────────────────────────────────────────────────
  if (screenState === 'saving') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.savingText}>{savingStep}</Text>
      </View>
    );
  }

  // ─── Confirmed ────────────────────────────────────────────────────────────
  if (screenState === 'confirmed' && currentEvent) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.confirmedTitle}>
          {currentEvent.species ? currentEvent.species : 'Setup Saved!'}
        </Text>
        {currentEvent.species ? (
          <Text style={styles.confirmedConfidence}>
            {Math.round(currentEvent.confidence * 100)}% confidence
            {currentEvent.sizeEstimate && currentEvent.sizeEstimate !== 'Unknown'
              ? ` · ${currentEvent.sizeEstimate}` : ''}
          </Text>
        ) : null}
        <Text style={styles.confirmedEventCode}>{currentEvent.eventCode}</Text>
        <Text style={styles.confirmedTime}>{formatTimestamp(currentEvent.timestamp)}</Text>

        <View style={styles.confirmedSummary}>
          <Text style={styles.summaryItem}>
            Depth: {currentEvent.setup.downriggerDepth} ft
            {currentEvent.setup.backFromBall ? ` · ${currentEvent.setup.backFromBall} ft back` : ''}
          </Text>
          <Text style={styles.summaryItem}>
            Lure: {currentEvent.setup.lureType}
            {currentEvent.setup.lureColor ? ` (${currentEvent.setup.lureColor})` : ''}
          </Text>
          <Text style={styles.summaryItem}>Speed: {currentEvent.setup.trollingSpeed} mph</Text>
          {currentEvent.setup.rigType ? (
            <Text style={styles.summaryItem}>
              Rig: {currentEvent.setup.rigType}
              {currentEvent.setup.rigPosition ? ` · ${currentEvent.setup.rigPosition}` : ''}
            </Text>
          ) : null}
          {currentEvent.setup.boatSide ? (
            <Text style={styles.summaryItem}>Side: {currentEvent.setup.boatSide}</Text>
          ) : null}
          {currentEvent.setup.lineType ? (
            <Text style={styles.summaryItem}>Line: {currentEvent.setup.lineType}</Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.doneButton} onPress={handleReset}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Setup Form ───────────────────────────────────────────────────────────
  if (screenState === 'setup' && currentEvent) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Event Info Banner */}
          <View style={styles.eventBanner}>
            <Text style={styles.bannerCode}>{currentEvent.eventCode}</Text>
            <Text style={styles.bannerSpecies}>{currentEvent.species}</Text>
            <Text style={styles.bannerTime}>{formatTimestamp(currentEvent.timestamp)}</Text>
          </View>

          {/* Fish Photo */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Fish Photo</Text>
            {photoUri ? (
              <View>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
                <TouchableOpacity style={styles.retakePhotoButton} onPress={handleTakePhoto}>
                  <Text style={styles.retakePhotoText}>Retake Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakePhoto} activeOpacity={0.8}>
                <Text style={styles.addPhotoIcon}>📷</Text>
                <Text style={styles.addPhotoText}>Add Photo</Text>
                <Text style={styles.addPhotoSub}>AI will identify the species</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Weather summary */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Current Conditions</Text>
            <WeatherWidget weather={currentEvent.weather} />
          </View>

          {/* Rig Setup */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Rig Setup</Text>

            {/* Downrigger Depth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Downrigger Depth (feet)</Text>
              <TextInput
                style={styles.input}
                value={downriggerDepth}
                onChangeText={setDownriggerDepth}
                placeholder="e.g. 45"
                placeholderTextColor="#4a5f7a"
                keyboardType="numeric"
              />
            </View>

            {/* Back from Downrigger Ball */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Back from Downrigger Ball (feet)</Text>
              <TextInput
                style={styles.input}
                value={backFromBall}
                onChangeText={setBackFromBall}
                placeholder="e.g. 10"
                placeholderTextColor="#4a5f7a"
                keyboardType="numeric"
              />
            </View>

            {/* Lure Type */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Lure Type *</Text>
              <TextInput
                style={styles.input}
                value={lureType}
                onChangeText={setLureType}
                placeholder="e.g. Spoon, Flasher, Plug"
                placeholderTextColor="#4a5f7a"
              />
            </View>

            {/* Lure Color */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Lure Color</Text>
              <TextInput
                style={styles.input}
                value={lureColor}
                onChangeText={setLureColor}
                placeholder="e.g. Green/Chartreuse, Glow White"
                placeholderTextColor="#4a5f7a"
              />
            </View>

            {/* Trolling Speed */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Trolling Speed (mph)</Text>
              <TextInput
                style={styles.input}
                value={trollingSpeed}
                onChangeText={setTrollingSpeed}
                placeholder="e.g. 2.5"
                placeholderTextColor="#4a5f7a"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Downrigger or Flatline */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Downrigger or Flatline</Text>
              <View style={styles.chipRow}>
                {RIG_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, rigType === opt && styles.chipSelected]}
                    onPress={() => setRigType(rigType === opt ? '' : opt)}
                  >
                    <Text style={[styles.chipText, rigType === opt && styles.chipTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Main or Slider */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Main or Slider</Text>
              <View style={styles.chipRow}>
                {RIG_POSITIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, rigPosition === opt && styles.chipSelected]}
                    onPress={() => setRigPosition(rigPosition === opt ? '' : opt)}
                  >
                    <Text style={[styles.chipText, rigPosition === opt && styles.chipTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Side of Boat Landed */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Side of Boat Landed</Text>
              <View style={styles.chipRow}>
                {BOAT_SIDES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, boatSide === opt && styles.chipSelected]}
                    onPress={() => setBoatSide(boatSide === opt ? '' : opt)}
                  >
                    <Text style={[styles.chipText, boatSide === opt && styles.chipTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Line Type */}
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

          {/* Inline error message */}
          {errorMessage && (
            <TouchableOpacity style={styles.errorBanner} onPress={() => setErrorMessage(null)} activeOpacity={0.8}>
              <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
            </TouchableOpacity>
          )}

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveSetup} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>Save Setup</Text>
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
    marginBottom: 8,
  },
  joinButton: {
    backgroundColor: '#00c853',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#00c853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  joinIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  joinText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  joinSub: {
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
  savingText: {
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
  confirmedEventCode: {
    color: '#1e90ff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  confirmedConfidence: {
    color: '#69f0ae',
    fontSize: 14,
    marginBottom: 8,
  },
  confirmedTime: {
    color: '#8899aa',
    fontSize: 14,
    marginBottom: 24,
  },
  confirmedSummary: {
    backgroundColor: '#122040',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    gap: 6,
  },
  summaryItem: {
    color: '#c0d0e0',
    fontSize: 14,
  },
  doneButton: {
    backgroundColor: '#1e90ff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
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
  },
  bannerCode: {
    color: '#1e90ff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  bannerSpecies: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  bannerTime: {
    color: '#8899aa',
    fontSize: 13,
  },
  sectionContainer: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#8899aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
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
    marginBottom: 12,
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
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  retakePhotoButton: {
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retakePhotoText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '600',
  },
});
