import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CatchEvent, SetupData } from '../models/Event';
import { updateEvent } from '../storage/localDB';
import { saveEventSnapshot } from '../storage/eventStore';
import { syncAllPending } from '../services/syncService';
import EventJoinModal from '../components/EventJoinModal';
import VoiceInput from '../components/VoiceInput';
import WeatherWidget from '../components/WeatherWidget';
import { formatTimestamp } from '../utils/formatters';

const LINE_WEIGHTS = ['8 lb', '10 lb', '12 lb', '15 lb', '20 lb', '30 lb'];

type ScreenState = 'home' | 'setup' | 'saving' | 'confirmed';

export default function MateScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('home');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<CatchEvent | null>(null);

  // Form state
  const [downriggerDepth, setDownriggerDepth] = useState('');
  const [lureType, setLureType] = useState('');
  const [lureColor, setLureColor] = useState('');
  const [lineWeight, setLineWeight] = useState('15 lb');
  const [trollingSpeed, setTrollingSpeed] = useState('');
  const [rodReel, setRodReel] = useState('');
  const [notes, setNotes] = useState('');
  const [voiceAudioPath, setVoiceAudioPath] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [yourRoleOpen, setYourRoleOpen] = useState(false);

  const handleJoined = useCallback((event: CatchEvent) => {
    setCurrentEvent(event);
    setShowJoinModal(false);

    // Pre-fill if event already has setup data
    if (event.setup.downriggerDepth > 0) {
      setDownriggerDepth(String(event.setup.downriggerDepth));
    }
    if (event.setup.lureType) setLureType(event.setup.lureType);
    if (event.setup.lureColor) setLureColor(event.setup.lureColor);
    if (event.setup.lineWeight) setLineWeight(event.setup.lineWeight);
    if (event.setup.trollingSpeed > 0) {
      setTrollingSpeed(String(event.setup.trollingSpeed));
    }
    if (event.setup.rodReel) setRodReel(event.setup.rodReel);

    setScreenState('setup');
  }, []);

  const handleSaveSetup = useCallback(async () => {
    if (!currentEvent) return;

    if (!lureType.trim()) {
      Alert.alert('Required Field', 'Please enter the lure type.');
      return;
    }

    setScreenState('saving');

    try {
      const setupData: SetupData = {
        downriggerDepth: parseFloat(downriggerDepth) || 0,
        lureType: lureType.trim(),
        lureColor: lureColor.trim(),
        lineWeight,
        trollingSpeed: parseFloat(trollingSpeed) || 0,
        rodReel: rodReel.trim(),
      };

      const updatedEvent: CatchEvent = {
        ...currentEvent,
        setup: setupData,
        voiceNote: {
          audioPath: voiceAudioPath,
          transcript: voiceTranscript,
          duration: voiceDuration,
        },
        notes: notes.trim() || currentEvent.notes,
      };

      await updateEvent(updatedEvent);
      await saveEventSnapshot(updatedEvent);
      setCurrentEvent(updatedEvent);

      // Background sync
      syncAllPending().catch(console.error);

      setScreenState('confirmed');
    } catch (error) {
      console.error('[Mate] handleSaveSetup error:', error);
      setScreenState('setup');
      Alert.alert('Save Failed', 'Could not save setup. Please try again.');
    }
  }, [
    currentEvent,
    downriggerDepth,
    lureType,
    lureColor,
    lineWeight,
    trollingSpeed,
    rodReel,
    notes,
    voiceAudioPath,
    voiceTranscript,
    voiceDuration,
  ]);

  const handleReset = useCallback(() => {
    setCurrentEvent(null);
    setScreenState('home');
    setDownriggerDepth('');
    setLureType('');
    setLureColor('');
    setLineWeight('15 lb');
    setTrollingSpeed('');
    setRodReel('');
    setNotes('');
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
              2. Tap "Join Event" and enter the code{'\n'}
              3. Fill in downrigger depth, lure, speed{'\n'}
              4. Add a voice note about conditions{'\n'}
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
        <Text style={styles.savingText}>Saving setup data...</Text>
      </View>
    );
  }

  // ─── Confirmed ────────────────────────────────────────────────────────────
  if (screenState === 'confirmed' && currentEvent) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.confirmedTitle}>Setup Saved!</Text>
        <Text style={styles.confirmedEventCode}>
          {currentEvent.eventCode}
        </Text>
        <Text style={styles.confirmedSpecies}>{currentEvent.species}</Text>
        <Text style={styles.confirmedTime}>
          {formatTimestamp(currentEvent.timestamp)}
        </Text>

        <View style={styles.confirmedSummary}>
          <Text style={styles.summaryItem}>
            Depth: {currentEvent.setup.downriggerDepth} ft
          </Text>
          <Text style={styles.summaryItem}>
            Lure: {currentEvent.setup.lureType}{' '}
            {currentEvent.setup.lureColor
              ? `(${currentEvent.setup.lureColor})`
              : ''}
          </Text>
          <Text style={styles.summaryItem}>
            Speed: {currentEvent.setup.trollingSpeed} kts
          </Text>
          <Text style={styles.summaryItem}>
            Line: {currentEvent.setup.lineWeight}
          </Text>
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
            <Text style={styles.bannerTime}>
              {formatTimestamp(currentEvent.timestamp)}
            </Text>
          </View>

          {/* Weather summary */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Current Conditions</Text>
            <WeatherWidget weather={currentEvent.weather} />
          </View>

          {/* Setup Form */}
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

            {/* Line Weight */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Line Weight</Text>
              <View style={styles.pickerWrapper}>
                {LINE_WEIGHTS.map((weight) => (
                  <TouchableOpacity
                    key={weight}
                    style={[
                      styles.weightChip,
                      lineWeight === weight && styles.weightChipSelected,
                    ]}
                    onPress={() => setLineWeight(weight)}
                  >
                    <Text
                      style={[
                        styles.weightChipText,
                        lineWeight === weight && styles.weightChipTextSelected,
                      ]}
                    >
                      {weight}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Trolling Speed */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Trolling Speed (knots)</Text>
              <TextInput
                style={styles.input}
                value={trollingSpeed}
                onChangeText={setTrollingSpeed}
                placeholder="e.g. 2.5"
                placeholderTextColor="#4a5f7a"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Rod/Reel */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Rod / Reel</Text>
              <TextInput
                style={styles.input}
                value={rodReel}
                onChangeText={setRodReel}
                placeholder="e.g. Shimano Tekota 600, 8.5ft rod"
                placeholderTextColor="#4a5f7a"
              />
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

          {/* Additional Notes */}
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Additional Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any other observations about the bite, conditions, or setup..."
              placeholderTextColor="#4a5f7a"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveSetup}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>Save Setup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleReset}
          >
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
  heroSubtitle: {
    color: '#8899aa',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
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
  confirmedSpecies: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 4,
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
  notesInput: {
    minHeight: 80,
    marginTop: 6,
  },
  pickerWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weightChip: {
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0a1628',
  },
  weightChipSelected: {
    borderColor: '#1e90ff',
    backgroundColor: '#1e90ff22',
  },
  weightChipText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '500',
  },
  weightChipTextSelected: {
    color: '#1e90ff',
    fontWeight: '700',
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
