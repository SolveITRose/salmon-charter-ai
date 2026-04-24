import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CatchEvent, FishFinderData } from '../models/Event';
import { parseFishFinderScreen } from '../agents/fishFinderParser';

interface FishFinderModalProps {
  visible: boolean;
  event: CatchEvent;
  onSave: (data: FishFinderData) => void;
  onSkip: () => void;
}

const KNOTS_TO_MPH = 1.15078;
const MAX_ATTEMPTS = 3;

type Step = 'scan' | 'analyzing' | 'review';

export default function FishFinderModal({ visible, event, onSave, onSkip }: FishFinderModalProps) {
  const [step, setStep] = useState<Step>('scan');
  const [attempts, setAttempts] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  // Review form state — pre-filled from event, overridden by scan results
  const [waterTemp, setWaterTemp] = useState(
    event.weather.waterTemp ? String(Math.round(event.weather.waterTemp * 10) / 10) : ''
  );
  const [depth, setDepth] = useState('');
  const [speedOverGround, setSpeedOverGround] = useState(
    event.gps.speed ? String(Math.round(event.gps.speed * KNOTS_TO_MPH * 10) / 10) : ''
  );
  const [courseOverGround, setCourseOverGround] = useState('');
  const [heading, setHeading] = useState(
    event.gps.heading ? String(Math.round(event.gps.heading)) : ''
  );
  const [baitOnScreen, setBaitOnScreen] = useState<boolean | null>(null);

  const applyParsed = (parsed: Partial<FishFinderData>) => {
    if (parsed.waterTemp !== undefined) setWaterTemp(String(parsed.waterTemp));
    if (parsed.depth !== undefined) setDepth(String(parsed.depth));
    if (parsed.speedOverGround !== undefined) setSpeedOverGround(String(parsed.speedOverGround));
    if (parsed.courseOverGround !== undefined) setCourseOverGround(String(parsed.courseOverGround));
    if (parsed.heading !== undefined) setHeading(String(parsed.heading));
    if (parsed.baitOnScreen !== undefined) setBaitOnScreen(parsed.baitOnScreen);
  };

  const handleCapture = async () => {
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0].base64) return;

    const { uri, base64 } = result.assets[0];
    setCapturedUri(uri);
    setStep('analyzing');
    setScanError(null);

    try {
      const parsed = await parseFishFinderScreen(base64!);
      const fieldCount = Object.keys(parsed).length;

      if (fieldCount === 0) throw new Error('No data found');

      applyParsed(parsed);
      setStep('review');
    } catch {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        setScanError("Couldn't read the screen after 3 attempts. Enter values manually.");
        setStep('review');
      } else {
        setScanError(`Couldn't read the screen. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`);
        setStep('scan');
      }
    }
  };

  const handleSkip = () => {
    setScanError(null);
    setStep('review');
  };

  const handleSave = () => {
    const data: FishFinderData = {
      waterTemp: parseFloat(waterTemp) || undefined,
      depth: parseFloat(depth) || undefined,
      speedOverGround: parseFloat(speedOverGround) || undefined,
      courseOverGround: parseFloat(courseOverGround) || undefined,
      heading: parseFloat(heading) || undefined,
      baitOnScreen: baitOnScreen ?? undefined,
    };
    onSave(data);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.overlay}>
        <View style={styles.container}>

          {/* ── SCAN STEP ── */}
          {step === 'scan' && (
            <>
              <Text style={styles.title}>Scan Fish Finder</Text>
              <Text style={styles.subtitle}>
                Point your camera at the fish finder screen
                {attempts > 0 ? ` · Attempt ${attempts + 1} of ${MAX_ATTEMPTS}` : ''}
              </Text>

              {scanError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{scanError}</Text>
                </View>
              )}

              <TouchableOpacity style={styles.captureButton} onPress={handleCapture} activeOpacity={0.8}>
                <Text style={styles.captureIcon}>📷</Text>
                <Text style={styles.captureText}>Capture Screen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.skipLink} onPress={handleSkip}>
                <Text style={styles.skipLinkText}>Skip · Enter manually</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── ANALYZING STEP ── */}
          {step === 'analyzing' && (
            <>
              <Text style={styles.title}>Analyzing...</Text>
              {capturedUri && (
                <Image source={{ uri: capturedUri }} style={styles.preview} resizeMode="cover" />
              )}
              <ActivityIndicator color="#1e90ff" size="large" style={{ marginVertical: 20 }} />
              <Text style={styles.subtitle}>Claude is reading your fish finder</Text>
            </>
          )}

          {/* ── REVIEW STEP ── */}
          {step === 'review' && (
            <>
              <Text style={styles.title}>Fish Finder</Text>
              <Text style={styles.subtitle}>
                {scanError ? scanError : 'Review and confirm the parsed values'}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Water Temp (°C)</Text>
                    <TextInput style={styles.input} value={waterTemp} onChangeText={setWaterTemp}
                      placeholder="e.g. 14.5" placeholderTextColor="#4a5f7a" keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Depth (ft)</Text>
                    <TextInput style={styles.input} value={depth} onChangeText={setDepth}
                      placeholder="e.g. 120" placeholderTextColor="#4a5f7a" keyboardType="decimal-pad" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Speed Over Ground (mph)</Text>
                    <TextInput style={styles.input} value={speedOverGround} onChangeText={setSpeedOverGround}
                      placeholder="e.g. 2.5" placeholderTextColor="#4a5f7a" keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Course Over Ground (°)</Text>
                    <TextInput style={styles.input} value={courseOverGround} onChangeText={setCourseOverGround}
                      placeholder="e.g. 270" placeholderTextColor="#4a5f7a" keyboardType="decimal-pad" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Heading (°)</Text>
                    <TextInput style={styles.input} value={heading} onChangeText={setHeading}
                      placeholder="e.g. 265" placeholderTextColor="#4a5f7a" keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Bait On Screen</Text>
                    <View style={styles.chipRow}>
                      <TouchableOpacity
                        style={[styles.chip, baitOnScreen === true && styles.chipSelected]}
                        onPress={() => setBaitOnScreen(baitOnScreen === true ? null : true)}
                      >
                        <Text style={[styles.chipText, baitOnScreen === true && styles.chipTextSelected]}>Yes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.chip, baitOnScreen === false && styles.chipSelected]}
                        onPress={() => setBaitOnScreen(baitOnScreen === false ? null : false)}
                      >
                        <Text style={[styles.chipText, baitOnScreen === false && styles.chipTextSelected]}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

              </ScrollView>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#122040',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    maxHeight: '85%',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8899aa',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: '#3a1b1b',
    borderWidth: 1,
    borderColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff5252',
    fontSize: 13,
    textAlign: 'center',
  },
  captureButton: {
    backgroundColor: '#e65100',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  captureIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  captureText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipLinkText: {
    color: '#8899aa',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  halfField: {
    flex: 1,
  },
  label: {
    color: '#8899aa',
    fontSize: 11,
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
    padding: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  skipText: {
    color: '#8899aa',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#e65100',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
