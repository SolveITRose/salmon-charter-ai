import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { parseCatchFromTranscript, ParsedCatchFields } from '../agents/catchParser';

interface Props {
  onFill: (fields: ParsedCatchFields) => void;
}

type Status = 'idle' | 'listening' | 'parsing' | 'done' | 'error';

export default function VoiceCatchInput({ onFill }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [fillCount, setFillCount] = useState(0);
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    const r = event.results?.[0];
    const t = r?.transcript ?? (r as any)?.[0]?.transcript ?? '';
    setTranscript(t);
    transcriptRef.current = t;
  });

  useSpeechRecognitionEvent('end', async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    const t = transcriptRef.current;
    if (!t) { setStatus('idle'); return; }
    setStatus('parsing');
    try {
      const fields = await parseCatchFromTranscript(t);
      const count = Object.values(fields).filter(v => v !== undefined).length;
      setFillCount(count);
      onFill(fields);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  });

  useSpeechRecognitionEvent('error', () => {
    listeningRef.current = false;
    setStatus('error');
  });

  const start = async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Microphone access is needed for voice logging.');
      return;
    }
    setTranscript('');
    transcriptRef.current = '';
    listeningRef.current = true;
    setStatus('listening');
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
  };

  const stop = () => ExpoSpeechRecognitionModule.stop();
  const reset = () => {
    setStatus('idle');
    setTranscript('');
    transcriptRef.current = '';
    listeningRef.current = false;
  };

  if (status === 'idle') return (
    <TouchableOpacity style={styles.button} onPress={start} activeOpacity={0.8}>
      <Text style={styles.icon}>🎙️</Text>
      <Text style={styles.buttonLabel}>Speak catch details</Text>
      <Text style={styles.buttonHint}>Species · depth · lure · speed</Text>
    </TouchableOpacity>
  );

  if (status === 'listening') return (
    <TouchableOpacity style={[styles.button, styles.buttonActive]} onPress={stop} activeOpacity={0.8}>
      <Text style={styles.icon}>⏹️</Text>
      <Text style={[styles.buttonLabel, styles.labelActive]}>Listening — tap to stop</Text>
      {transcript ? <Text style={styles.liveText}>{transcript}</Text> : null}
    </TouchableOpacity>
  );

  if (status === 'parsing') return (
    <View style={styles.statusRow}>
      <ActivityIndicator color="#1e90ff" size="small" />
      <Text style={styles.statusText}>Filling form…</Text>
    </View>
  );

  if (status === 'done') return (
    <View style={styles.doneRow}>
      <Text style={styles.doneText}>✓ Filled {fillCount} field{fillCount !== 1 ? 's' : ''} — review below</Text>
      <TouchableOpacity onPress={reset}>
        <Text style={styles.redoText}>Redo</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TouchableOpacity style={styles.errorRow} onPress={reset} activeOpacity={0.8}>
      <Text style={styles.errorText}>Speech unavailable — tap to retry</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0d1f35',
    borderWidth: 1,
    borderColor: '#1e90ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonActive: {
    borderColor: '#ff5252',
    backgroundColor: '#1a0808',
  },
  icon: { fontSize: 28, marginBottom: 6 },
  buttonLabel: { color: '#1e90ff', fontSize: 15, fontWeight: '600' },
  labelActive: { color: '#ff5252' },
  buttonHint: { color: '#4a6a8a', fontSize: 12, marginTop: 3 },
  liveText: {
    color: '#ccd6e8', fontSize: 13, marginTop: 10,
    textAlign: 'center', lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, justifyContent: 'center',
  },
  statusText: { color: '#8899aa', fontSize: 14 },
  doneRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12,
  },
  doneText: { color: '#00c853', fontSize: 14, fontWeight: '600' },
  redoText: { color: '#8899aa', fontSize: 13 },
  errorRow: { paddingVertical: 12, alignItems: 'center' },
  errorText: { color: '#ff5252', fontSize: 13 },
});
