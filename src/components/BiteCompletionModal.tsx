import React, { useState, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { CatchEvent, SetupData } from '../models/Event';
import { updateEvent } from '../storage/localDB';
import { saveEventSnapshot } from '../storage/eventStore';
import { classifyCatch } from '../agents/catchClassifier';
import { syncAllPending } from '../services/syncService';
import VoiceInput from './VoiceInput';
import { formatTimestamp } from '../utils/formatters';

const LURE_TYPES = ['Spoon', 'Flasher fly', 'Plug', 'Body bait'];
const RIG_TYPES = ['Downrigger', 'Flatline'];
const RIG_POSITIONS = ['Main', 'Slider'];
const LINE_TYPES = ['Mono', 'Braid', 'Leadcore', 'Fluorocarbon'];
const WAVE_DIRECTIONS = ['Stern', 'Port', 'Starboard', 'Bow'];
const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TARGET_SPECIES = ['Chinook', 'Coho', 'Rainbow', 'Lake Trout'];
const BALL_WEIGHTS = ['8', '10', '12', '14', '15'];
const WATER_CLARITY = ['Clear', 'Slightly stained', 'Green', 'Murky'];
const SPREAD_POSITIONS = ['Port inner', 'Port outer', 'Stbd inner', 'Stbd outer', 'Board', 'Flatline'];

interface Props {
  event: CatchEvent;
  visible: boolean;
  onComplete: (updated: CatchEvent) => void;
  onClose: () => void;
}

type FormState = 'form' | 'saving';

export default function BiteCompletionModal({ event, visible, onComplete, onClose }: Props) {
  const [formState, setFormState] = useState<FormState>('form');
  const [savingStep, setSavingStep] = useState('Saving...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [photoUri, setPhotoUri] = useState('');
  const [lureType, setLureType] = useState(event.setup.lureType || '');
  const [lureColor, setLureColor] = useState(event.setup.lureColor || '');
  const [downriggerDepth, setDownriggerDepth] = useState(
    event.setup.downriggerDepth > 0 ? String(event.setup.downriggerDepth) : ''
  );
  const [backFromBall, setBackFromBall] = useState(
    event.setup.backFromBall ? String(event.setup.backFromBall) : ''
  );
  const [trollingSpeed, setTrollingSpeed] = useState(
    event.setup.trollingSpeed > 0 ? String(event.setup.trollingSpeed) : ''
  );
  const [rigType, setRigType] = useState(event.setup.rigType || '');
  const [rigPosition, setRigPosition] = useState(event.setup.rigPosition || '');
  const [lineType, setLineType] = useState(event.setup.lineType || '');
  const [waveDirection, setWaveDirection] = useState(event.setup.waveDirection || '');
  const [boatHeading, setBoatHeading] = useState(event.setup.boatHeading || '');
  const [windDir, setWindDir] = useState(event.setup.windDir || '');
  const [targetSpecies, setTargetSpecies] = useState(event.setup.targetSpecies || '');
  const [flasherColor, setFlasherColor] = useState(event.setup.flasherColor || '');
  const [leadLength, setLeadLength] = useState(event.setup.leadLengthIn ? String(event.setup.leadLengthIn) : '');
  const [ballWeight, setBallWeight] = useState(event.setup.ballWeightLbs ? String(event.setup.ballWeightLbs) : '');
  const [waterClarity, setWaterClarity] = useState(event.setup.waterClarity || '');
  const [spreadPosition, setSpreadPosition] = useState(event.setup.spreadPosition || '');
  const [voiceAudioPath, setVoiceAudioPath] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);

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
    } catch (err) {
      console.error('[BiteCompletion] handleTakePhoto error:', err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSavingStep(photoUri ? 'Identifying species...' : 'Saving...');
    setFormState('saving');

    const classificationFallback = {
      species: 'Unknown',
      confidence: 0,
      sizeEstimate: 'Unknown',
      notes: 'AI identification not available.',
      lengthCm: null as number | null,
      girthCm: null as number | null,
      weightLbsEstimate: null as number | null,
    };

    try {
      const setupData: SetupData = {
        downriggerDepth: parseFloat(downriggerDepth) || 0,
        backFromBall: parseFloat(backFromBall) || undefined,
        lureType,
        lureColor: lureColor.trim(),
        trollingSpeed: parseFloat(trollingSpeed) || 0,
        rigType: rigType || undefined,
        rigPosition: rigPosition || undefined,
        boatSide: event.setup.boatSide,
        lineType: lineType || undefined,
        waveDirection: waveDirection || undefined,
        boatHeading: boatHeading || undefined,
        windDir: windDir || undefined,
        targetSpecies: targetSpecies || undefined,
        flasherColor: lureType === 'Flasher fly' ? (flasherColor.trim() || undefined) : undefined,
        leadLengthIn: lureType === 'Flasher fly' ? (parseFloat(leadLength) || undefined) : undefined,
        ballWeightLbs: ballWeight ? parseFloat(ballWeight) : undefined,
        waterClarity: waterClarity || undefined,
        spreadPosition: spreadPosition || undefined,
      };

      let updatedEvent: CatchEvent = {
        ...event,
        setup: setupData,
        voiceNote: { audioPath: voiceAudioPath, transcript: voiceTranscript, duration: voiceDuration },
      };

      if (photoUri) {
        let savedPhotoPath = photoUri;
        if (Platform.OS !== 'web') {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            const asset = await MediaLibrary.createAssetAsync(photoUri);
            savedPhotoPath = asset.uri;
          }
        }

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
      saveEventSnapshot(updatedEvent).catch(() => {});
      syncAllPending().catch(console.error);
      onComplete(updatedEvent);
    } catch (err) {
      console.error('[BiteCompletion] handleSave error:', err);
      setFormState('form');
      setErrorMessage('Save failed. Please try again.');
    }
  }, [
    event, photoUri, lureType, lureColor, downriggerDepth, backFromBall,
    trollingSpeed, rigType, rigPosition, lineType, waveDirection, boatHeading,
    windDir, targetSpecies, flasherColor, leadLength, ballWeight, waterClarity,
    spreadPosition, voiceAudioPath, voiceTranscript, voiceDuration, onComplete,
  ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBack}>
            <Text style={styles.headerBackText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Catch</Text>
          <View style={{ width: 70 }} />
        </View>

        {formState === 'saving' ? (
          <View style={styles.savingContainer}>
            <ActivityIndicator color="#1e90ff" size="large" />
            <Text style={styles.savingText}>{savingStep}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Event banner */}
            <View style={styles.eventBanner}>
              <Text style={styles.bannerCode}>{event.eventCode}</Text>
              <Text style={styles.bannerMeta}>
                {event.setup.boatSide} · {formatTimestamp(event.biteTimestamp ?? event.timestamp)}
              </Text>
            </View>

            {/* Fish Photo */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Fish Photo</Text>
              {photoUri ? (
                <>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={styles.retakeButton} onPress={handleTakePhoto}>
                    <Text style={styles.retakeButtonText}>Retake Photo</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakePhoto} activeOpacity={0.8}>
                  <Text style={styles.addPhotoIcon}>📷</Text>
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                  <Text style={styles.addPhotoSub}>AI will identify the species</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Rig Setup */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rig Setup</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Target Species</Text>
                <View style={styles.chipRow}>
                  {TARGET_SPECIES.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, targetSpecies === opt && styles.chipSelected]}
                      onPress={() => setTargetSpecies(targetSpecies === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, targetSpecies === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Lure Type</Text>
                <View style={styles.chipRow}>
                  {LURE_TYPES.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, lureType === opt && styles.chipSelected]}
                      onPress={() => setLureType(lureType === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, lureType === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

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

              {lureType === 'Flasher fly' && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Flasher Color / Pattern</Text>
                    <TextInput
                      style={styles.input}
                      value={flasherColor}
                      onChangeText={setFlasherColor}
                      placeholder="e.g. Green/Glow, UV Blue"
                      placeholderTextColor="#4a5f7a"
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Lead Length — Flasher to Fly (inches)</Text>
                    <TextInput
                      style={styles.input}
                      value={leadLength}
                      onChangeText={setLeadLength}
                      placeholder="e.g. 24"
                      placeholderTextColor="#4a5f7a"
                      keyboardType="numeric"
                    />
                  </View>
                </>
              )}

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

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Ball Weight (lbs)</Text>
                <View style={styles.chipRow}>
                  {BALL_WEIGHTS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, ballWeight === opt && styles.chipSelected]}
                      onPress={() => setBallWeight(ballWeight === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, ballWeight === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

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

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Downrigger or Flatline</Text>
                <View style={styles.chipRow}>
                  {RIG_TYPES.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, rigType === opt && styles.chipSelected]}
                      onPress={() => setRigType(rigType === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, rigType === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Main or Slider</Text>
                <View style={styles.chipRow}>
                  {RIG_POSITIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, rigPosition === opt && styles.chipSelected]}
                      onPress={() => setRigPosition(rigPosition === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, rigPosition === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Spread Position</Text>
                <View style={styles.chipRow}>
                  {SPREAD_POSITIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, spreadPosition === opt && styles.chipSelected]}
                      onPress={() => setSpreadPosition(spreadPosition === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, spreadPosition === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
                      <Text style={[styles.chipText, lineType === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Water Clarity</Text>
                <View style={styles.chipRow}>
                  {WATER_CLARITY.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, waterClarity === opt && styles.chipSelected]}
                      onPress={() => setWaterClarity(waterClarity === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, waterClarity === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Direction of Waves</Text>
                <View style={styles.chipRow}>
                  {WAVE_DIRECTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, waveDirection === opt && styles.chipSelected]}
                      onPress={() => setWaveDirection(waveDirection === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, waveDirection === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Boat Direction</Text>
                <View style={styles.chipRow}>
                  {COMPASS_DIRS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, boatHeading === opt && styles.chipSelected]}
                      onPress={() => setBoatHeading(boatHeading === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, boatHeading === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Wind Direction</Text>
                <View style={styles.chipRow}>
                  {COMPASS_DIRS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, windDir === opt && styles.chipSelected]}
                      onPress={() => setWindDir(windDir === opt ? '' : opt)}
                    >
                      <Text style={[styles.chipText, windDir === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Voice Note */}
            <View style={styles.card}>
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
              <Text style={styles.saveButtonText}>Save Catch</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#122040',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  headerBack: { width: 70 },
  headerBackText: { color: '#1e90ff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
  savingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  savingText: { color: '#ffffff', fontSize: 18, fontWeight: '600', marginTop: 20 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
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
  bannerCode: { color: '#1e90ff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  bannerMeta: { color: '#8899aa', fontSize: 13 },
  card: {
    backgroundColor: '#122040',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  addPhotoButton: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  addPhotoIcon: { fontSize: 36, marginBottom: 6 },
  addPhotoText: { color: '#ffffff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  addPhotoSub: { color: '#8899aa', fontSize: 12 },
  photoPreview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10 },
  retakeButton: {
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retakeButtonText: { color: '#8899aa', fontSize: 14, fontWeight: '600' },
  fieldGroup: { marginBottom: 14 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0a1628',
  },
  chipSelected: { borderColor: '#1e90ff', backgroundColor: '#1e90ff22' },
  chipText: { color: '#8899aa', fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#1e90ff', fontWeight: '700' },
  errorBanner: {
    backgroundColor: '#3a1b1b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  errorBannerText: { color: '#ff5252', fontSize: 13, textAlign: 'center', fontWeight: '600' },
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
  saveButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  cancelButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8899aa',
  },
  cancelButtonText: { color: '#8899aa', fontSize: 16, fontWeight: '600' },
});
